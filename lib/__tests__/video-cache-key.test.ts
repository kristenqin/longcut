import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTranscriptIdPrefix, buildVideoCacheKey } from '../video-cache-key';

test('video cache key keeps YouTube legacy shape', () => {
  assert.equal(
    buildVideoCacheKey({
      platform: 'youtube',
      platformVideoId: 'abc123xyz89',
      platformPartId: null,
    }),
    'youtube:abc123xyz89'
  );
});

test('video cache key includes Bilibili part id when present', () => {
  assert.equal(
    buildVideoCacheKey({
      platform: 'bilibili',
      platformVideoId: 'BV1xx411c7mD',
      platformPartId: '222',
    }),
    'bilibili:BV1xx411c7mD:222'
  );
});

test('transcript id prefix includes Bilibili part id when present', () => {
  assert.equal(
    buildTranscriptIdPrefix({
      platform: 'bilibili',
      platformVideoId: 'BV1xx411c7mD',
      platformPartId: '222',
    }),
    'bilibili-BV1xx411c7mD-222'
  );
});
