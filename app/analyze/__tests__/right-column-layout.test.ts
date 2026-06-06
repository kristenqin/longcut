import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const pageSource = readFileSync(
  join(process.cwd(), 'app/analyze/[videoId]/page.tsx'),
  'utf8'
);
const conceptMapPanelSource = readFileSync(
  join(process.cwd(), 'components/concept-map-panel.tsx'),
  'utf8'
);
const rightColumnTabsSource = readFileSync(
  join(process.cwd(), 'components/right-column-tabs.tsx'),
  'utf8'
);

test('right column height recalculates when transcript workspace becomes visible', () => {
  const effectStart = pageSource.indexOf('// Dynamically adjust right column height');
  assert.notEqual(effectStart, -1, 'Expected right-column height effect to exist');

  const effectSource = pageSource.slice(effectStart, effectStart + 1800);

  assert.match(effectSource, /requestAnimationFrame/);
  assert.match(effectSource, /transcript\.length/);
  assert.match(effectSource, /pageState/);
});

test('right column has a defensive minimum height before measurement completes', () => {
  const containerStart = pageSource.indexOf('id="right-column-container"');
  assert.notEqual(containerStart, -1, 'Expected right-column container to exist');

  const containerSource = pageSource.slice(containerStart, containerStart + 500);
  assert.match(containerSource, /minHeight:\s*420/);
});

test('youtube player remounts when the analyzed video changes', () => {
  const playerStart = pageSource.indexOf('<YouTubePlayer\n');
  assert.notEqual(playerStart, -1, 'Expected YouTubePlayer render to exist');

  const playerSource = pageSource.slice(playerStart, playerStart + 600);
  assert.match(playerSource, /key=\{videoId\}/);
});

test('transcript seeks try the current youtube player before queuing a command', () => {
  const requestSeekStart = pageSource.indexOf('const requestSeek = useCallback');
  assert.notEqual(requestSeekStart, -1, 'Expected requestSeek callback to exist');

  const requestSeekSource = pageSource.slice(requestSeekStart, requestSeekStart + 300);
  assert.match(requestSeekSource, /youtubePlayerRef\.current\?\.seekTo\(time\)/);
  assert.match(requestSeekSource, /setPlaybackCommand\(\{ type: 'SEEK', time \}\)/);
});

test('concept map panel renders before highlight plugin and seeks by evidence timestamp', () => {
  const conceptPanelIndex = pageSource.indexOf('<ConceptMapPanel');
  const highlightsPanelIndex = pageSource.indexOf('<HighlightsPanel');

  assert.notEqual(conceptPanelIndex, -1, 'Expected ConceptMapPanel render to exist');
  assert.notEqual(highlightsPanelIndex, -1, 'Expected HighlightsPanel render to exist');
  assert.ok(
    conceptPanelIndex < highlightsPanelIndex,
    'Concept Map should be presented before legacy highlights'
  );

  const conceptPanelSource = pageSource.slice(conceptPanelIndex, conceptPanelIndex + 500);
  assert.match(conceptPanelSource, /onGenerate=\{handleGenerateConceptMap\}/);
  assert.match(conceptPanelSource, /onSeek=\{requestSeek\}/);
  assert.doesNotMatch(conceptPanelSource, /isAuthenticated=/);
  assert.doesNotMatch(conceptPanelSource, /onRequestSignIn=/);
  assert.match(conceptMapPanelSource, /onSeek\(evidence\.start\)/);
});

test('concept map generation keeps MVP output size stable', () => {
  const requestStart = pageSource.indexOf("csrfFetch.post(\n        '/api/concept-map'");
  assert.notEqual(requestStart, -1, 'Expected Concept Map API request to exist');

  const requestSource = pageSource.slice(requestStart, requestStart + 500);
  assert.match(requestSource, /maxConcepts:\s*6/);
});

test('concept map generation uses platform videoRef when available', () => {
  const requestStart = pageSource.indexOf("csrfFetch.post(\n        '/api/concept-map'");
  assert.notEqual(requestStart, -1, 'Expected Concept Map API request to exist');

  const requestSource = pageSource.slice(requestStart, requestStart + 500);
  assert.match(requestSource, /currentVideoRef \? \{ videoRef: currentVideoRef \} : \{ videoId \}/);
});

test('analyze page can render Bilibili iframe player for Bilibili refs', () => {
  assert.match(pageSource, /import \{ BilibiliPlayer \}/);
  assert.match(pageSource, /buildDefaultVideoUrl/);
  assert.match(pageSource, /currentVideoRef\?\.platform === 'bilibili'/);
  assert.match(pageSource, /<BilibiliPlayer/);
});

test('optional analysis plugins are gated behind client feature flags', () => {
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_HIGHLIGHT_REELS/);
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_CHAT_PLUGIN/);
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_NOTES_PLUGIN/);
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_TRANSCRIPT_EXPORT/);
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_QUICK_PREVIEW/);
  assert.match(pageSource, /NEXT_PUBLIC_ENABLE_TAKEAWAYS_PLUGIN/);

  assert.match(pageSource, /optionalAnalysisFeatures\.highlights && \(/);
  assert.match(pageSource, /optionalAnalysisFeatures\.takeaways[\s\S]*fetch\("\/api\/generate-summary"/);
  assert.match(pageSource, /optionalAnalysisFeatures\.quickPreview[\s\S]*fetch\("\/api\/quick-preview"/);
  assert.match(pageSource, /showChatTab=\{optionalAnalysisFeatures\.chat && showChatTab\}/);
  assert.match(pageSource, /showNotesTab=\{optionalAnalysisFeatures\.notes\}/);
  assert.match(pageSource, /optionalAnalysisFeatures\.transcriptExport \? handleRequestExport : undefined/);
});

test('right column does not mount optional chat and notes panels when disabled', () => {
  assert.match(rightColumnTabsSource, /showNotesTab\?: boolean/);
  assert.match(rightColumnTabsSource, /enableExplainSelection=\{showChatTab\}/);
  assert.match(rightColumnTabsSource, /\{showChatTab && \(\s*<AIChat/);
  assert.match(rightColumnTabsSource, /\{showNotesTab && \(\s*<div className=\{cn\("absolute inset-0"/);
});
