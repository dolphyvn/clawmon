/**
 * System monitoring tools
 * Collects CPU, memory, disk, and network metrics
 */

import si from 'systeminformation';
import type { SystemMetrics, ToolResult } from './types.js';

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [cpu, mem, osInfo, currentLoadData, size, networkStats, networkInterfaces] =
    await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.currentLoad(),
      si.fsSize(),
      si.networkStats(),
      si.networkInterfaces(),
    ]);

  const disks = size.map((d: any) => ({
    fs: d.fs,
    mount: d.mount,
    type: d.type,
    size: d.size,
    used: d.used,
    available: d.available,
    usagePercent: d.use,
  }));

  const ifaceMap = new Map(
    (networkInterfaces as any[]).map((i: any) => [i.iface, i])
  );
  const networks = networkStats.map((s: any) => ({
    name: s.iface,
    ip4: ifaceMap.get(s.iface)?.ip4 || '',
    ip6: ifaceMap.get(s.iface)?.ip6 || '',
    mac: ifaceMap.get(s.iface)?.mac || '',
    operState: ifaceMap.get(s.iface)?.operstate || 'unknown',
  }));

  // Get load average from os module
  const osLoad = await import('os').then((m) => m.loadavg());

  return {
    timestamp: Date.now(),
    hostname: osInfo.hostname,
    platform: osInfo.platform,
    arch: osInfo.arch,
    uptime: (osInfo as any).uptime || 0,
    cpu: {
      usage: currentLoadData.currentLoad,
      cores: cpu.cores,
      speed: cpu.speed,
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      currentLoad: currentLoadData.currentLoad,
    },
    memory: {
      total: mem.total,
      used: mem.active,
      free: mem.available,
      active: mem.active,
      available: mem.available,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
      usagePercent: (mem.active / mem.total) * 100,
    },
    disk: disks,
    network: {
      interfaces: networks,
      connections: 0,
      connectionsByState: {},
    },
    load: {
      avg1: osLoad[0],
      avg5: osLoad[1],
      avg15: osLoad[2],
    },
  };
}

export async function getCurrentLoad(): Promise<{ currentLoad: number; cpus: number[] }> {
  const load = await si.currentLoad();
  return {
    currentLoad: load.currentLoad,
    cpus: load.cpus.map((c: any) => c.load),
  };
}

