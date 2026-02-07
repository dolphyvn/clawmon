#!/usr/bin/env node
/**
 * ClawMon CLI
 */

import { program } from 'commander';
import { Gateway } from './gateway/gateway.js';
import { Node } from './node/node.js';
import { loadConfig } from './config/config.js';
import { Agent } from './agent/agent.js';
import { ChannelManager } from './channels/channels.js';
import { CronScheduler, createHealthCheckJob, createDailyReportJob } from './cron/scheduler.js';

program.name('clawmon').description('AI-first distributed monitoring system').version('0.1.0');

program
  .command('gateway')
  .description('Start the master gateway')
  .option('-p, --port <number>', 'Port to listen on', '18790')
  .option('-b, --bind <address>', 'Address to bind to', '0.0.0.0')
  .action(async (options) => {
    const config = await loadConfig();

    const gateway = new Gateway({
      port: parseInt(options.port),
      bind: options.bind,
    });

    const agent = new Agent(config.agent);
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
          await channels[analysis.severity === 'critical' ? 'sendCritical' : 'sendWarning'](
            'Cluster Alert',
            message,
            { nodes: nodes.length, issues: analysis.issues.length }
          );

          recentAlerts.push({ time: now, message: analysis.summary });
          lastAlertTime.set(alertKey, now);

          // Keep only last 100 alerts
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

    // Optional daily report
    if (config.channels.slack?.webhookUrl) {
      const dailyReportJob = createDailyReportJob(async () => {
        const nodes = gateway.getNodes();
        await channels.sendInfo(
          'Daily Cluster Report',
          `Cluster has ${nodes.length} nodes connected.\nAll systems operational.`,
          { nodes: nodes.map((n) => ({ id: n.id, name: n.name })) }
        );
      }, 9);
      scheduler.addJob(dailyReportJob);
    }

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

    console.log('Gateway started with AI agent and monitoring');

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

    // For now, just print config info
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

program.parse();
