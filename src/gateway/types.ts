/**
 * Gateway types and protocol definitions
 */

export interface GatewayConfig {
  port: number;
  bind: string;
}

export interface NodeInfo {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  arch: string;
  connectedAt: number;
  lastSeen: number;
  capabilities: string[];
}

export interface NodeMessage {
  type: 'register' | 'heartbeat' | 'response' | 'event';
  nodeId?: string;
  timestamp: number;
  data: unknown;
}

export interface GatewayMessage {
  type: 'ping' | 'invoke' | 'broadcast';
  timestamp: number;
  tool?: string;
  params?: Record<string, unknown>;
  targetNode?: string;
}

export interface ToolInvocation {
  id: string;
  nodeId: string;
  tool: string;
  params: Record<string, unknown>;
  timestamp: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface ClusterState {
  nodes: Map<string, NodeInfo>;
  pendingInvocations: Map<string, ToolInvocation>;
}
