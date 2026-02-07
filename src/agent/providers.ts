/**
 * LLM Provider implementations
 * Supports: Anthropic, OpenAI, Ollama, Open-WebUI, Groq, Together, DeepSeek, Google
 */

import type {
  AnyProviderConfig,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  ProviderResponse,
} from './types.js';

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic Claude provider
 */
async function anthropicProvider(
  messages: ChatMessage[],
  config: Extract<AnyProviderConfig, { provider: 'anthropic' }>
): Promise<ProviderResponse> {
  const { Anthropic } = await import('@anthropic-ai/sdk');

  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs ?? DEFAULT_TIMEOUT,
  });

  const model = config.model ?? 'claude-3-5-sonnet-20241022';
  const systemMessage = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? 0,
      system: systemMessage?.content,
      messages: chatMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';

    return {
      success: true,
      data: {
        content: text,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      },
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * OpenAI-compatible provider (OpenAI, DeepSeek, Together, Groq, etc.)
 */
async function openaiCompatibleProvider(
  messages: ChatMessage[],
  config: AnyProviderConfig & { baseUrl?: string; apiKey?: string; model?: string },
  provider: LLMProvider
): Promise<ProviderResponse> {
  const baseUrl = config.baseUrl ?? getDefaultBaseUrl(provider);
  const apiKey = config.apiKey ?? '';

  const requestBody = {
    model: config.model ?? getDefaultModel(provider),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    max_tokens: ('maxTokens' in config ? config.maxTokens : undefined) ?? DEFAULT_MAX_TOKENS,
    temperature: config.temperature ?? 0,
  };

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        content: data.choices[0]?.message?.content ?? '',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      },
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Ollama provider (local models)
 */
async function ollamaProvider(
  messages: ChatMessage[],
  config: Extract<AnyProviderConfig, { provider: 'ollama' }>
): Promise<ProviderResponse> {
  const baseUrl = config.baseUrl ?? 'http://127.0.0.1:11434';
  const model = config.model ?? 'llama3.2';

  const requestBody = {
    model,
    messages: messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    })),
    stream: false,
    options: {
      num_ctx: config.numCtx,
      num_predict: config.numPredict,
      temperature: config.temperature ?? 0,
    },
  };

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data: {
        content: data.message?.content ?? '',
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      },
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Open-WebUI provider (local via Open WebUI)
 */
async function openWebUIProvider(
  messages: ChatMessage[],
  config: Extract<AnyProviderConfig, { provider: 'open-webui' }>
): Promise<ProviderResponse> {
  const baseUrl = config.baseUrl ?? 'http://localhost:3000';

  // Open-WebUI uses OpenAI-compatible API
  return openaiCompatibleProvider(messages, {
    ...config,
    baseUrl: `${baseUrl}/ollama`, // Open-WebUI usually exposes Ollama at /ollama
    model: config.model ?? 'llama3.2',
  }, 'open-webui');
}

/**
 * Google Gemini provider
 */
async function googleProvider(
  messages: ChatMessage[],
  config: Extract<AnyProviderConfig, { provider: 'google' }>
): Promise<ProviderResponse> {
  const model = config.model ?? 'gemini-2.0-flash-exp';
  const baseUrl = config.baseUrl ?? `https://generativelanguage.googleapis.com/v1beta`;

  // Convert messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  try {
    const response = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: config.temperature ?? 0,
          },
        }),
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      success: true,
      data: {
        content: text,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
        },
      },
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get default base URL for provider
 */
function getDefaultBaseUrl(provider: LLMProvider): string {
  const defaults: Record<LLMProvider, string> = {
    anthropic: 'https://api.anthropic.com/v1',
    openai: 'https://api.openai.com/v1',
    ollama: 'http://127.0.0.1:11434',
    'open-webui': 'http://localhost:3000/ollama',
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    deepseek: 'https://api.deepseek.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
  };
  return defaults[provider];
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider: LLMProvider): string {
  const defaults: Record<LLMProvider, string> = {
    anthropic: 'claude-3-5-sonnet-20241022',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.2',
    'open-webui': 'llama3.2',
    groq: 'llama-3.3-70b-versatile',
    together: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
    deepseek: 'deepseek-chat',
    google: 'gemini-2.0-flash-exp',
  };
  return defaults[provider];
}

/**
 * Main provider router
 */
export async function callProvider(
  messages: ChatMessage[],
  config: AnyProviderConfig
): Promise<ProviderResponse> {
  switch (config.provider) {
    case 'anthropic':
      return anthropicProvider(messages, config as Extract<AnyProviderConfig, { provider: 'anthropic' }>);

    case 'ollama':
      return ollamaProvider(messages, config as Extract<AnyProviderConfig, { provider: 'ollama' }>);

    case 'open-webui':
      return openWebUIProvider(messages, config as Extract<AnyProviderConfig, { provider: 'open-webui' }>);

    case 'google':
      return googleProvider(messages, config as Extract<AnyProviderConfig, { provider: 'google' }>);

    case 'openai':
    case 'groq':
    case 'together':
    case 'deepseek':
      return openaiCompatibleProvider(messages, config, config.provider);

    default:
      return {
        success: false,
        error: `Unknown provider: ${(config as any).provider}`,
      };
  }
}

/**
 * Discover available models from Ollama
 */
export async function discoverOllamaModels(baseUrl: string = 'http://127.0.0.1:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.models?.map((m: { name: string }) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Discover available models from Open-WebUI
 */
export async function discoverOpenWebUIModels(baseUrl: string = 'http://localhost:3000'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/ollama/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.models?.map((m: { name: string }) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Provider info for display
 */
export function getProviderInfo(provider: LLMProvider): {
  name: string;
  description: string;
  defaultModel: string;
  requiresApiKey: boolean;
  defaultBaseUrl: string;
} {
  const info: Record<LLMProvider, { name: string; description: string; defaultModel: string; requiresApiKey: boolean; defaultBaseUrl: string }> = {
    anthropic: {
      name: 'Anthropic Claude',
      description: 'Anthropic\'s Claude AI models',
      defaultModel: 'claude-3-5-sonnet-20241022',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.anthropic.com/v1',
    },
    openai: {
      name: 'OpenAI',
      description: 'OpenAI GPT models',
      defaultModel: 'gpt-4o-mini',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.openai.com/v1',
    },
    ollama: {
      name: 'Ollama',
      description: 'Local models via Ollama',
      defaultModel: 'llama3.2',
      requiresApiKey: false,
      defaultBaseUrl: 'http://127.0.0.1:11434',
    },
    'open-webui': {
      name: 'Open WebUI',
      description: 'Local models via Open WebUI',
      defaultModel: 'llama3.2',
      requiresApiKey: false,
      defaultBaseUrl: 'http://localhost:3000',
    },
    groq: {
      name: 'Groq',
      description: 'Groq\'s fast inference API',
      defaultModel: 'llama-3.3-70b-versatile',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.groq.com/openai/v1',
    },
    together: {
      name: 'Together AI',
      description: 'Together AI hosted models',
      defaultModel: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.together.xyz/v1',
    },
    deepseek: {
      name: 'DeepSeek',
      description: 'DeepSeek AI models',
      defaultModel: 'deepseek-chat',
      requiresApiKey: true,
      defaultBaseUrl: 'https://api.deepseek.com/v1',
    },
    google: {
      name: 'Google Gemini',
      description: 'Google Gemini models',
      defaultModel: 'gemini-2.0-flash-exp',
      requiresApiKey: true,
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    },
  };

  return info[provider];
}
