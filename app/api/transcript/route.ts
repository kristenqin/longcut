import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { shouldUseMockData, getMockTranscript } from '@/lib/mock-data';
import { mergeTranscriptSegmentsIntoSentences } from '@/lib/transcript-sentence-merger';
import { resolvePlatformAdapter, type TranscriptResult, type VideoMetadata, type VideoRef } from '@/lib/platform';
import { invalidJsonBodyResponse, isInvalidJsonBodyError, readJsonObject } from '@/lib/api-json';
import {
  fetchYouTubeTranscript,
  TranscriptProviderError,
  type TranscriptErrorCode,
} from '@/lib/youtube-transcript-provider';

type RawTranscriptSegment = { text: string; start: number; duration: number };

function errorResponse(
  payload: Record<string, unknown>,
  status: number
) {
  return NextResponse.json(payload, { status });
}

// Calculate transcript duration from segments
function calculateTranscriptDuration(segments: { start: number; duration: number }[]): number {
  if (segments.length === 0) return 0;
  const lastSegment = segments[segments.length - 1];
  return lastSegment.start + lastSegment.duration;
}

function serializeVideoRef(ref: VideoRef) {
  return {
    platform: ref.platform,
    canonicalUrl: ref.canonicalUrl,
    platformVideoId: ref.platformVideoId,
    platformPartId: ref.platformPartId ?? null,
    raw: ref.raw,
  };
}

function serializeVideoInfo(metadata: VideoMetadata) {
  return {
    videoId: metadata.platformVideoId,
    platform: metadata.platform,
    title: metadata.title,
    author: metadata.author ?? 'Unknown',
    thumbnail: metadata.thumbnail ?? '',
    duration: metadata.duration ?? 0,
    description: metadata.description,
    tags: metadata.tags,
    language: metadata.language,
    availableLanguages: metadata.availableLanguages,
    videoRef: serializeVideoRef({
      platform: metadata.platform,
      canonicalUrl: metadata.canonicalUrl,
      platformVideoId: metadata.platformVideoId,
      platformPartId: metadata.platformPartId ?? null,
    }),
  };
}

function buildTranscriptResponse(input: {
  videoId: string;
  platform: string;
  videoRef?: VideoRef;
  rawSegments: RawTranscriptSegment[];
  language?: string;
  availableLanguages?: string[];
  expectedDuration?: number | null;
  source?: string;
  warnings?: string[];
  videoInfo?: ReturnType<typeof serializeVideoInfo>;
}) {
  const mergedSentences = mergeTranscriptSegmentsIntoSentences(input.rawSegments);
  const transformedTranscript = mergedSentences.map((sentence) => ({
    text: sentence.text,
    start: sentence.segments[0].start,
    duration: sentence.segments.reduce((sum, seg) => sum + seg.duration, 0)
  }));

  const transcriptDuration = calculateTranscriptDuration(input.rawSegments);
  const coverageRatio = input.expectedDuration ? transcriptDuration / input.expectedDuration : null;
  const isPartial = input.expectedDuration
    ? transcriptDuration < input.expectedDuration * 0.5
    : false;

  return {
    videoId: input.videoId,
    platform: input.platform,
    videoRef: input.videoRef ? serializeVideoRef(input.videoRef) : undefined,
    videoInfo: input.videoInfo,
    transcript: transformedTranscript,
    language: input.language,
    availableLanguages: input.availableLanguages,
    source: input.source,
    warnings: input.warnings,
    transcriptDuration: Math.round(transcriptDuration),
    segmentCount: transformedTranscript.length,
    rawSegmentCount: input.rawSegments.length,
    isPartial,
    coverageRatio: coverageRatio ? Math.round(coverageRatio * 100) : undefined,
  };
}

function rawSegmentsFromTranscriptResult(result: TranscriptResult): RawTranscriptSegment[] {
  return result.segments.map((segment) => ({
    text: segment.text,
    start: segment.start,
    duration: segment.duration,
  }));
}

function getTranscriptFallbackStatus(result: TranscriptResult): string | undefined {
  const raw = result.raw;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const asr = (raw as Record<string, unknown>).asr;
  if (!asr || typeof asr !== 'object') {
    return undefined;
  }

  const status = (asr as Record<string, unknown>).status;
  return typeof status === 'string' ? status : undefined;
}

