import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BilibiliAdapter,
  createTranscriptResult,
  resolvePlatformAdapter,
  YouTubeAdapter,
} from '../platform';
import { setBilibiliAudioTranscriberForTest } from '../platform/bilibili-asr';
import { extractSupportedVideoId } from '../utils';

function withMockFetch<T>(mockFetch: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>
) {
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

test('BilibiliAdapter explains no-subtitle videos when ASR is not configured', async () => {
  await withEnv(
    {
      GEMINI_API_KEY: undefined,
      BILIBILI_ASR_PROVIDER: undefined,
      BILIBILI_ENABLE_MOCK_ASR: undefined,
    },
    async () => withMockFetch(
      async (input) => {
        const url = String(input);

        if (url.includes('/x/web-interface/view')) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                aid: 123,
                bvid: 'BV1NoSubtitles',
                cid: 333,
                title: 'No subtitle test',
                duration: 60,
                pages: [{ cid: 333, page: 1, part: 'Part 1', duration: 60 }],
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
                need_login_subtitle: true,
                subtitle: { subtitles: [] },
              },
            }),
            { status: 200 }
          );
        }

        return new Response('{}', { status: 404 });
      },
      async () => {
        const parsed = await BilibiliAdapter.parseUrl(
          'https://www.bilibili.com/video/BV1NoSubtitles/'
        );
        const transcript = await BilibiliAdapter.fetchTranscript(parsed, {
          expectedDuration: 60,
        });

        assert.equal(transcript.segments.length, 0);
        assert.equal(transcript.source, 'unknown');
        assert.match(
          transcript.warnings.join('\n'),
          /Configure BILIBILI_COOKIE/
        );
        assert.equal(
          (transcript.raw as any).asr.status,
          'not_configured'
        );
      }
    )
  );
});

test('BilibiliAdapter falls back to mocked ASR audio transcript when native subtitles are unavailable', async () => {
  const requestedUrls: string[] = [];

  await withEnv(
    {
      GEMINI_API_KEY: undefined,
      BILIBILI_ASR_PROVIDER: 'mock',
      BILIBILI_ENABLE_MOCK_ASR: 'true',
    },
    async () => {
      setBilibiliAudioTranscriberForTest(async (input) => {
        assert.equal(input.mimeType, 'audio/mp4');
        assert.deepEqual([...input.audioBytes], [1, 2, 3, 4]);
        assert.equal(input.expectedDuration, 60);

        return {
          language: 'zh-CN',
          segments: [
            { text: '这是转写后的第一段', start: 0, duration: 4 },
            { text: '这是转写后的第二段', start: 4, duration: 5 },
          ],
          warnings: ['Mock ASR warning'],
          raw: {
            model: 'mock-bilibili-asr',
            usage: { totalTokens: 12 },
          },
        };
      });

      try {
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
                    bvid: 'BV1AudioFallback',
                    cid: 333,
                    title: 'Audio fallback test',
                    duration: 60,
                    pages: [{ cid: 333, page: 1, part: 'Part 1', duration: 60 }],
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
                    need_login_subtitle: true,
                    subtitle: { subtitles: [] },
                  },
                }),
                { status: 200 }
              );
            }

            if (url.includes('/x/player/playurl')) {
              return new Response(
                JSON.stringify({
                  code: 0,
                  data: {
                    dash: {
                      audio: [
                        {
                          id: 30280,
                          bandwidth: 109338,
                          codecs: 'mp4a.40.2',
                          mimeType: 'audio/mp4',
                          baseUrl: 'https://audio.example/high.m4s',
                        },
                        {
                          id: 30216,
                          bandwidth: 65685,
                          codecs: 'mp4a.40.2',
                          mimeType: 'audio/mp4',
                          baseUrl: 'https://audio.example/low.m4s',
                        },
                      ],
                    },
                  },
                }),
                { status: 200 }
              );
            }

            if (url === 'https://audio.example/low.m4s') {
              return new Response(new Uint8Array([1, 2, 3, 4]), {
                status: 200,
                headers: {
                  'content-length': '4',
                  'content-type': 'audio/mp4',
                },
              });
            }

            return new Response('{}', { status: 404 });
          },
          async () => {
            const parsed = await BilibiliAdapter.parseUrl(
              'https://www.bilibili.com/video/BV1AudioFallback/'
            );
            const transcript = await BilibiliAdapter.fetchTranscript(parsed, {
              expectedDuration: 60,
            });

            assert.equal(transcript.source, 'ai');
            assert.equal(transcript.language, 'zh-CN');
            assert.equal(transcript.segments.length, 2);
            assert.equal(
              transcript.segments[0].id,
              'bilibili-BV1AudioFallback-333-asr-0'
            );
            assert.match(
              transcript.warnings.join('\n'),
              /Bilibili subtitles require login/
            );
            assert.match(transcript.warnings.join('\n'), /Mock ASR warning/);
            assert.equal((transcript.raw as any).asr.status, 'success');
            assert.equal((transcript.raw as any).asr.audio.id, 30216);
          }
        );
      } finally {
        setBilibiliAudioTranscriberForTest(null);
      }
    }
  );

  assert.ok(requestedUrls.some((url) => url.includes('/x/player/playurl')));
  assert.ok(requestedUrls.includes('https://audio.example/low.m4s'));
});

