/**
 * Gateway server - manages worker nodes and coordinates monitoring
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createHash, randomBytes } from 'crypto';
import type { GatewayConfig, NodeInfo, NodeMessage, GatewayMessage, ToolInvocation, ClusterState } from './types.js';

export class Gateway {
  private wss: WebSocketServer;
  private config: GatewayConfig;
  private state: ClusterState;
  private clients: Map<string, WebSocket> = new Map();
  private invocationCounter = 0;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      port: config.port ?? 18790,
      bind: config.bind ?? '0.0.0.0',
    };

    this.state = {
      nodes: new Map(),
      pendingInvocations: new Map(),
    };

    this.wss = new WebSocketServer({
      host: this.config.bind,
      port: this.config.port,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = randomBytes(8).toString('hex');
      let nodeId: string | undefined;

      ws.on('message', async (data) => {
        try {
          const message: NodeMessage = JSON.parse(data.toString());
          await this.handleNodeMessage(clientId, nodeId, ws, message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      ws.on('close', () => {
        if (nodeId) {
          this.handleNodeDisconnect(nodeId);
        }
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send initial ping
      this.sendToClient(ws, { type: 'ping', timestamp: Date.now() });
    });
  }

  private async handleNodeMessage(
    clientId: string,
    nodeId: string | undefined,
    ws: WebSocket,
    message: NodeMessage
  ): Promise<void> {
    switch (message.type) {
      case 'register': {
        const data = message.data as {
          name?: string;
          hostname?: string;
          platform?: string;
          arch?: string;
          capabilities?: string[];
        };

        nodeId = this.generateNodeId(data.hostname || 'unknown', data.name);
        const nodeInfo: NodeInfo = {
          id: nodeId,
          name: data.name ?? data.hostname ?? 'unknown',
          hostname: data.hostname ?? 'unknown',
          platform: data.platform ?? 'unknown',
          arch: data.arch ?? 'unknown',
          connectedAt: Date.now(),
          lastSeen: Date.now(),
          capabilities: data.capabilities ?? [],
        };

        this.state.nodes.set(nodeId, nodeInfo);
        this.clients.set(nodeId, ws);

        console.log(`Node registered: ${nodeId} (${nodeInfo.name})`);

        this.sendToClient(ws, {
          type: 'ping',
          timestamp: Date.now(),
        });
        break;
      }

      case 'heartbeat': {
        if (nodeId) {
          const node = this.state.nodes.get(nodeId);
          if (node) {
            node.lastSeen = Date.now();
          }
        }
        break;
      }

      case 'response': {
        const data = message.data as {
          invocationId?: string;
          result?: unknown;
          error?: string;
        };

        if (data.invocationId) {
          const invocation = this.state.pendingInvocations.get(data.invocationId);
          if (invocation) {
            invocation.status = data.error ? 'failed' : 'completed';
            invocation.result = data.result;
            invocation.error = data.error;
          }
        }
        break;
      }

      case 'event': {
        // Forward events to agent handler
        this.emit('nodeEvent', { nodeId, data: message.data });
        break;
      }
    }
  }

  private handleNodeDisconnect(nodeId: string): void {
    console.log(`Node disconnected: ${nodeId}`);
    this.state.nodes.delete(nodeId);
    this.emit('nodeDisconnect', { nodeId });
  }

  private sendToClient(ws: WebSocket, message: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private generateNodeId(hostname: string, name?: string): string {
    const base = name || hostname;
    return createHash('sha256')
      .update(base + Date.now())
      .digest('hex')
      .substring(0, 12);
  }

  /**
   * Invoke a tool on a specific node
   */
  async invokeTool(
    nodeId: string,
    tool: string,
    params: Record<string, unknown> = {}
  ): Promise<ToolInvocation> {
    const invocationId = `${nodeId}-${this.invocationCounter++}`;

    const invocation: ToolInvocation = {
      id: invocationId,
      nodeId,
      tool,
      params,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.state.pendingInvocations.set(invocationId, invocation);

    const ws = this.clients.get(nodeId);
    if (!ws) {
      invocation.status = 'failed';
      invocation.error = 'Node not connected';
      return invocation;
    }

    this.sendToClient(ws, {
      type: 'invoke',
      timestamp: Date.now(),
      tool,
      params,
    });

    invocation.status = 'running';
    return invocation;
  }

  /**
   * Broadcast a tool invocation to all nodes
   */
  async broadcastTool(
    tool: string,
    params: Record<string, unknown> = {}
  ): Promise<Map<string, ToolInvocation>> {
    const results = new Map<string, ToolInvocation>();

    for (const nodeId of this.state.nodes.keys()) {
      const invocation = await this.invokeTool(nodeId, tool, params);
      results.set(nodeId, invocation);
    }

    return results;
  }

  /**
   * Get all connected nodes
   */
  getNodes(): NodeInfo[] {
    return Array.from(this.state.nodes.values());
  }

  /**
   * Get a specific node
   */
  getNode(nodeId: string): NodeInfo | undefined {
    return this.state.nodes.get(nodeId);
  }

  /**
   * Start the gateway server
   */
  start(): void {
    console.log(`Gateway listening on ${this.config.bind}:${this.config.port}`);
  }

  /**
   * Stop the gateway server
   */
  stop(): void {
    this.wss.close();
    for (const ws of this.clients.values()) {
      ws.close();
    }
  }

  /**
   * Simple event emitter
   */
  private listeners: Map<string, Array<(data: unknown) => void>> = new Map();

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }
}
