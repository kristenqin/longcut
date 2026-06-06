import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('Concept Map API uses optional user AI settings and the Concept Map analyzer', () => {
  const routeSource = readProjectFile('app/api/concept-map/route.ts');

  assert.match(routeSource, /generateConceptMapFromTranscript/);
  assert.match(routeSource, /resolveUserAIProviderConfig/);
  assert.match(routeSource, /createUserConfiguredGenerateAI/);
  assert.match(routeSource, /createTranscriptResult/);
  assert.match(routeSource, /configSource:\s*userAIConfig \? 'user' : 'workspace_default'/);
  assert.doesNotMatch(routeSource, /@\/lib\/ai-processing/);
});

test('Concept Map API preserves transcript source metadata when provided', () => {
  const routeSource = readProjectFile('app/api/concept-map/route.ts');

  assert.match(routeSource, /transcriptMetaSchema/);
  assert.match(routeSource, /transcriptMeta:\s*transcriptMetaSchema\.optional\(\)/);
  assert.match(routeSource, /normalizeTranscriptSource/);
  assert.match(routeSource, /case 'youtube-direct':/);
  assert.match(routeSource, /source:\s*normalizeTranscriptSource\(parsedBody\.transcriptMeta\?\.source\)/);
});

test('Concept Map API is available to the MVP without requiring authentication', () => {
  const routeSource = readProjectFile('app/api/concept-map/route.ts');

  assert.match(routeSource, /CONCEPT_MAP_SECURITY/);
  assert.match(routeSource, /csrfProtection:\s*false/);
  assert.match(routeSource, /supabase\.auth\s*\n\s*\.getUser\(\)\s*\n\s*\.catch/);
  assert.doesNotMatch(routeSource, /SECURITY_PRESETS\.AUTHENTICATED/);
  assert.doesNotMatch(routeSource, /Authentication required/);
  assert.doesNotMatch(routeSource, /user\.id\)\s*:\s*await/);
});

test('Concept Map API reports model analysis failures without collapsing to a generic 500', () => {
  const routeSource = readProjectFile('app/api/concept-map/route.ts');

  assert.match(routeSource, /Failed to generate Concept Map\./);
  assert.match(routeSource, /status:\s*502/);
  assert.match(routeSource, /details:\s*message/);
});
