import test from 'node:test';
import assert from 'node:assert/strict';

import { analysisPlugins, getAnalysisPlugin } from '../plugins';

test('analysis plugin registry keeps highlight reels optional', () => {
  const plugin = getAnalysisPlugin('highlight-reels');

  assert.ok(plugin);
  assert.equal(plugin.enabledByDefault, false);
  assert.equal(plugin.mvpStatus, 'optional');
  assert.deepEqual(plugin.requires, ['metadata', 'transcript']);
});

test('analysis plugin registry separates feature plugins from core pipeline', () => {
  const pluginIds = analysisPlugins.map((plugin) => plugin.id);

  assert.ok(pluginIds.includes('summary'));
  assert.ok(pluginIds.includes('chat'));
  assert.ok(pluginIds.includes('notes'));
  assert.equal(pluginIds.includes('platform-adapter'), false);
  assert.equal(pluginIds.includes('ai-provider-adapter'), false);
  assert.equal(pluginIds.includes('player-bridge'), false);
});
