#!/usr/bin/env node
/**
 * ClawMon CLI - supports multiple LLM providers
 */

import { program } from 'commander';
import { Gateway } from './gateway/gateway.js';
import { Node } from './node/node.js';
import { Agent } from './agent/agent.js';
import { ChannelManager } from './channels/channels.js';
import { CronScheduler, createHealthCheckJob } from './cron/scheduler.js';
import { loadConfig, ensureApiKey, getProviderConfig } from './config/config.js';
import { getProviderInfo } from './agent/providers.js';
import type { LLMProvider } from './agent/types.js';

const VALID_PROVIDERS: LLMProvider[] = [
  'anthropic',
  'openai',
  'ollama',
  'open-webui',
  'groq',
  'together',
  'deepseek',
  'google',
];

program.name('clawmon').description('AI-first distributed monitoring system').version('0.2.0');

program
  .command('gateway')
  .description('Start the master gateway')
  .option('-p, --port <number>', 'Port to listen on', '18790')
  .option('-b, --bind <address>', 'Address to bind to', '0.0.0.0')
  .option('--provider <provider>', `LLM provider (${VALID_PROVIDERS.join(', ')})`)
  .option('--model <model>', 'Model name')
  .option('--list-providers', 'List available LLM providers')
  .action(async (options) => {
    if (options.listProviders) {
      listProviders();
      return;
    }

    const config = await loadConfig();

    // Override provider from command line or env var
    const provider = (options.provider || process.env.CLAWMON_PROVIDER || config.agent.provider) as LLMProvider;
    const providerConfig = options.provider || process.env.CLAWMON_PROVIDER
      ? getProviderConfig(provider)
      : config.agent;

    // Override model if specified
    if (options.model) {
      (providerConfig as any).model = options.model;
    }

    // Ensure API key for providers that need it
    try {
      ensureApiKey(providerConfig);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      console.error('\nTo use this provider, either:');
      console.error('  1. Set it in ~/.clawmon/config.json');
      console.error('  2. Set the appropriate environment variable');
      console.error('\nAvailable providers:');
      listProviders();
      process.exit(1);
    }

    const gateway = new Gateway({
      port: parseInt(options.port),
      bind: options.bind,
    });

    const agent = new Agent(providerConfig);
    const channels = new ChannelManager(config.channels);
    const scheduler = new CronScheduler();
    const recentAlerts: Array<{ time: number; message: string }> = [];

    // Alert cooldown tracking
    const lastAlertTime = new Map<string, number>();
    const cooldownMs = config.monitoring?.alertCooldown ?? 300000;

    // Health check job
    const healthCheckJob = createHealthCheckJob(async () => {
      const nodes = gateway.getNodes();
      if (nodes.length === 0) {
        console.log('No nodes connected');
        return;
      }

      console.log(`Running health check for ${nodes.length} nodes...`);

      // Collect metrics from all nodes
      const metrics = new Map<string, unknown>();

      for (const node of nodes) {
        try {
          const invocation = await gateway.invokeTool(node.id, 'get_system_metrics', {});
          if (invocation.status === 'completed' && invocation.result) {
            const result = invocation.result as { data?: unknown };
            metrics.set(node.id, result.data);
          }
        } catch (error) {
          console.error(`Failed to get metrics from ${node.id}:`, error);
        }
      }

      // Let the agent analyze
      const analysis = await agent.analyzeCluster({
        nodes,
        metrics,
        recentAlerts,
      });

      console.log('Analysis result:', analysis.summary);

      // Send notification if there are issues
      if (analysis.issues.length > 0 || analysis.severity !== 'info') {
        const alertKey = analysis.issues.map((i) => `${i.type}-${i.node}`).join('|');

        const lastAlert = lastAlertTime.get(alertKey);
        const now = Date.now();

        if (!lastAlert || now - lastAlert > cooldownMs) {
          const message = agent.formatAlert(analysis);
          const sendMethod = analysis.severity === 'critical' ? 'sendCritical' : 'sendWarning';
          await channels[sendMethod](
            'Cluster Alert',
            message,
            { nodes: nodes.length, issues: analysis.issues.length, provider }
          );

          recentAlerts.push({ time: now, message: analysis.summary });
          lastAlertTime.set(alertKey, now);

          while (recentAlerts.length > 100) {
            recentAlerts.shift();
          }
        }
      }

      // Execute recommended actions (with caution)
      for (const action of analysis.actions) {
        if (action.type === 'remediate' && action.tool && action.params) {
          console.log(`Executing remediation: ${action.tool} on ${action.params.nodeId}`);
          console.log(`Reason: ${action.reason}`);

          try {
            const nodeId = action.params.nodeId as string;
            await gateway.invokeTool(nodeId, action.tool, action.params);

            await channels.sendInfo(
              'Remediation Executed',
              `${action.tool} on ${nodeId}\nReason: ${action.reason}`
            );
          } catch (error) {
            console.error('Remediation failed:', error);
          }
        }
      }
    }, config.monitoring?.checkInterval ?? 60000);

    scheduler.addJob(healthCheckJob);

    // Handle node events
    gateway.on('nodeEvent', (data: unknown) => {
      console.log('Node event:', data);
    });

    gateway.on('nodeDisconnect', (data: unknown) => {
      const { nodeId } = data as { nodeId: string };
      channels.sendWarning('Node Disconnected', `Node ${nodeId} has disconnected`);
    });

    gateway.start();
    scheduler.start();

    const providerInfo = getProviderInfo(provider);
    console.log('Gateway started with monitoring agent');
    console.log(`  Provider: ${providerInfo.name} (${provider})`);
    console.log(`  Model: ${providerConfig.model || providerInfo.defaultModel}`);
    console.log(`  Health check interval: ${config.monitoring?.checkInterval}ms`);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down gateway...');
      scheduler.stop();
      gateway.stop();
      process.exit(0);
    });
  });