export async function getProcesses(
  limit: number = 20,
  sort: 'cpu' | 'mem' = 'cpu'
): Promise<ToolResult> {
  try {
    const processes = await si.processes();
    let list = processes.list;

    // Sort by requested field
    if (sort === 'cpu') {
      list = list.sort((a: any, b: any) => b.cpu - a.cpu);
    } else {
      list = list.sort((a: any, b: any) => b.mem - a.mem);
    }

    // Take top N
    list = list.slice(0, limit);

    return {
      success: true,
      data: {
        all: processes.all,
        running: processes.running,
        blocked: processes.blocked,
        sleeping: processes.sleeping,
        list: list.map((p: any) => ({
          pid: p.pid,
          name: p.name,
          cpu: p.cpu,
          mem: p.mem,
          priority: p.priority,
          state: p.state,
          user: p.user,
          command: p.command,
          startTime: p.started,
        })),
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function getServiceStatus(serviceName: string): Promise<ToolResult> {
  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    try {
      const { stdout } = await execAsync(`systemctl is-active ${serviceName}`);
      const isActive = stdout.trim() === 'active';

      const enabledResult = await execAsync(`systemctl is-enabled ${serviceName}`);
      const isEnabled = !enabledResult.stdout.trim().includes('disabled');

      let pid: number | undefined;
      let memory: number | undefined;

      if (isActive) {
        try {
          const statusResult = await execAsync(
            `systemctl show ${serviceName} --property MainPID,MemoryCurrent`
          );
          const lines = statusResult.stdout.trim().split('\n');
          for (const line of lines) {
            if (line.startsWith('MainPID=')) {
              const p = parseInt(line.split('=')[1]);
              if (p > 0) pid = p;
            }
            if (line.startsWith('MemoryCurrent=')) {
              const m = parseInt(line.split('=')[1]);
              if (m > 0) memory = m;
            }
          }
        } catch {
          // Ignore property fetch errors
        }
      }

      return {
        success: true,
        data: {
          name: serviceName,
          running: isActive,
          enabled: isEnabled,
          pid,
          memory,
        },
        timestamp: Date.now(),
      };
    } catch (systemdError) {
      // Try launchctl (macOS)
      try {
        const { stdout } = await execAsync(`launchctl list | grep ${serviceName}`);
        const isRunning = stdout.trim().length > 0;

        return {
          success: true,
          data: {
            name: serviceName,
            running: isRunning,
            enabled: isRunning,
          },
          timestamp: Date.now(),
        };
      } catch {
        return {
          success: false,
          error: `Service '${serviceName}' not found or cannot be checked`,
          timestamp: Date.now(),
        };
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function restartService(serviceName: string): Promise<ToolResult> {
  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    // Detect platform
    const platform = process.platform;

    let command: string;
    if (platform === 'linux') {
      command = `sudo systemctl restart ${serviceName}`;
    } else if (platform === 'darwin') {
      command = `sudo launchctl kickstart -k system/${serviceName}`;
    } else {
      return {
        success: false,
        error: `Unsupported platform: ${platform}`,
        timestamp: Date.now(),
      };
    }

    const { stdout, stderr } = await execAsync(command);

    return {
      success: true,
      data: {
        service: serviceName,
        command,
        output: stdout || stderr,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function killProcess(pid: number, signal: string = 'TERM'): Promise<ToolResult> {
  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    const { stdout } = await execAsync(`kill -${signal} ${pid}`);

    return {
      success: true,
      data: {
        pid,
        signal,
        output: stdout,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function tailLogs(
  path: string,
  lines: number = 50,
  filter?: string
): Promise<ToolResult> {
  try {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    let command = `tail -n ${lines} ${JSON.stringify(path)}`;
    if (filter) {
      command += ` | grep ${JSON.stringify(filter)}`;
    }

    const { stdout, stderr } = await execAsync(command);

    return {
      success: true,
      data: {
        path,
        lines: stdout.trim().split('\n'),
        filter,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function checkPort(host: string, port: number): Promise<ToolResult> {
  try {
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          error: `Connection to ${host}:${port} timed out`,
          timestamp: Date.now(),
        });
      }, 5000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({
          success: true,
          data: {
            host,
            port,
            status: 'open',
          },
          timestamp: Date.now(),
        });
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve({
          success: false,
          data: {
            host,
            port,
            status: 'closed',
          },
          timestamp: Date.now(),
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

export async function getNetworkConnections(): Promise<ToolResult> {
  try {
    const connections = await si.networkConnections();

    // Group by state
    const byState: Record<string, number> = {};
    for (const conn of connections) {
      byState[conn.state] = (byState[conn.state] || 0) + 1;
    }

    return {
      success: true,
      data: {
        total: connections.length,
        byState,
        connections: connections.slice(0, 100).map((c: any) => ({
          protocol: c.protocol,
          localAddress: c.localAddress || c.localaddress,
          localPort: c.localPort || c.localport,
          remoteAddress: c.peerAddress || c.peeraddress,
          remotePort: c.peerPort || c.peerport,
          state: c.state,
          pid: c.pid,
          process: c.process,
        })),
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}

// Export all tool definitions for the agent
export const systemTools = {
  get_system_metrics: {
    name: 'get_system_metrics',
    description:
      'Get comprehensive system metrics including CPU, memory, disk, and network usage',
    parameters: {},
    handler: async () => {
      const metrics = await getSystemMetrics();
      return {
        success: true,
        data: metrics,
        timestamp: Date.now(),
      };
    },
  },

  get_processes: {
    name: 'get_processes',
    description: 'Get list of running processes sorted by CPU or memory usage',
    parameters: {
      limit: { type: 'number', default: 20, description: 'Number of processes to return' },
      sort: { type: 'string', default: 'cpu', description: 'Sort by "cpu" or "mem"' },
    },
    handler: async (params: any) => {
      const limit = params.limit ?? 20;
      const sort = params.sort ?? 'cpu';
      return getProcesses(limit, sort);
    },
  },

  get_service_status: {
    name: 'get_service_status',
    description: 'Check if a systemd/launchctl service is running',
    parameters: {
      service: { type: 'string', required: true, description: 'Service name' },
    },
    handler: async (params: any) => {
      const service = params.service;
      return getServiceStatus(service);
    },
  },

  restart_service: {
    name: 'restart_service',
    description:
      'Restart a systemd or launchctl service. Use only when the service is failing and causing issues.',
    parameters: {
      service: { type: 'string', required: true, description: 'Service name' },
    },
    handler: async (params: any) => {
      const service = params.service;
      return restartService(service);
    },
  },

  kill_process: {
    name: 'kill_process',
    description: 'Terminate a process by PID. Use only for runaway processes causing system issues.',
    parameters: {
      pid: { type: 'number', required: true, description: 'Process ID' },
      signal: { type: 'string', default: 'TERM', description: 'Signal to send (TERM or KILL)' },
    },
    handler: async (params: any) => {
      const pid = params.pid;
      const signal = params.signal ?? 'TERM';
      return killProcess(pid, signal);
    },
  },

  tail_logs: {
    name: 'tail_logs',
    description: 'Read the last N lines from a log file, optionally filtering by pattern',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to log file' },
      lines: { type: 'number', default: 50, description: 'Number of lines to read' },
      filter: { type: 'string', required: false, description: 'Filter pattern (grep)' },
    },
    handler: async (params: any) => {
      const path = params.path;
      const lines = params.lines ?? 50;
      const filter = params.filter;
      return tailLogs(path, lines, filter);
    },
  },

  check_port: {
    name: 'check_port',
    description: 'Check if a network port is open and accepting connections',
    parameters: {
      host: { type: 'string', default: 'localhost', description: 'Host to check' },
      port: { type: 'number', required: true, description: 'Port to check' },
    },
    handler: async (params: any) => {
      const host = params.host ?? 'localhost';
      const port = params.port;
      return checkPort(host, port);
    },
  },

  get_network_connections: {
    name: 'get_network_connections',
    description: 'Get active network connections grouped by state',
    parameters: {},
    handler: async () => getNetworkConnections(),
  },
};
