import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEffectiveProviderKey,
  getProviderModelDefaults,
  getProviderBehavior,
  getProviderDefaultModel,
  getProviderFallbackOrder,
  normalizeProviderKey,
} from '../ai-providers/provider-config';

function withEnv<T>(values: Record<string, string | undefined>, run: () => T) {
  const originalValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    originalValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of originalValues.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('provider-key normalization accepts MiniMax', () => {
  assert.equal(normalizeProviderKey('MiniMax'), 'minimax');
});

test('provider-key normalization accepts DeepSeek', () => {
  assert.equal(normalizeProviderKey('DeepSeek'), 'deepseek');
});

test('provider behavior forceFullTranscriptTopicGeneration is enabled only for Grok', () => {
  assert.equal(
    getProviderBehavior('deepseek').forceFullTranscriptTopicGeneration,
    false
  );
  assert.equal(
    getProviderBehavior('grok').forceFullTranscriptTopicGeneration,
    true
  );
  assert.equal(
    getProviderBehavior('gemini').forceFullTranscriptTopicGeneration,
    false
  );
  assert.equal(
    getProviderBehavior('minimax').forceFullTranscriptTopicGeneration,
    false
  );
});

test('provider behavior forceSmartModeOnClient is enabled for DeepSeek, Grok, and MiniMax only', () => {
  assert.equal(getProviderBehavior('deepseek').forceSmartModeOnClient, true);
  assert.equal(getProviderBehavior('grok').forceSmartModeOnClient, true);
  assert.equal(getProviderBehavior('minimax').forceSmartModeOnClient, true);
  assert.equal(getProviderBehavior('gemini').forceSmartModeOnClient, false);
});

test('deterministic fallback order prefers DeepSeek before Grok before Gemini before MiniMax', () => {
  assert.deepEqual(getProviderFallbackOrder('minimax'), ['deepseek', 'grok', 'gemini']);
  assert.deepEqual(getProviderFallbackOrder('gemini'), ['deepseek', 'grok', 'minimax']);
  assert.deepEqual(getProviderFallbackOrder('grok'), ['deepseek', 'gemini', 'minimax']);
  assert.deepEqual(getProviderFallbackOrder('deepseek'), ['grok', 'gemini', 'minimax']);
});

test('provider default model returns MiniMax-M2.7 for MiniMax', () => {
  assert.equal(getProviderDefaultModel('minimax'), 'MiniMax-M2.7');
});

test('provider default model returns deepseek-v4-flash for DeepSeek', () => {
  assert.equal(getProviderDefaultModel('deepseek'), 'deepseek-v4-flash');
});

test('provider model defaults derive fast and pro topic models from configured MiniMax provider', () => {
  withEnv(
    {
      AI_PROVIDER: 'minimax',
      NEXT_PUBLIC_AI_PROVIDER: undefined,
      AI_DEFAULT_MODEL: undefined,
      AI_FAST_MODEL: undefined,
      AI_PRO_MODEL: undefined,
    },
    () => {
      assert.deepEqual(getProviderModelDefaults(), {
        defaultModel: 'MiniMax-M2.7',
        fastModel: 'MiniMax-M2.7',
        proModel: 'MiniMax-M2.7',
      });
    }
  );
});

test('effective provider resolves to MiniMax when only MINIMAX_API_KEY is present', () => {
  withEnv(
    {
      AI_PROVIDER: undefined,
      NEXT_PUBLIC_AI_PROVIDER: undefined,
      DEEPSEEK_API_KEY: undefined,
      XAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      MINIMAX_API_KEY: 'test-minimax-key',
      AI_DEFAULT_MODEL: undefined,
      AI_FAST_MODEL: undefined,
      AI_PRO_MODEL: undefined,
    },
    () => {
      assert.equal(getEffectiveProviderKey(), 'minimax');
      assert.deepEqual(getProviderModelDefaults(), {
        defaultModel: 'MiniMax-M2.7',
        fastModel: 'MiniMax-M2.7',
        proModel: 'MiniMax-M2.7',
      });
    }
  );
});

test('effective provider resolves to DeepSeek when only DEEPSEEK_API_KEY is present', () => {
  withEnv(
    {
      AI_PROVIDER: undefined,
      NEXT_PUBLIC_AI_PROVIDER: undefined,
      DEEPSEEK_API_KEY: 'test-deepseek-key',
      XAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
      AI_DEFAULT_MODEL: undefined,
      AI_FAST_MODEL: undefined,
      AI_PRO_MODEL: undefined,
    },
    () => {
      assert.equal(getEffectiveProviderKey(), 'deepseek');
      assert.deepEqual(getProviderModelDefaults(), {
        defaultModel: 'deepseek-v4-flash',
        fastModel: 'deepseek-v4-flash',
        proModel: 'deepseek-v4-flash',
      });
    }
  );
});
