/**
 * ClawMon - AI-first distributed monitoring system
 */

export { Gateway } from './gateway/gateway.js';
export { Node } from './node/node.js';
export { Agent } from './agent/agent.js';
export { ChannelManager, ConsoleChannel, SlackChannel } from './channels/channels.js';
export { CronScheduler, createHealthCheckJob, createDailyReportJob } from './cron/scheduler.js';
export { loadConfig, getProviderConfig, ensureApiKey } from './config/config.js';
export { systemTools } from './tools/system.js';

// Provider exports
export { callProvider, discoverOllamaModels, discoverOpenWebUIModels, getProviderInfo } from './agent/providers.js';

export type {
  GatewayConfig,
  NodeInfo,
  NodeMessage,
  GatewayMessage,
  ToolInvocation,
  ClusterState,
} from './gateway/types.js';

export type {
  NodeConfig,
  NodeMessage as NodeClientMessage,
  GatewayMessage as GatewayClientMessage,
} from './node/types.js';

export type {
  AgentConfig,
  ToolDefinition,
  AnalysisResult,
  Issue,
  Recommendation,
  Action,
  AgentMessage,
} from './agent/types.js';

export type {
  LLMProvider,
  AnyProviderConfig,
  AnthropicConfig,
  OpenAIConfig,
  OllamaConfig,
  OpenWebUIConfig,
  GroqConfig,
  TogetherConfig,
  DeepSeekConfig,
  GoogleConfig,
  ChatMessage,
  ChatResponse,
  ProviderResponse,
} from './agent/types.js';

export type {
  ChannelConfig,
  Notification,
  Channel,
  SlackConfig,
  ConsoleConfig,
  TelegramConfig,
} from './channels/types.js';

export type {
  CronConfig,
  ScheduledJob,
  JobResult,
} from './cron/types.js';

export type {
  SystemMetrics,
  CpuMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkMetrics,
  LoadMetrics,
  ProcessInfo,
  ServiceStatus,
  LogEntry,
  ToolResult,
} from './tools/types.js';

export type { ClawMonConfig } from './config/config.js';