function buildBilibiliNoTranscriptDetails(fallbackStatus?: string): string {
  switch (fallbackStatus) {
    case 'not_configured':
      return 'This video has no publicly available Bilibili subtitle track. Configure BILIBILI_COOKIE to access login-required subtitles, or enable mock Bilibili ASR only for local smoke validation.';
    case 'disabled':
      return 'This video has no publicly available Bilibili subtitle track, and local mock Bilibili ASR is disabled. Configure BILIBILI_COOKIE for real subtitles.';
    case 'audio_too_large':
      return 'This video has no publicly available Bilibili subtitle track, and the audio source is larger than the configured local smoke limit. Increase BILIBILI_ASR_MAX_AUDIO_BYTES or provide a native subtitle source.';
    case 'no_audio':
      return 'This video has no publicly available Bilibili subtitle track, and Bilibili did not return a usable audio track for local smoke validation.';
    case 'failed':
      return 'This video has no publicly available Bilibili subtitle track, and the local smoke transcript fallback failed.';
    default:
      return 'This video has no publicly available Bilibili subtitle track. Configure BILIBILI_COOKIE for authenticated Bilibili subtitles.';
  }
}

function buildBilibiliNoTranscriptErrorCode(fallbackStatus?: string): string {
  switch (fallbackStatus) {
    case 'not_configured':
      return 'BILIBILI_TRANSCRIPT_SOURCE_NOT_CONFIGURED';
    case 'disabled':
      return 'BILIBILI_MOCK_TRANSCRIPT_DISABLED';
    case 'audio_too_large':
      return 'BILIBILI_AUDIO_TOO_LARGE';
    case 'no_audio':
      return 'BILIBILI_AUDIO_UNAVAILABLE';
    case 'failed':
      return 'BILIBILI_MOCK_TRANSCRIPT_FAILED';
    default:
      return 'NO_NATIVE_SUBTITLE';
  }
}

function youtubeFailureStatus(code: TranscriptErrorCode): number {
  switch (code) {
    case 'BOT_DETECTED':
    case 'IP_BLOCKED':
      return 429;
    case 'PAGE_FETCH_FAILED':
    case 'INNERTUBE_REJECTED':
    case 'CAPTION_FETCH_FAILED':
      return 503;
    case 'AGE_RESTRICTED':
    case 'VIDEO_UNAVAILABLE':
      return 403;
    case 'TRANSCRIPTS_DISABLED':
    case 'NO_TRANSCRIPT':
      return 404;
    default:
      return 502;
  }
}

function buildYoutubeFailurePayload(error: unknown) {
  if (!(error instanceof TranscriptProviderError)) {
    return null;
  }

  switch (error.code) {
    case 'BOT_DETECTED':
    case 'IP_BLOCKED':
      return {
        status: youtubeFailureStatus(error.code),
        payload: {
          error: 'YouTube blocked transcript fetching from this environment.',
          details:
            'Configure SUPADATA_API_KEY as a transcript fallback, or run the Next.js server with a network route that can reach YouTube.',
          errorCode: error.code,
        },
      };
    case 'PAGE_FETCH_FAILED':
    case 'INNERTUBE_REJECTED':
    case 'CAPTION_FETCH_FAILED':
      return {
        status: youtubeFailureStatus(error.code),
        payload: {
          error: 'Could not reach YouTube to fetch the transcript.',
          details:
            'The server request failed before transcript availability could be checked. Configure a reachable network/proxy for the Next.js process or set SUPADATA_API_KEY.',
          errorCode: error.code,
        },
      };
    default:
      return null;
  }
}

