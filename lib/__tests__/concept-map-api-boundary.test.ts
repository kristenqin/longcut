import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('Concept Map API uses user AI settings and the Concept Map analyzer', () => {
  const routeSource = readProjectFile('app/api/concept-map/route.ts');

  assert.match(routeSource, /generateConceptMapFromTranscript/);
  assert.match(routeSource, /resolveUserAIProviderConfig/);
  assert.match(routeSource, /createUserConfiguredGenerateAI/);
  assert.match(routeSource, /createTranscriptResult/);
  assert.doesNotMatch(routeSource, /@\/lib\/ai-processing/);
});
