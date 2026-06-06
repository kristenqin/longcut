import { z } from 'zod';
import type {
  ProviderAdapter,
  ProviderGenerateParams,
  ProviderGenerateResult,
} from './types';

const PROVIDER_NAME = 'deepseek';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export interface DeepSeekAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

function buildAbortController(timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return { controller: undefined, clear: () => undefined };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

function ensureSchemaName(name?: string) {
  if (name && name.trim().length > 0) {
    return name.trim();
  }

  return 'ResponseSchema';
}

function buildPrompt(params: ProviderGenerateParams): string {
  if (!params.zodSchema) {
    return params.prompt;
  }

  let schemaText = '{}';

  try {
    schemaText = JSON.stringify(z.toJSONSchema(params.zodSchema));
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to convert schema: ${error.message}`
        : 'Failed to convert schema'
    );
  }

  return `${params.prompt}\n\nReturn strict JSON only that matches the ${ensureSchemaName(
    params.schemaName
  )} schema below. Do not include markdown fences, explanations, or extra text.\nSchema: ${schemaText}`;
}

function extractTextFromChoice(choice: any): string {
  if (!choice) return '';

  const message = choice.message ?? choice.delta ?? {};
  const content = message.content ?? choice.text ?? message.text;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') {
        return part;
      }

      if (typeof part?.text === 'string') {
        return part.text;
      }

      if (typeof part?.content === 'string') {
        return part.content;
      }
    }
  }

  return '';
}

function stripReasoningBlocks(content: string): string {
  return content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

function normalizeStructuredContent(
  content: string,
  params: ProviderGenerateParams
): string {
  if (!params.zodSchema) {
    return content;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `DeepSeek structured output validation failed: ${error.message}`
        : 'DeepSeek structured output validation failed.'
    );
  }

  try {
    const validated = params.zodSchema.parse(parsed);
    return JSON.stringify(validated);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `DeepSeek structured output validation failed: ${error.message}`
        : 'DeepSeek structured output validation failed.'
    );
  }
}

function normalizeUsage(raw: any, latencyMs: number | undefined) {
  if (!raw) {
    return latencyMs ? { latencyMs } : undefined;
  }

  const promptTokens =
    raw.prompt_tokens ?? raw.promptTokens ?? raw.input_tokens ?? raw.inputTokens;
  const completionTokens =
    raw.completion_tokens ??
    raw.completionTokens ??
    raw.output_tokens ??
    raw.outputTokens;
  const totalTokens =
    raw.total_tokens ??
    raw.totalTokens ??
    (typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? promptTokens + completionTokens
      : undefined);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    latencyMs,
  };
}

function buildPayload(params: ProviderGenerateParams, defaultModel: string) {
  const payload: Record<string, unknown> = {
    model: params.model ?? defaultModel,
    messages: [
      {
        role: 'user',
        content: buildPrompt(params),
      },
    ],
  };

  if (typeof params.temperature === 'number') {
    payload.temperature = params.temperature;
  }

  if (typeof params.topP === 'number') {
    payload.top_p = params.topP;
  }

  if (typeof params.maxOutputTokens === 'number') {
    payload.max_tokens = params.maxOutputTokens;
  }

  return payload;
}

function buildDeepSeekError(response: Response, parsed: any): Error {
  const status = response.status;
  const message =
    parsed?.error?.message ??
    parsed?.message ??
    response.statusText ??
    'Unknown error';
  const code = parsed?.error?.code ?? parsed?.code;

  if (status === 401 || status === 403) {
    return new Error(`DeepSeek API authentication failed: ${message}`);
  }

  if (status === 429) {
    return new Error(`DeepSeek API rate limit: ${message}`);
  }

  if (status >= 500) {
    return new Error(`DeepSeek API service unavailable: ${message}`);
  }

  return new Error(`DeepSeek API error${code ? ` (${code})` : ''}: ${message}`);
}

export function createDeepSeekAdapter(
  options: DeepSeekAdapterOptions = {}
): ProviderAdapter {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPSEEK_API_KEY is required to use the DeepSeek provider. Set the environment variable and try again.'
    );
  }

  const defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  const configuredBaseUrl =
    options.baseUrl ?? process.env.DEEPSEEK_API_BASE_URL ?? DEFAULT_BASE_URL;
  const baseUrl = configuredBaseUrl.replace(/\/$/, '');

  return {
    name: PROVIDER_NAME,
    defaultModel,
    async generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult> {
      const payload = buildPayload(params, defaultModel);
      const { controller, clear } = buildAbortController(params.timeoutMs);
      const requestStartedAt = Date.now();

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller?.signal,
        });

        const responseText = await response.text();
        let parsed: any;

        try {
          parsed = responseText ? JSON.parse(responseText) : undefined;
        } catch {
          throw new Error('DeepSeek API returned a non-JSON response.');
        }

        if (!response.ok) {
          throw buildDeepSeekError(response, parsed);
        }

        const latencyMs = Date.now() - requestStartedAt;
        const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : undefined;
        const content = normalizeStructuredContent(
          stripReasoningBlocks(extractTextFromChoice(choice)),
          params
        );

        if (!content) {
          throw new Error('DeepSeek API returned an empty response.');
        }

        return {
          content,
          rawResponse: parsed,
          provider: PROVIDER_NAME,
          model: parsed?.model ?? String(payload.model),
          usage: normalizeUsage(parsed?.usage, latencyMs),
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('DeepSeek API timeout: request timed out.');
        }

        throw error;
      } finally {
        clear();
      }
    },
  };
}
