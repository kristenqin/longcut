import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { createDeepSeekAdapter } from '../ai-providers/deepseek-adapter';

function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>) {
  const originalValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    originalValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return run().finally(() => {
    for (const [key, value] of originalValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function withMockFetch<T>(mockFetch: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('DeepSeek adapter uses default model and strips reasoning tags', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'test-key' }, async () => {
    await withMockFetch(
      async () =>
        new Response(
          JSON.stringify({
            model: 'deepseek-v4-flash',
            choices: [
              {
                message: {
                  content: '<think>hidden</think>{"ok":true}',
                },
              },
            ],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 4,
              total_tokens: 7,
            },
          }),
          { status: 200 }
        ),
      async () => {
        const adapter = createDeepSeekAdapter();
        const result = await adapter.generate({ prompt: 'Return JSON' });

        assert.equal(adapter.defaultModel, 'deepseek-v4-flash');
        assert.equal(result.content, '{"ok":true}');
        assert.equal(result.provider, 'deepseek');
        assert.equal(result.model, 'deepseek-v4-flash');
        assert.equal(result.usage?.promptTokens, 3);
      }
    );
  });
});

test('DeepSeek adapter adds schema instructions and validates structured output', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'test-key' }, async () => {
    let requestBody: any;

    await withMockFetch(
      async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"title":"Concept Map"}' } }],
          }),
          { status: 200 }
        );
      },
      async () => {
        const adapter = createDeepSeekAdapter();
        const result = await adapter.generate({
          prompt: 'Return a title',
          schemaName: 'TitleResponse',
          zodSchema: z.object({
            title: z.string(),
          }),
        });

        assert.equal(requestBody.model, 'deepseek-v4-flash');
        assert.match(requestBody.messages[0].content, /TitleResponse/);
        assert.match(requestBody.messages[0].content, /Return strict JSON/i);
        assert.equal(result.content, '{"title":"Concept Map"}');
      }
    );
  });
});

test('DeepSeek adapter can use explicit user credentials and model', async () => {
  await withEnv({ DEEPSEEK_API_KEY: 'env-key' }, async () => {
    let requestedUrl = '';
    let authorization = '';
    let requestBody: any;

    await withMockFetch(
      async (input, init) => {
        requestedUrl = String(input);
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
        const adapter = createDeepSeekAdapter({
          apiKey: 'user-key',
          baseUrl: 'https://user.deepseek.example/',
          defaultModel: 'deepseek-v4-pro',
        });
        const result = await adapter.generate({ prompt: 'Return JSON' });

        assert.equal(adapter.defaultModel, 'deepseek-v4-pro');
        assert.equal(requestedUrl, 'https://user.deepseek.example/chat/completions');
        assert.equal(authorization, 'Bearer user-key');
        assert.equal(requestBody.model, 'deepseek-v4-pro');
        assert.equal(result.model, 'deepseek-v4-pro');
      }
    );
  });
});