program
  .command('node')
  .description('Start a worker node')
  .option('-h, --host <address>', 'Gateway host', 'localhost')
  .option('-p, --port <number>', 'Gateway port', '18790')
  .option('-n, --name <name>', 'Node name')
  .action(async (options) => {
    const config = await loadConfig();

    const nodeConfig = {
      host: options.host,
      port: parseInt(options.port),
      name: options.name || config.node?.name,
    };

    const node = new Node(nodeConfig);

    console.log(`Starting node: ${nodeConfig.name || 'unnamed'}`);
    console.log(`Connecting to gateway at ${nodeConfig.host}:${nodeConfig.port}`);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down node...');
      node.disconnect();
      process.exit(0);
    });

    await node.start();
  });

program
  .command('status')
  .description('Query cluster status')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const config = await loadConfig();

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('ClawMon Configuration:');
      console.log(`  Gateway: ${config.node?.gatewayHost}:${config.node?.gatewayPort}`);
      console.log(`  Agent Provider: ${config.agent.provider}`);
      console.log(`  Agent Model: ${config.agent.model}`);
      console.log(`  Check Interval: ${config.monitoring?.checkInterval}ms`);
    }
  });

program
  .command('providers')
  .description('List available LLM providers')
  .action(() => {
    listProviders();
  });

program
  .command('check')
  .description('Run a one-time health check')
  .option('-h, --host <address>', 'Gateway host', 'localhost')
  .option('-p, --port <number>', 'Gateway port', '18790')
  .action(async (options) => {
    const WebSocket = await import('ws');
    const host = options.host;
    const port = parseInt(options.port);

    const ws = new WebSocket.default(`ws://${host}:${port}`);

    ws.on('open', () => {
      console.log('Connected to gateway');
    });

    ws.on('message', (data) => {
      console.log('Received:', data.toString());
    });

    ws.on('close', () => {
      console.log('Connection closed');
      process.exit(0);
    });

    ws.on('error', (error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
  });

function listProviders(): void {
  console.log('\nAvailable LLM Providers:\n');

  for (const provider of VALID_PROVIDERS) {
    const info = getProviderInfo(provider);
    const required = info.requiresApiKey ? 'Required' : 'Optional';
    console.log(`  ${provider.padEnd(15)} - ${info.name}`);
    console.log(`  `.padEnd(15) + `Default: ${info.defaultModel}`);
    console.log(`  `.padEnd(15) + `API Key: ${required}`);
    console.log(`  `.padEnd(15) + `Base URL: ${info.defaultBaseUrl}`);
    console.log('');
  }

  console.log('\nEnvironment Variables:\n');
  console.log('  CLAWMON_PROVIDER      - Default provider to use');
  console.log('  ANTHROPIC_API_KEY      - Anthropic API key');
  console.log('  OPENAI_API_KEY        - OpenAI API key');
  console.log('  OLLAMA_BASE_URL       - Ollama server URL (default: http://127.0.0.1:11434)');
  console.log('  OLLAMA_MODEL          - Default Ollama model');
  console.log('  OPEN_WEBUI_BASE_URL   - Open WebUI URL (default: http://localhost:3000)');
  console.log('  GROQ_API_KEY          - Groq API key');
  console.log('  TOGETHER_API_KEY      - Together AI API key');
  console.log('  DEEPSEEK_API_KEY      - DeepSeek API key');
  console.log('  GOOGLE_API_KEY        - Google Gemini API key');
  console.log('');
}

program.parse();
