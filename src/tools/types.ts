/**
 * Monitoring tool definitions
 * These tools are exposed to the AI agent for system monitoring
 */

export interface SystemMetrics {
  timestamp: number;
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics[];
  network: NetworkMetrics;
  load: LoadMetrics;
}

export interface CpuMetrics {
  usage: number; // percentage
  cores: number;
  speed: number; // GHz
  manufacturer: string;
  brand: string;
  currentLoad: number;
}

export interface MemoryMetrics {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  active: number; // bytes
  available: number; // bytes
  swapTotal: number; // bytes
  swapUsed: number; // bytes
  usagePercent: number;
}

export interface DiskMetrics {
  fs: string;
  mount: string;
  type: string;
  size: number; // bytes
  used: number; // bytes
  available: number; // bytes
  usagePercent: number;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  connections: number;
  connectionsByState: Record<string, number>;
}

export interface NetworkInterface {
  name: string;
  ip4: string;
  ip6: string;
  mac: string;
  operState: string;
}

export interface LoadMetrics {
  avg1: number;
  avg5: number;
  avg15: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number; // percentage
  mem: number; // percentage
  priority: number;
  state: string;
  user: string;
  command: string;
  startTime: number;
}

export interface ServiceStatus {
  name: string;
  running: boolean;
  enabled: boolean;
  pid?: number;
  memory?: number;
  uptime?: number;
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}
