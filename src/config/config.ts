/**
 * Configuration management
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ChannelConfig } from '../channels/types.js';
import type { AgentConfig } from '../agent/types.js';

export interface ClawMonConfig {
  gateway?: {
    port?: number;
    bind?: string;
  };
  node?: {
    name?: string;
    gatewayHost?: string;
    gatewayPort?: number;
  };
  agent: AgentConfig;
  channels: ChannelConfig;
  monitoring?: {
    checkInterval?: number;
    alertCooldown?: number;
  };
}

const DEFAULT_CONFIG: ClawMonConfig = {
  gateway: {
    port: 18790,
    bind: '0.0.0.0',
  },
  node: {
    gatewayHost: 'localhost',
    gatewayPort: 18790,
  },
  agent: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: 'claude-3-5-sonnet-20241022',
  },
  channels: {
    console: {
      enabled: true,
      colors: true,
    },
  },
  monitoring: {
    checkInterval: 60000,
    alertCooldown: 300000,
  },
};

export async function loadConfig(): Promise<ClawMonConfig> {
  const configPath = join(homedir(), '.clawmon', 'config.json');

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);

    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      gateway: { ...DEFAULT_CONFIG.gateway, ...userConfig.gateway },
      node: { ...DEFAULT_CONFIG.node, ...userConfig.node },
      agent: { ...DEFAULT_CONFIG.agent, ...userConfig.agent },
      channels: { ...DEFAULT_CONFIG.channels, ...userConfig.channels },
      monitoring: { ...DEFAULT_CONFIG.monitoring, ...userConfig.monitoring },
    };
  } catch (error) {
    console.error('Failed to load config:', error);
    return DEFAULT_CONFIG;
  }
}

export function ensureApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Set it in your environment or ~/.clawmon/config.json'
    );
  }
  return key;
}
