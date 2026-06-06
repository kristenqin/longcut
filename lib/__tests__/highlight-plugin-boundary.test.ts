import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('highlight reel APIs call through the plugin boundary', () => {
  const videoAnalysisRoute = readProjectFile('app/api/video-analysis/route.ts');
  const generateTopicsRoute = readProjectFile('app/api/generate-topics/route.ts');

  assert.match(videoAnalysisRoute, /@\/lib\/plugins\/highlight-reels/);
  assert.doesNotMatch(videoAnalysisRoute, /from ['"]@\/lib\/ai-processing['"]/);

  assert.match(generateTopicsRoute, /@\/lib\/plugins\/highlight-reels/);
  assert.doesNotMatch(generateTopicsRoute, /from ['"]@\/lib\/ai-processing['"]/);
});

test('highlight reel plugin is the only bridge to legacy topic generation', () => {
  const highlightPlugin = readProjectFile('lib/plugins/highlight-reels/index.ts');
  const conceptMapAnalyzer = readProjectFile('lib/concept-map/analyzer.ts');
  const pluginRegistry = readProjectFile('lib/plugins/registry.ts');

  assert.match(highlightPlugin, /@\/lib\/ai-processing/);
  assert.doesNotMatch(conceptMapAnalyzer, /@\/lib\/ai-processing/);
  assert.match(pluginRegistry, /lib\/plugins\/highlight-reels\/index\.ts/);
});
