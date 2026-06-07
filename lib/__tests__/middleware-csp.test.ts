import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('middleware CSP allows supported embedded video players', () => {
  const middlewareSource = readProjectFile('middleware.ts');

  assert.match(
    middlewareSource,
    /frame-src[^'"]*https:\/\/www\.youtube\.com[^'"]*https:\/\/youtube\.com/
  );
  assert.match(middlewareSource, /frame-src[^'"]*https:\/\/player\.bilibili\.com/);
});
