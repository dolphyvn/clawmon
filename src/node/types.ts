/**
 * Node client types
 */

export interface NodeConfig {
  host: string;
  port: number;
  name?: string;
  reconnectInterval?: number;
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
}