async function handler(request: NextRequest) {
  try {
    const { url, lang, expectedDuration } = await readJsonObject(request);

    if (!url || typeof url !== 'string') {
      return errorResponse({ error: 'Video URL is required' }, 400);
    }

    const adapter = resolvePlatformAdapter(url);
    if (!adapter) {
      return errorResponse({ error: 'Invalid video URL' }, 400);
    }

    const parsedRef = await adapter.parseUrl(url);
    const videoId = parsedRef.platformVideoId;

    if (shouldUseMockData()) {
      console.log(
        '[TRANSCRIPT] Using mock data (NEXT_PUBLIC_USE_MOCK_DATA=true)'
      );
      const mockData = getMockTranscript();

      const rawSegments = mockData.content.map((item: any) => ({
        text: item.text,
        start: item.offset / 1000, // Convert milliseconds to seconds
        duration: item.duration / 1000 // Convert milliseconds to seconds
      }));

      // Merge segments into complete sentences for better translation
      const mergedSentences = mergeTranscriptSegmentsIntoSentences(rawSegments);
      const transformedTranscript = mergedSentences.map((sentence) => ({
        text: sentence.text,
        start: sentence.segments[0].start, // Use first segment's start time
        duration: sentence.segments.reduce((sum, seg) => sum + seg.duration, 0) // Sum all durations
      }));

      const transcriptDuration = rawSegments.length > 0
        ? rawSegments[rawSegments.length - 1].start + rawSegments[rawSegments.length - 1].duration
        : 0;

      return NextResponse.json({
        videoId,
        transcript: transformedTranscript,
        language: mockData.lang || 'en',
        availableLanguages: mockData.availableLangs || ['en'],
        transcriptDuration: Math.round(transcriptDuration),
        segmentCount: transformedTranscript.length,
        rawSegmentCount: rawSegments.length,
        isPartial: false,
        coverageRatio: undefined,
      });
    }

    if (adapter.platform !== 'youtube') {
      const metadata = await adapter.fetchMetadata(parsedRef);
      const videoRef: VideoRef = {
        ...parsedRef,
        canonicalUrl: metadata.canonicalUrl,
        platformVideoId: metadata.platformVideoId,
        platformPartId: metadata.platformPartId ?? parsedRef.platformPartId ?? null,
        raw: {
          ...(parsedRef.raw ?? {}),
          ...(
            metadata.raw && typeof metadata.raw === 'object'
              ? metadata.raw as Record<string, unknown>
              : {}
          ),
        },
      };
      const transcriptResult = await adapter.fetchTranscript(videoRef, {
        preferredLanguage: typeof lang === 'string' ? lang : undefined,
        expectedDuration: typeof expectedDuration === 'number' ? expectedDuration : metadata.duration,
      });
      const rawSegments = rawSegmentsFromTranscriptResult(transcriptResult);
      const videoInfo = serializeVideoInfo(metadata);

      if (rawSegments.length === 0) {
        const fallbackStatus = getTranscriptFallbackStatus(transcriptResult);
        return errorResponse(
          {
            error: 'No transcript available for this Bilibili video.',
            details: buildBilibiliNoTranscriptDetails(fallbackStatus),
            errorCode: buildBilibiliNoTranscriptErrorCode(fallbackStatus),
            fallbackStatus,
            platform: adapter.platform,
            videoId: metadata.platformVideoId,
            videoRef: serializeVideoRef(videoRef),
            videoInfo,
            warnings: transcriptResult.warnings,
          },
          404
        );
      }

      console.log(`[TRANSCRIPT] Using ${adapter.platform} result:`, {
        videoId: metadata.platformVideoId,
        segmentCount: rawSegments.length,
        transcriptDuration: Math.round(calculateTranscriptDuration(rawSegments)),
        language: transcriptResult.language,
        availableLanguages: transcriptResult.availableLanguages,
        source: transcriptResult.source,
      });

      return NextResponse.json(buildTranscriptResponse({
        videoId: metadata.platformVideoId,
        platform: adapter.platform,
        videoRef,
        videoInfo,
        rawSegments,
        language: transcriptResult.language,
        availableLanguages: transcriptResult.availableLanguages,
        expectedDuration: typeof expectedDuration === 'number' ? expectedDuration : metadata.duration,
        source: transcriptResult.source,
        warnings: transcriptResult.warnings,
      }));
    }

    // ── Strategy: Try YouTube direct first (free), fall back to Supadata (paid) ──
    // YouTube's InnerTube API is free but gets blocked from datacenter IPs.
    // Supadata is a paid API that handles YouTube's bot detection for us.
    // By trying free first, we only pay for Supadata when YouTube blocks us.

    let rawSegments: RawTranscriptSegment[] | null = null;
    let language: string | undefined;
    let availableLanguages: string[] | undefined;
    let source: 'youtube-direct' | 'supadata' = 'youtube-direct';
    let youtubeDirectError: unknown = null;

    // ── Attempt 1: YouTube InnerTube API (free) ──
    const preferredLanguage = typeof lang === 'string' ? lang : undefined;
    const expectedVideoDuration = typeof expectedDuration === 'number' ? expectedDuration : undefined;

    console.log(`[TRANSCRIPT] Trying YouTube direct for ${videoId} (lang=${preferredLanguage ?? 'auto'})`);
    try {
      const ytResult = await fetchYouTubeTranscript(videoId, preferredLanguage);
      if (ytResult && ytResult.segments.length > 0) {
        rawSegments = ytResult.segments;
        language = ytResult.language;
        availableLanguages = ytResult.availableLanguages;
        source = 'youtube-direct';
        console.log(`[TRANSCRIPT] YouTube direct succeeded: ${rawSegments.length} segments, lang=${language}`);
      }
    } catch (ytError) {
      youtubeDirectError = ytError;
      console.warn(`[TRANSCRIPT] YouTube direct failed:`, ytError instanceof Error ? ytError.message : String(ytError));
    }

    // ── Attempt 2: Supadata API (paid fallback) ──
    if (!rawSegments || rawSegments.length === 0) {
      const supadataKey = process.env.SUPADATA_API_KEY;
      if (supadataKey) {
        console.log(`[TRANSCRIPT] Falling back to Supadata for ${videoId}`);
        source = 'supadata';
        try {
          const apiUrl = new URL('https://api.supadata.ai/v1/transcript');
          apiUrl.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
          if (preferredLanguage) apiUrl.searchParams.set('lang', preferredLanguage);

          const supadataResp = await fetch(apiUrl.toString(), {
            method: 'GET',
            headers: { 'x-api-key': supadataKey, 'Content-Type': 'application/json' },
          });

          if (supadataResp.ok) {
            const body = await supadataResp.json() as Record<string, unknown>;
            const content = Array.isArray(body?.content) ? body.content
              : Array.isArray(body?.transcript) ? body.transcript
              : Array.isArray(body) ? body : null;

            if (content && content.length > 0) {
              // Supadata returns timestamps in either ms or seconds — detect and normalize
              const sampleSize = Math.min(5, content.length);
              let totalOffset = 0;
              let offsetCount = 0;
              for (let i = 0; i < sampleSize; i++) {
                const val = content[i].offset ?? content[i].start ?? 0;
                if (val > 0) { totalOffset += val; offsetCount++; }
              }
              const isMs = offsetCount > 0 && (totalOffset / offsetCount) > 500;

              rawSegments = content.map((item: any) => ({
                text: (item.text || item.content || '').replace(/^>>\s*/gm, ''),
                start: isMs ? ((item.offset ?? item.start ?? 0) / 1000) : (item.offset ?? item.start ?? 0),
                duration: isMs ? ((item.duration ?? 0) / 1000) : (item.duration ?? 0),
              }));
              language = typeof body?.lang === 'string' ? body.lang : undefined;
              availableLanguages = Array.isArray(body?.availableLangs)
                ? (body.availableLangs as unknown[]).filter((l): l is string => typeof l === 'string')
                : undefined;
              console.log(`[TRANSCRIPT] Supadata fallback succeeded: ${rawSegments!.length} segments`);
            }
          } else {
            console.warn(`[TRANSCRIPT] Supadata returned ${supadataResp.status}`);
          }
        } catch (supErr) {
          console.error(`[TRANSCRIPT] Supadata fallback failed:`, supErr instanceof Error ? supErr.message : String(supErr));
        }
      } else {
        console.warn(`[TRANSCRIPT] YouTube direct failed and no SUPADATA_API_KEY configured`);
      }
    }

    // ── Both methods failed ──
    if (!rawSegments || rawSegments.length === 0) {
      const youtubeFailure = buildYoutubeFailurePayload(youtubeDirectError);
      if (youtubeFailure) {
        return errorResponse(youtubeFailure.payload, youtubeFailure.status);
      }

      return errorResponse(
        { error: 'No transcript available for this video. The video may not have subtitles enabled.' },
        404
      );
    }

    console.log(`[TRANSCRIPT] Using ${source} result:`, {
      videoId,
      segmentCount: rawSegments.length,
      transcriptDuration: Math.round(calculateTranscriptDuration(rawSegments)),
      language,
      availableLanguages,
    });

    const transcriptDuration = calculateTranscriptDuration(rawSegments);

    // Determine if transcript might be partial
    const coverageRatio = expectedVideoDuration ? transcriptDuration / expectedVideoDuration : null;
    const isPartial = expectedVideoDuration
      ? transcriptDuration < expectedVideoDuration * 0.5 // Less than 50% coverage
      : false;

    // Diagnostic logging: track processed transcript stats
    console.log('[TRANSCRIPT] Processed transcript:', {
      videoId,
      source,
      rawSegmentCount: rawSegments.length,
      transcriptDuration: Math.round(transcriptDuration),
      expectedDuration: expectedVideoDuration ?? 'not provided',
      coverageRatio: coverageRatio ? `${Math.round(coverageRatio * 100)}%` : 'unknown',
      isPartial,
      firstSegmentStart: rawSegments[0]?.start,
      lastSegmentEnd: rawSegments.length > 0
        ? rawSegments[rawSegments.length - 1].start + rawSegments[rawSegments.length - 1].duration
        : 0
    });

    return NextResponse.json(buildTranscriptResponse({
      videoId,
      platform: 'youtube',
      videoRef: parsedRef,
      rawSegments,
      language,
      availableLanguages,
      expectedDuration: expectedVideoDuration,
      source,
    }));
  } catch (error) {
    if (isInvalidJsonBodyError(error)) {
      return invalidJsonBodyResponse();
    }

    console.error('[TRANSCRIPT] Error processing transcript:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name
    });
    return errorResponse({ error: 'Failed to fetch transcript' }, 500);
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
