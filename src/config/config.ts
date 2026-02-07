/**
 * Configuration management with multi-provider support
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ChannelConfig } from '../channels/types.js';
import type { AnyProviderConfig, LLMProvider } from '../agent/types.js';

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
  agent: AnyProviderConfig;
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
    apiKey: process.env.ANTHROPIC_API_KEY || '',
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

export function getProviderConfig(provider: LLMProvider, env: NodeJS.ProcessEnv = process.env): AnyProviderConfig {
  switch (provider) {
    case 'anthropic':
      return {
        provider: 'anthropic',
        apiKey: env.ANTHROPIC_API_KEY || '',
        model: env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      };

    case 'openai':
      return {
        provider: 'openai',
        apiKey: env.OPENAI_API_KEY || '',
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
      };

    case 'ollama':
      return {
        provider: 'ollama',
        baseUrl: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
        model: env.OLLAMA_MODEL || 'llama3.2',
      };

    case 'open-webui':
      return {
        provider: 'open-webui',
        baseUrl: env.OPEN_WEBUI_BASE_URL || 'http://localhost:3000',
        apiKey: env.OPEN_WEBUI_API_KEY,
        model: env.OPEN_WEBUI_MODEL || 'llama3.2',
      };

    case 'groq':
      return {
        provider: 'groq',
        apiKey: env.GROQ_API_KEY || '',
        model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      };

    case 'together':
      return {
        provider: 'together',
        apiKey: env.TOGETHER_API_KEY || '',
        model: env.TOGETHER_MODEL || 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      };

    case 'deepseek':
      return {
        provider: 'deepseek',
        apiKey: env.DEEPSEEK_API_KEY || '',
        baseUrl: env.DEEPSEEK_BASE_URL,
        model: env.DEEPSEEK_MODEL || 'deepseek-chat',
      };

    case 'google':
      return {
        provider: 'google',
        apiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY || '',
        model: env.GOOGLE_MODEL || 'gemini-2.0-flash-exp',
      };

    default:
      return {
        provider: 'anthropic',
        apiKey: '',
      };
  }
}

export function ensureApiKey(config: AnyProviderConfig): string {
  // Ollama and Open-WebUI don't require API keys by default
  if (config.provider === 'ollama' || config.provider === 'open-webui') {
    return 'local';
  }

  const key = 'apiKey' in config ? config.apiKey : undefined;
  if (key) {
    return key;
  }

  // Try environment variables
  const envKeys: Record<LLMProvider, string[]> = {
    anthropic: ['ANTHROPIC_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    ollama: [],
    'open-webui': [],
    groq: ['GROQ_API_KEY'],
    together: ['TOGETHER_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  };

  const keys = envKeys[config.provider];
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(
    `API key required for provider '${config.provider}'. Set it in config.json or environment variable.`
  );
}
