import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BilibiliAdapter,
  createTranscriptResult,
  resolvePlatformAdapter,
  YouTubeAdapter,
} from '../platform';
import { extractSupportedVideoId } from '../utils';

function withMockFetch<T>(mockFetch: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('platform registry resolves YouTube URLs to YouTubeAdapter', () => {
  assert.equal(
    resolvePlatformAdapter('https://www.youtube.com/watch?v=abc123xyz89'),
    YouTubeAdapter
  );
});

test('platform registry resolves Bilibili URLs to BilibiliAdapter', () => {
  assert.equal(
    resolvePlatformAdapter('https://www.bilibili.com/video/BV1xx411c7mD/?p=2'),
    BilibiliAdapter
  );
});

test('client-safe URL detection accepts Bilibili and YouTube URLs', () => {
  assert.deepEqual(
    extractSupportedVideoId('https://www.bilibili.com/video/BV1DQ7k6JE4P/?spm_id_from=333.1007'),
    { platform: 'bilibili', videoId: 'BV1DQ7k6JE4P' }
  );
  assert.deepEqual(
    extractSupportedVideoId('https://www.youtube.com/watch?v=abc123xyz89'),
    { platform: 'youtube', videoId: 'abc123xyz89' }
  );
});

test('YouTubeAdapter parses a canonical VideoRef', async () => {
  const ref = await YouTubeAdapter.parseUrl('https://youtu.be/abc123xyz89');

  assert.deepEqual(ref, {
    platform: 'youtube',
    canonicalUrl: 'https://www.youtube.com/watch?v=abc123xyz89',
    platformVideoId: 'abc123xyz89',
    platformPartId: null,
    raw: { url: 'https://youtu.be/abc123xyz89' },
  });
});

test('BilibiliAdapter parses bvid URL with page', async () => {
  const ref = await BilibiliAdapter.parseUrl(
    'https://www.bilibili.com/video/BV1xx411c7mD/?p=2'
  );

  assert.deepEqual(ref, {
    platform: 'bilibili',
    canonicalUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
    platformVideoId: 'BV1xx411c7mD',
    platformPartId: null,
    raw: {
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/?p=2',
      bvid: 'BV1xx411c7mD',
      aid: undefined,
      page: 2,
    },
  });
});

test('BilibiliAdapter selects page cid and normalizes subtitle transcript', async () => {
  const requestedUrls: string[] = [];

  await withMockFetch(
    async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/x/web-interface/view')) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              aid: 123,
              bvid: 'BV1xx411c7mD',
              cid: 111,
              title: 'Bilibili Test',
              desc: 'Description',
              pic: 'https://i.example/cover.jpg',
              owner: { name: 'UP' },
              duration: 45,
              pages: [
                { cid: 111, page: 1, part: 'Part 1', duration: 20 },
                { cid: 222, page: 2, part: 'Part 2', duration: 25 },
              ],
            },
          }),
          { status: 200 }
        );
      }

      if (url.includes('/x/player/v2')) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              subtitle: {
                need_login_subtitle: false,
                subtitles: [
                  {
                    id: 9,
                    lan: 'zh-CN',
                    lan_doc: 'Chinese',
                    subtitle_url: '//subtitle.example/subtitle.json',
                  },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }

      if (url === 'https://subtitle.example/subtitle.json') {
        return new Response(
          JSON.stringify({
            body: [
              { from: 0, to: 2.5, content: '第一句' },
              { from: 2.5, to: 5, content: '第二句' },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 404 });
    },
    async () => {
      const parsed = await BilibiliAdapter.parseUrl(
        'https://www.bilibili.com/video/BV1xx411c7mD/?p=2'
      );
      const metadata = await BilibiliAdapter.fetchMetadata(parsed);
      const transcript = await BilibiliAdapter.fetchTranscript(parsed);

      assert.equal(metadata.platformVideoId, 'BV1xx411c7mD');
      assert.equal(metadata.platformPartId, '222');
      assert.equal(metadata.duration, 25);
      assert.equal(transcript.language, 'zh-CN');
      assert.equal(transcript.source, 'manual');
      assert.equal(transcript.segments[0].id, 'bilibili-BV1xx411c7mD-222-9-0');
      assert.equal(transcript.segments[1].start, 2.5);
      assert.equal(transcript.quality.durationCoverage, 0.2);
    }
  );

  assert.ok(requestedUrls.some((url) => url.includes('bvid=BV1xx411c7mD')));
  assert.ok(requestedUrls.some((url) => url.includes('cid=222')));
});

test('createTranscriptResult normalizes ids, end times, and quality warnings', () => {
  const result = createTranscriptResult(
    [
      { text: 'Hello', start: 0, duration: 2 },
      { text: 'World', start: 2, duration: 3 },
    ],
    {
      idPrefix: 'youtube-test',
      language: 'en',
      source: 'manual',
      expectedDuration: 10,
    }
  );

  assert.equal(result.segments[0].id, 'youtube-test-0');
  assert.equal(result.segments[1].end, 5);
  assert.equal(result.quality.segmentCount, 2);
  assert.equal(result.quality.isMonotonic, true);
  assert.equal(result.quality.durationCoverage, 0.5);
});