test('BilibiliAdapter retries when long-video subtitle URLs do not match the selected cid', async () => {
  const requestedUrls: string[] = [];
  let playerRequests = 0;

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
              bvid: 'BV1SubtitleDrift',
              cid: 333,
              title: 'Subtitle drift test',
              duration: 948,
              pages: [{ cid: 333, page: 1, part: 'Part 1', duration: 948 }],
            },
          }),
          { status: 200 }
        );
      }

      if (url.includes('/x/player/v2')) {
        playerRequests += 1;

        if (playerRequests === 1) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                need_login_subtitle: false,
                subtitle: {
                  subtitles: [
                    {
                      id: 1,
                      lan: 'ai-zh',
                      lan_doc: 'Chinese',
                      subtitle_url: '//subtitle.example/prod/wrong-video.json',
                      type: 1,
                      ai_status: 2,
                    },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              need_login_subtitle: false,
              subtitle: {
                subtitles: [
                  {
                    id: 2,
                    lan: 'ai-zh',
                    lan_doc: 'Chinese',
                    subtitle_url: '//subtitle.example/prod/123333-correct.json',
                    type: 1,
                    ai_status: 2,
                  },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }

      if (url === 'https://subtitle.example/prod/123333-correct.json') {
        return new Response(
          JSON.stringify({
            body: [
              { from: 0, to: 3, content: '正确字幕第一句' },
              { from: 3, to: 6, content: '正确字幕第二句' },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 404 });
    },
    async () => {
      const parsed = await BilibiliAdapter.parseUrl(
        'https://www.bilibili.com/video/BV1SubtitleDrift/'
      );
      const transcript = await BilibiliAdapter.fetchTranscript(parsed, {
        expectedDuration: 948,
      });

      assert.equal(transcript.source, 'ai');
      assert.equal(transcript.language, 'ai-zh');
      assert.equal(transcript.segments[0].text, '正确字幕第一句');
    }
  );

  assert.equal(playerRequests, 2);
  assert.ok(
    !requestedUrls.includes('https://subtitle.example/prod/wrong-video.json')
  );
  assert.ok(
    requestedUrls.includes('https://subtitle.example/prod/123333-correct.json')
  );
});

test('BilibiliAdapter supports explicit local mock ASR provider for MVP smoke validation', async () => {
  const requestedUrls: string[] = [];

  await withEnv(
    {
      GEMINI_API_KEY: undefined,
      BILIBILI_ASR_PROVIDER: 'mock',
      BILIBILI_ENABLE_MOCK_ASR: 'true',
    },
    async () => withMockFetch(
      async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes('/x/web-interface/view')) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                aid: 123,
                bvid: 'BV1MockAsr',
                cid: 333,
                title: 'Mock ASR validation',
                duration: 80,
                pages: [{ cid: 333, page: 1, part: 'Part 1', duration: 80 }],
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
                need_login_subtitle: true,
                subtitle: { subtitles: [] },
              },
            }),
            { status: 200 }
          );
        }

        if (url.includes('/x/player/playurl')) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                dash: {
                  audio: [
                    {
                      id: 30216,
                      bandwidth: 65685,
                      codecs: 'mp4a.40.2',
                      mimeType: 'audio/mp4',
                      baseUrl: 'https://audio.example/mock.m4s',
                    },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }

        if (url === 'https://audio.example/mock.m4s') {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              'content-length': '3',
              'content-type': 'audio/mp4',
            },
          });
        }

        return new Response('{}', { status: 404 });
      },
      async () => {
        const parsed = await BilibiliAdapter.parseUrl(
          'https://www.bilibili.com/video/BV1MockAsr/'
        );
        const transcript = await BilibiliAdapter.fetchTranscript(parsed, {
          expectedDuration: 80,
        });

        assert.equal(transcript.source, 'ai');
        assert.equal(transcript.segments.length, 8);
        assert.match(
          transcript.segments[0].text,
          /Mock ASR transcript for local MVP validation/
        );
        assert.match(
          transcript.warnings.join('\n'),
          /Mock Bilibili ASR transcript was used/
        );
        assert.equal((transcript.raw as any).asr.provider, 'mock');
        assert.equal((transcript.raw as any).asr.status, 'success');
      }
    )
  );

  assert.ok(requestedUrls.some((url) => url.includes('/x/player/playurl')));
  assert.ok(requestedUrls.includes('https://audio.example/mock.m4s'));
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
