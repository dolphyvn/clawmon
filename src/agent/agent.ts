/**
 * AI Agent - analyzes metrics and decides actions
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig, ToolDefinition, AnalysisResult, Issue, Recommendation, Action } from './types.js';

const MONITORING_TOOLS: ToolDefinition[] = [
  {
    name: 'get_system_metrics',
    description: 'Get comprehensive system metrics including CPU, memory, disk, and network usage for a specific node',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'The ID of the node to query',
        },
      },
    },
  },
  {
    name: 'get_processes',
    description: 'Get list of running processes sorted by CPU or memory usage',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        limit: { type: 'number', default: 20 },
        sort: { type: 'string', enum: ['cpu', 'mem'], default: 'cpu' },
      },
    },
  },
  {
    name: 'get_service_status',
    description: 'Check if a service is running on a specific node',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        service: { type: 'string' },
      },
      required: ['nodeId', 'service'],
    },
  },
  {
    name: 'restart_service',
    description: 'Restart a failing service. Use only when confident it will help.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        service: { type: 'string' },
        reason: { type: 'string', description: 'Why this restart is necessary' },
      },
      required: ['nodeId', 'service', 'reason'],
    },
  },
  {
    name: 'kill_process',
    description: 'Terminate a runaway process. Use as last resort.',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        pid: { type: 'number' },
        reason: { type: 'string', description: 'Why this process must be killed' },
      },
      required: ['nodeId', 'pid', 'reason'],
    },
  },
  {
    name: 'tail_logs',
    description: 'Read recent log entries to diagnose issues',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        path: { type: 'string' },
        lines: { type: 'number', default: 100 },
        filter: { type: 'string' },
      },
      required: ['nodeId', 'path'],
    },
  },
  {
    name: 'check_port',
    description: 'Check if a network port is open',
    input_schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        host: { type: 'string', default: 'localhost' },
        port: { type: 'number' },
      },
      required: ['nodeId', 'port'],
    },
  },
];

const ANALYSIS_PROMPT = `You are an expert systems monitoring and operations AI. Your role is to:

1. Analyze system metrics from one or more nodes
2. Identify issues, anomalies, or potential problems
3. Determine severity (info/warning/critical)
4. Recommend actions
5. Decide on remediation OR notification

Guidelines:
- Be proactive but cautious - don't restart critical services without clear evidence it will help
- Context matters - high CPU during a backup is different from high CPU when idle
- Escalate when uncertain - human operators should make tough calls
- Provide evidence for your conclusions
- Consider cascading effects (e.g., disk full causes database crashes)

Response format:
Return a JSON object with:
{
  "issues": [
    {
      "type": "cpu|memory|disk|network|service|process",
      "severity": "info|warning|critical",
      "node": "node-id",
      "description": "Human-readable explanation",
      "evidence": "Supporting data"
    }
  ],
  "recommendations": [
    {
      "priority": 1-10,
      "action": "Description of recommended action",
      "reason": "Why this action is recommended",
      "node": "node-id (optional)"
    }
  ],
  "actions": [
    {
      "type": "notify|remediate|escalate",
      "tool": "tool_name (if remediate)",
      "params": {},
      "reason": "Why this action"
    }
  ],
  "severity": "info|warning|critical",
  "summary": "Brief summary of the overall state"
}

Consider historical context and patterns when available. Distinguish between transient spikes and sustained problems.`;

export class Agent {
  private client: Anthropic;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;

    if (config.provider === 'anthropic') {
      this.client = new Anthropic({ apiKey: config.apiKey });
    } else {
      throw new Error('OpenAI provider not yet implemented');
    }
  }

  /**
   * Analyze cluster metrics and determine actions
   */
  async analyzeCluster(context: {
    nodes: Array<{ id: string; name: string; hostname: string }>;
    metrics: Map<string, unknown>;
    recentAlerts?: Array<{ time: number; message: string }>;
  }): Promise<AnalysisResult> {
    const contextText = this.buildContextString(context);

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `${ANALYSIS_PROMPT}\n\nCurrent cluster state:\n${contextText}\n\nAnalyze this state and return your assessment in JSON format.`,
      },
    ];

    try {
      const response = await this.client.messages.create({
        model: this.config.model ?? 'claude-3-5-sonnet-20241022',
        max_tokens: this.config.maxTokens ?? 4096,
        temperature: this.config.temperature ?? 0,
        messages,
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseAnalysisResult(content.text);
      }

      throw new Error('Unexpected response type from API');
    } catch (error) {
      console.error('Agent analysis failed:', error);
      return {
        issues: [],
        recommendations: [],
        actions: [{
          type: 'notify',
          reason: 'Agent analysis failed - manual review required',
        }],
        severity: 'warning',
        summary: 'Analysis failed - check agent configuration',
      };
    }
  }

  /**
   * Execute a tool with proper context
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    execute: (nodeId: string, tool: string, params: Record<string, unknown>) => Promise<unknown>
  ): Promise<unknown> {
    const nodeId = params.nodeId as string | undefined;
    if (!nodeId) {
      throw new Error('nodeId is required for tool execution');
    }

    return execute(nodeId, toolName, params);
  }

  /**
   * Get available tools for the agent
   */
  getTools(): ToolDefinition[] {
    return MONITORING_TOOLS;
  }

  /**
   * Get explanation for a decision
   */
  async explainDecision(
    action: Action,
    context: Record<string, unknown>
  ): Promise<string> {
    const prompt = `Explain why this action is appropriate given the context:

Action: ${JSON.stringify(action)}

Context:
${JSON.stringify(context, null, 2)}

Provide a clear, concise explanation for human operators.`;

    try {
      const response = await this.client.messages.create({
        model: this.config.model ?? 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      return action.reason;
    } catch {
      return action.reason;
    }
  }

  /**
   * Format analysis for alerts
   */
  formatAlert(analysis: AnalysisResult): string {
    const parts: string[] = [];

    parts.push(`🔍 Cluster Status: ${analysis.severity.toUpperCase()}`);
    parts.push('');

    if (analysis.issues.length > 0) {
      parts.push('**Issues Detected:**');
      for (const issue of analysis.issues) {
        const emoji = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        parts.push(`${emoji} ${issue.node}: ${issue.description}`);
        if (issue.evidence) {
          parts.push(`   _Evidence: ${issue.evidence}_`);
        }
      }
      parts.push('');
    }

    if (analysis.recommendations.length > 0) {
      parts.push('**Recommendations:**');
      for (const rec of analysis.recommendations.slice(0, 5)) {
        parts.push(`${rec.priority}. ${rec.action}`);
        if (rec.reason) {
          parts.push(`   _${rec.reason}_`);
        }
      }
      parts.push('');
    }

    parts.push(`**Summary:** ${analysis.summary}`);

    return parts.join('\n');
  }

  private buildContextString(context: {
    nodes: Array<{ id: string; name: string; hostname: string }>;
    metrics: Map<string, unknown>;
    recentAlerts?: Array<{ time: number; message: string }>;
  }): string {
    const parts: string[] = [];

    parts.push(`**Nodes (${context.nodes.length}):**`);
    for (const node of context.nodes) {
      parts.push(`  - ${node.name} (${node.id})`);
      const metrics = context.metrics.get(node.id);
      if (metrics) {
        parts.push(`    ${JSON.stringify(metrics, null, 2).split('\n').join('\n    ')}`);
      }
    }

    if (context.recentAlerts && context.recentAlerts.length > 0) {
      parts.push('');
      parts.push('**Recent Alerts:**');
      for (const alert of context.recentAlerts.slice(-5)) {
        const time = new Date(alert.time).toLocaleTimeString();
        parts.push(`  [${time}] ${alert.message}`);
      }
    }

    return parts.join('\n');
  }

  private parseAnalysisResult(text: string): AnalysisResult {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
                      text.match(/(\{[\s\S]*?\})/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          issues: parsed.issues ?? [],
          recommendations: parsed.recommendations ?? [],
          actions: parsed.actions ?? [],
          severity: parsed.severity ?? 'info',
          summary: parsed.summary ?? '',
        };
      } catch {
        // Fall through to default
      }
    }

    // Default response if parsing fails
    return {
      issues: [],
      recommendations: [],
      actions: [{ type: 'notify', reason: 'Unable to parse agent response - review logs' }],
      severity: 'warning',
      summary: 'Analysis incomplete - see raw response',
    };
  }
}
