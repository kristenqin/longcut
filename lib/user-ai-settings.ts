import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GenerateAIOptions } from '@/lib/ai-client';
import { createDeepSeekAdapter } from '@/lib/ai-providers/deepseek-adapter';
import { getProviderDefaultModel } from '@/lib/ai-providers/provider-config';
import type { ProviderGenerateResult, ProviderKey } from '@/lib/ai-providers';

export type UserAIProviderKey = Extract<ProviderKey, 'deepseek'>;

export const userAIProviderSettingsInputSchema = z.object({
  provider: z.literal('deepseek').default('deepseek'),
  model: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default(getProviderDefaultModel('deepseek')),
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(5000)
    .optional(),
  apiBaseUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional(),
});

export type UserAIProviderSettingsInput = z.infer<
  typeof userAIProviderSettingsInputSchema
>;

export interface UserAIProviderSettingsRow {
  user_id: string;
  provider: UserAIProviderKey;
  model: string;
  encrypted_api_key: string | null;
  api_key_last4: string | null;
  api_base_url: string | null;
  tested_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PublicUserAIProviderSettings {
  provider: UserAIProviderKey;
  model: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  apiBaseUrl: string | null;
  testedAt: string | null;
  updatedAt: string | null;
}

export interface ResolvedUserAIProviderConfig {
  provider: UserAIProviderKey;
  model: string;
  apiKey: string;
  apiBaseUrl?: string;
  configSource: 'user';
}

const ENCRYPTION_VERSION = 'v1';

function getEncryptionSecret(explicitSecret?: string): string {
  const secret =
    explicitSecret ??
    process.env.AI_SETTINGS_ENCRYPTION_KEY ??
    process.env.CSRF_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret.length < 16) {
    throw new Error(
      'AI settings encryption requires AI_SETTINGS_ENCRYPTION_KEY, CSRF_SALT, or SUPABASE_SERVICE_ROLE_KEY with at least 16 characters.'
    );
  }

  return secret;
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptUserAIKey(apiKey: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(getEncryptionSecret(secret)),
    iv
  );
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptUserAIKey(encryptedApiKey: string, secret?: string): string {
  const [version, ivText, authTagText, ciphertextText] = encryptedApiKey.split(':');

  if (version !== ENCRYPTION_VERSION || !ivText || !authTagText || !ciphertextText) {
    throw new Error('Unsupported encrypted AI key format.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(getEncryptionSecret(secret)),
    Buffer.from(ivText, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(authTagText, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function toPublicUserAISettings(
  row: UserAIProviderSettingsRow | null | undefined
): PublicUserAIProviderSettings | null {
  if (!row) {
    return null;
  }

  return {
    provider: row.provider,
    model: row.model,
    hasApiKey: Boolean(row.encrypted_api_key),
    apiKeyLast4: row.api_key_last4,
    apiBaseUrl: row.api_base_url,
    testedAt: row.tested_at,
    updatedAt: row.updated_at,
  };
}

function lastKeyChars(apiKey: string): string {
  return apiKey.slice(-4);
}

export async function getUserAIProviderSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<UserAIProviderSettingsRow | null> {
  const { data, error } = await supabase
    .from('user_ai_provider_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UserAIProviderSettingsRow | null) ?? null;
}

export async function upsertUserAIProviderSettings(
  supabase: SupabaseClient,
  userId: string,
  input: UserAIProviderSettingsInput
): Promise<UserAIProviderSettingsRow> {
  const existing = await getUserAIProviderSettings(supabase, userId);
  const encryptedApiKey = input.apiKey
    ? encryptUserAIKey(input.apiKey)
    : existing?.encrypted_api_key ?? null;

  if (!encryptedApiKey) {
    throw new Error('A provider API key is required before saving AI settings.');
  }

  const apiKeyLast4 = input.apiKey
    ? lastKeyChars(input.apiKey)
    : existing?.api_key_last4 ?? null;

  const { data, error } = await supabase
    .from('user_ai_provider_settings')
    .upsert(
      {
        user_id: userId,
        provider: input.provider,
        model: input.model,
        encrypted_api_key: encryptedApiKey,
        api_key_last4: apiKeyLast4,
        api_base_url: input.apiBaseUrl ?? null,
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as UserAIProviderSettingsRow;
}

export async function deleteUserAIProviderSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_ai_provider_settings')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function markUserAIProviderSettingsTested(
  supabase: SupabaseClient,
  userId: string,
  testedAt = new Date()
): Promise<void> {
  const { error } = await supabase
    .from('user_ai_provider_settings')
    .update({ tested_at: testedAt.toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function resolveUserAIProviderConfig(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedUserAIProviderConfig | null> {
  const settings = await getUserAIProviderSettings(supabase, userId);
  if (!settings?.encrypted_api_key) {
    return null;
  }

  return {
    provider: settings.provider,
    model: settings.model,
    apiKey: decryptUserAIKey(settings.encrypted_api_key),
    apiBaseUrl: settings.api_base_url ?? undefined,
    configSource: 'user',
  };
}

export function createUserConfiguredGenerateAI(
  config: ResolvedUserAIProviderConfig
): (prompt: string, options?: GenerateAIOptions) => Promise<ProviderGenerateResult> {
  return async (prompt, options = {}) => {
    if (config.provider !== 'deepseek') {
      throw new Error(`Unsupported user AI provider: ${config.provider}`);
    }

    const adapter = createDeepSeekAdapter({
      apiKey: config.apiKey,
      baseUrl: config.apiBaseUrl,
      defaultModel: config.model,
    });

    const generationConfig = options.generationConfig ?? {};

    return adapter.generate({
      prompt,
      model: options.model ?? options.preferredModel ?? config.model,
      temperature: options.temperature ?? generationConfig.temperature,
      topP: options.topP ?? generationConfig.topP,
      maxOutputTokens: options.maxOutputTokens ?? generationConfig.maxOutputTokens,
      timeoutMs: options.timeoutMs,
      zodSchema: options.zodSchema,
      schemaName: options.schemaName,
      metadata: options.metadata,
    });
  };
}

export async function testUserAIProviderConnection(
  config: ResolvedUserAIProviderConfig
): Promise<{
  ok: boolean;
  provider: UserAIProviderKey;
  model: string;
  error?: string;
}> {
  try {
    const generateAI = createUserConfiguredGenerateAI(config);
    const result = await generateAI('Return {"ok":true} as strict JSON.', {
      preferredModel: config.model,
      maxOutputTokens: 128,
      timeoutMs: 15_000,
      zodSchema: z.object({ ok: z.boolean() }),
      schemaName: 'ConnectionTest',
    });

    return {
      ok: true,
      provider: config.provider,
      model: result.model ?? config.model,
    };
  } catch (error) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: error instanceof Error ? error.message : 'Unknown provider error.',
    };
  }
}
