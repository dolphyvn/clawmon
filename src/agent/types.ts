/**
 * AI Agent types - supports multiple LLM providers
 */

export type LLMProvider =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'open-webui'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'google';

export interface AgentConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
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

// Provider-specific types
export interface AnthropicConfig {
  provider: 'anthropic';
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface OpenAIConfig {
  provider: 'openai';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface OllamaConfig {
  provider: 'ollama';
  baseUrl?: string;
  model?: string;
  numCtx?: number;
  numPredict?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface OpenWebUIConfig {
  provider: 'open-webui';
  baseUrl: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GroqConfig {
  provider: 'groq';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface TogetherConfig {
  provider: 'together';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface DeepSeekConfig {
  provider: 'deepseek';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GoogleConfig {
  provider: 'google';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export type AnyProviderConfig =
  | AnthropicConfig
  | OpenAIConfig
  | OllamaConfig
  | OpenWebUIConfig
  | GroqConfig
  | TogetherConfig
  | DeepSeekConfig
  | GoogleConfig;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ProviderResponse {
  success: boolean;
  data?: ChatResponse;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
