/**
 * Node client - connects to gateway and exposes monitoring tools
 */

import WebSocket from 'ws';
import { hostname, platform, arch } from 'os';
import type { NodeConfig, NodeMessage, GatewayMessage } from './types.js';
import { systemTools } from '../tools/system.js';

export class Node {
  private config: NodeConfig;
  private ws: WebSocket | null = null;
  private nodeId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: NodeConfig) {
    this.config = {
      ...config,
      reconnectInterval: config.reconnectInterval ?? 5000,
    };
  }

  /**
   * Connect to the gateway
   */
  async connect(): Promise<void> {
    const url = `ws://${this.config.host}:${this.config.port}`;
    console.log(`Connecting to gateway at ${url}...`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('Connected to gateway');
      this.register();
      this.startHeartbeat();
      this.clearReconnectTimer();
    });

    this.ws.on('message', async (data) => {
      await this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      console.log('Disconnected from gateway');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  }

  /**
   * Register this node with the gateway
   */
  private register(): void {
    const capabilities = Object.keys(systemTools);

    const message: NodeMessage = {
      type: 'register',
      timestamp: Date.now(),
      data: {
        name: this.config.name,
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        capabilities,
      },
    };

    this.send(message);
  }

  /**
   * Handle messages from the gateway
   */
  private async handleMessage(data: string): Promise<void> {
    try {
      const message: GatewayMessage = JSON.parse(data);

      switch (message.type) {
        case 'ping':
          // Respond to ping with heartbeat
          this.sendHeartbeat();
          break;

        case 'invoke':
          if (message.tool) {
            await this.handleToolInvoke(message.tool, message.params ?? {});
          }
          break;
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  }

  /**
   * Handle tool invocation from gateway
   */
  private async handleToolInvoke(tool: string, params: Record<string, unknown>): Promise<void> {
    console.log(`Invoking tool: ${tool}`, params);

    const toolDef = systemTools[tool as keyof typeof systemTools];
    if (!toolDef) {
      this.sendResponse({
        error: `Unknown tool: ${tool}`,
      });
      return;
    }

    try {
      const result = await toolDef.handler(params);
      this.sendResponse({
        result,
      });
    } catch (error) {
      this.sendResponse({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send a message to the gateway
   */
  private send(message: NodeMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    const message: NodeMessage = {
      type: 'heartbeat',
      nodeId: this.nodeId ?? undefined,
      timestamp: Date.now(),
      data: null,
    };
    this.send(message);
  }

  /**
   * Send response
   */
  private sendResponse(data: { result?: unknown; error?: string }): void {
    const message: NodeMessage = {
      type: 'response',
      nodeId: this.nodeId ?? undefined,
      timestamp: Date.now(),
      data,
    };
    this.send(message);
  }

  /**
   * Send event to gateway
   */
  sendEvent(eventData: unknown): void {
    const message: NodeMessage = {
      type: 'event',
      nodeId: this.nodeId ?? undefined,
      timestamp: Date.now(),
      data: eventData,
    };
    this.send(message);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnect
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.stopHeartbeat();
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.reconnectTimer = null;
      this.connect();
    }, this.config.reconnectInterval);
  }

  /**
   * Clear reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Disconnect from gateway
   */
  disconnect(): void {
    this.running = false;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Start the node (connects and keeps running)
   */
  async start(): Promise<void> {
    this.running = true;
    await this.connect();

    // Keep process alive
    return new Promise(() => {
      // Never resolve - keep running until disconnect
    });
  }
}
