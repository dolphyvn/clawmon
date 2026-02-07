/**
 * AI Agent types
 */

export interface AgentConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalysisResult {
  issues: Issue[];
  recommendations: Recommendation[];
  actions: Action[];
  severity: 'info' | 'warning' | 'critical';
  summary: string;
}

export interface Issue {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  node: string;
  description: string;
  evidence?: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  reason: string;
  node?: string;
}

export interface Action {
  type: 'notify' | 'remediate' | 'escalate';
  tool?: string;
  params?: Record<string, unknown>;
  reason: string;
}
