import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  createUserConfiguredGenerateAI,
  decryptUserAIKey,
  encryptUserAIKey,
  toPublicUserAISettings,
  type ResolvedUserAIProviderConfig,
  type UserAIProviderSettingsRow,
} from '../user-ai-settings';

function withMockFetch<T>(mockFetch: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('user AI keys are encrypted without storing plaintext', () => {
  const secret = 'test-secret-for-ai-settings';
  const apiKey = 'sk-user-secret-123456';
  const encrypted = encryptUserAIKey(apiKey, secret);

  assert.notEqual(encrypted, apiKey);
  assert.equal(encrypted.includes(apiKey), false);
  assert.equal(decryptUserAIKey(encrypted, secret), apiKey);
});

test('public user AI settings never include encrypted key material', () => {
  const row: UserAIProviderSettingsRow = {
    user_id: 'user-1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    encrypted_api_key: 'v1:hidden',
    api_key_last4: '3456',
    api_base_url: 'https://api.deepseek.com',
    tested_at: null,
    created_at: '2026-06-07T00:00:00.000Z',
    updated_at: '2026-06-07T00:00:00.000Z',
  };

  assert.deepEqual(toPublicUserAISettings(row), {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    hasApiKey: true,
    apiKeyLast4: '3456',
    apiBaseUrl: 'https://api.deepseek.com',
    testedAt: null,
    updatedAt: '2026-06-07T00:00:00.000Z',
  });
});

test('user AI config creates a DeepSeek generator with user credentials', async () => {
  const config: ResolvedUserAIProviderConfig = {
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    apiKey: 'user-deepseek-key',
    apiBaseUrl: 'https://api.deepseek.example',
    configSource: 'user',
  };
  let authorization = '';
  let requestBody: any;

  await withMockFetch(
    async (_input, init) => {
      authorization = String((init?.headers as Record<string, string>)?.Authorization);
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 }
      );
    },
    async () => {
      const generateAI = createUserConfiguredGenerateAI(config);
      const result = await generateAI('Return JSON', {
        zodSchema: z.object({ ok: z.boolean() }),
        schemaName: 'OkResponse',
      });

      assert.equal(authorization, 'Bearer user-deepseek-key');
      assert.equal(requestBody.model, 'deepseek-v4-pro');
      assert.equal(result.content, '{"ok":true}');
      assert.equal(result.provider, 'deepseek');
    }
  );
});
