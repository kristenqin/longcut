import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
} from '@google/generative-ai';
import { z } from 'zod';

type RawTranscriptSegment = {
  text: string;
  start: number;
  duration: number;
};

type AsrFallbackStatus =
  | 'success'
  | 'disabled'
  | 'not_configured'
  | 'no_audio'
  | 'audio_too_large'
  | 'failed';

interface BilibiliDashAudio {
  id?: number;
  bandwidth?: number;
  codecs?: string;
  mimeType?: string;
  baseUrl?: string;
  base_url?: string;
}

interface BilibiliPlayurlPayload {
  code: number;
  message?: string;
  data?: {
    dash?: {
      audio?: BilibiliDashAudio[];
    };
  };
}

export interface AudioTranscriberInput {
  audioBytes: Uint8Array;
  mimeType: string;
  title?: string;
  preferredLanguage?: string;
  expectedDuration?: number | null;
}

export interface AudioTranscriptionResult {
  segments: RawTranscriptSegment[];
  language?: string;
  warnings?: string[];
  raw?: unknown;
}

export interface BilibiliAsrInput {
  aid?: number;
  bvid: string;
  cid: number;
  page: number;
  canonicalUrl: string;
  title?: string;
  preferredLanguage?: string;
  expectedDuration?: number | null;
}

export interface BilibiliAsrTranscriptResult {
  segments: RawTranscriptSegment[];
  language?: string;
  warnings: string[];
  raw: {
    asr: {
      status: AsrFallbackStatus;
      provider: 'gemini';
      model?: string;
      audio?: {
        id?: number;
        bandwidth?: number;
        codecs?: string;
        mimeType: string;
        bytes?: number;
      };
      error?: string;
      usage?: unknown;
    };
  };
}

type AudioTranscriber = (
  input: AudioTranscriberInput
) => Promise<AudioTranscriptionResult>;

const DEFAULT_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_GEMINI_ASR_MODEL = 'gemini-2.5-flash-lite';

let transcriberForTest: AudioTranscriber | null = null;

const geminiAsrSegmentSchema = z.object({
  start: z.coerce.number(),
  duration: z.coerce.number().optional(),
  end: z.coerce.number().optional(),
  text: z.coerce.string(),
});

const geminiAsrResponseSchema = z.object({
  language: z.string().optional(),
  segments: z.array(geminiAsrSegmentSchema),
  warnings: z.array(z.string()).optional(),
});

class BilibiliAsrError extends Error {
  constructor(
    message: string,
    readonly status: Exclude<AsrFallbackStatus, 'success'>
  ) {
    super(message);
    this.name = 'BilibiliAsrError';
  }
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasUsableGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && !key.includes('your_gemini_api_key_here'));
}

function getAsrConfig():
  | {
      enabled: true;
      provider: 'gemini';
      model: string;
      maxAudioBytes: number;
      timeoutMs: number;
      maxOutputTokens: number;
    }
  | {
      enabled: false;
      provider: 'gemini';
      status: 'disabled' | 'not_configured';
      reason: string;
    } {
  const provider = (process.env.BILIBILI_ASR_PROVIDER ?? 'gemini')
    .trim()
    .toLowerCase();
  const enabledOverride = parseBooleanEnv(
    process.env.BILIBILI_ENABLE_ASR_FALLBACK
  );

  if (enabledOverride === false) {
    return {
      enabled: false,
      provider: 'gemini',
      status: 'disabled',
      reason: 'Bilibili ASR fallback is disabled by BILIBILI_ENABLE_ASR_FALLBACK=false.',
    };
  }

  if (provider !== 'gemini') {
    return {
      enabled: false,
      provider: 'gemini',
      status: 'not_configured',
      reason: `Bilibili ASR provider "${provider}" is not supported yet. Use BILIBILI_ASR_PROVIDER=gemini.`,
    };
  }

  if (!hasUsableGeminiKey()) {
    return {
      enabled: false,
      provider: 'gemini',
      status: 'not_configured',
      reason:
        'Bilibili ASR fallback is not configured. Set GEMINI_API_KEY to transcribe Bilibili videos without native subtitles.',
    };
  }

  return {
    enabled: true,
    provider: 'gemini',
    model:
      process.env.BILIBILI_ASR_MODEL?.trim() ||
      process.env.GEMINI_ASR_MODEL?.trim() ||
      DEFAULT_GEMINI_ASR_MODEL,
    maxAudioBytes: parsePositiveInteger(
      process.env.BILIBILI_ASR_MAX_AUDIO_BYTES,
      DEFAULT_MAX_AUDIO_BYTES
    ),
    timeoutMs: parsePositiveInteger(
      process.env.BILIBILI_ASR_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    maxOutputTokens: parsePositiveInteger(
      process.env.BILIBILI_ASR_MAX_OUTPUT_TOKENS,
      DEFAULT_MAX_OUTPUT_TOKENS
    ),
  };
}

function requestHeaders(referer: string, accept = 'application/json, text/plain, */*'): HeadersInit {
  const headers: HeadersInit = {
    Accept: accept,
    Referer: referer,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  };

  if (process.env.BILIBILI_COOKIE) {
    headers.Cookie = process.env.BILIBILI_COOKIE;
  }

  return headers;
}

function getAudioUrl(track: BilibiliDashAudio): string | undefined {
  return track.baseUrl ?? track.base_url;
}

export function selectBilibiliAudioTrack(
  tracks: BilibiliDashAudio[]
): BilibiliDashAudio | null {
  const usable = tracks.filter((track) => Boolean(getAudioUrl(track)));
  if (usable.length === 0) return null;

  return [...usable].sort((left, right) => {
    const leftBandwidth = left.bandwidth ?? Number.POSITIVE_INFINITY;
    const rightBandwidth = right.bandwidth ?? Number.POSITIVE_INFINITY;
    return leftBandwidth - rightBandwidth;
  })[0];
}

async function fetchPlayurl(input: BilibiliAsrInput): Promise<BilibiliPlayurlPayload> {
  const query = new URLSearchParams({
    bvid: input.bvid,
    cid: String(input.cid),
    fnval: '16',
    fourk: '1',
  });
  if (input.aid) {
    query.set('aid', String(input.aid));
  }

  const response = await fetch(
    `https://api.bilibili.com/x/player/playurl?${query.toString()}`,
    {
      headers: requestHeaders(input.canonicalUrl),
    }
  );

  if (!response.ok) {
    throw new BilibiliAsrError(
      `Bilibili playurl request failed (${response.status}).`,
      'failed'
    );
  }

  const payload = (await response.json()) as BilibiliPlayurlPayload;
  if (payload.code !== 0) {
    throw new BilibiliAsrError(
      payload.message || 'Bilibili playurl request did not return audio data.',
      'failed'
    );
  }

  return payload;
}

async function downloadAudio(
  url: string,
  referer: string,
  maxBytes: number
): Promise<Buffer> {
  const response = await fetch(url, {
    headers: requestHeaders(referer, '*/*'),
  });

  if (!response.ok) {
    throw new BilibiliAsrError(
      `Bilibili audio request failed (${response.status}).`,
      'failed'
    );
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new BilibiliAsrError(
      `Bilibili audio is too large for inline ASR (${contentLength} bytes > ${maxBytes} bytes).`,
      'audio_too_large'
    );
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new BilibiliAsrError(
        `Bilibili audio is too large for inline ASR (${arrayBuffer.byteLength} bytes > ${maxBytes} bytes).`,
        'audio_too_large'
      );
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new BilibiliAsrError(
        `Bilibili audio is too large for inline ASR (${receivedBytes} bytes > ${maxBytes} bytes).`,
        'audio_too_large'
      );
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function buildGeminiPrompt(input: AudioTranscriberInput): string {
  const durationText =
    input.expectedDuration && input.expectedDuration > 0
      ? `${Math.round(input.expectedDuration)} seconds`
      : 'unknown';
  const languageHint = input.preferredLanguage
    ? `Preferred transcript language: ${input.preferredLanguage}.`
    : 'Keep the transcript in the original spoken language.';

  return `You are transcribing a Bilibili video for a concept-map analysis tool.

Return strict JSON only. Do not use Markdown.

Task:
- Transcribe the provided audio into timestamped transcript segments.
- Use seconds from the start of the video for timestamps.
- Segment at sentence or short-thought boundaries, usually 4 to 12 seconds per segment.
- Preserve meaning and important terms exactly enough for evidence lookup.
- If timestamps are approximate, still keep them monotonic and useful for seeking.

Video title: ${input.title || 'unknown'}
Expected duration: ${durationText}
${languageHint}

JSON shape:
{
  "language": "zh-CN",
  "segments": [
    { "start": 0, "duration": 5.2, "text": "..." }
  ],
  "warnings": []
}`;
}

function buildGeminiGenerationConfig(maxOutputTokens: number): GenerationConfig {
  return {
    temperature: 0,
    maxOutputTokens,
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        language: { type: SchemaType.STRING },
        segments: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              start: { type: SchemaType.NUMBER },
              duration: { type: SchemaType.NUMBER },
              text: { type: SchemaType.STRING },
            },
            required: ['start', 'duration', 'text'],
          },
        },
        warnings: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ['segments'],
    },
  };
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeAsrSegments(
  segments: z.infer<typeof geminiAsrSegmentSchema>[],
  expectedDuration?: number | null
): RawTranscriptSegment[] {
  const sorted = segments
    .map((segment) => ({
      text: segment.text.trim(),
      start: segment.start,
      duration: segment.duration,
      end: segment.end,
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start))
    .map((segment) => ({
      ...segment,
      start: Math.max(0, segment.start),
    }))
    .sort((left, right) => left.start - right.start);

  return sorted.map((segment, index) => {
    const nextStart = sorted[index + 1]?.start;
    let duration =
      typeof segment.duration === 'number' && Number.isFinite(segment.duration)
        ? segment.duration
        : typeof segment.end === 'number' && Number.isFinite(segment.end)
          ? segment.end - segment.start
          : typeof nextStart === 'number'
            ? nextStart - segment.start
            : 3;

    if (!Number.isFinite(duration) || duration <= 0) {
      duration = 3;
    }

    if (
      expectedDuration &&
      expectedDuration > 0 &&
      segment.start < expectedDuration &&
      segment.start + duration > expectedDuration + 5
    ) {
      duration = Math.max(0.1, expectedDuration - segment.start);
    }

    return {
      text: segment.text,
      start: segment.start,
      duration,
    };
  });
}

async function transcribeAudioWithGemini(
  input: AudioTranscriberInput,
  config: Extract<ReturnType<typeof getAsrConfig>, { enabled: true }>
): Promise<AudioTranscriptionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BilibiliAsrError('GEMINI_API_KEY is missing.', 'not_configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.model,
    generationConfig: buildGeminiGenerationConfig(config.maxOutputTokens),
  });
  const prompt = buildGeminiPrompt(input);
  const startedAt = Date.now();
  const result = await model.generateContent(
    [
      { text: prompt },
      {
        inlineData: {
          mimeType: input.mimeType,
          data: Buffer.from(input.audioBytes).toString('base64'),
        },
      },
    ],
    { timeout: config.timeoutMs }
  );

  const response = result.response;
  const text = response.text();
  const parsed = geminiAsrResponseSchema.parse(
    JSON.parse(extractJsonPayload(text))
  );

  return {
    language: parsed.language?.trim() || input.preferredLanguage,
    segments: normalizeAsrSegments(parsed.segments, input.expectedDuration),
    warnings: parsed.warnings,
    raw: {
      model: config.model,
      usage: response.usageMetadata,
      latencyMs: Date.now() - startedAt,
    },
  };
}

export function setBilibiliAudioTranscriberForTest(
  transcriber: AudioTranscriber | null
) {
  transcriberForTest = transcriber;
}

export async function fetchBilibiliAsrTranscript(
  input: BilibiliAsrInput
): Promise<BilibiliAsrTranscriptResult> {
  const config = getAsrConfig();

  if (!config.enabled) {
    return {
      segments: [],
      warnings: [config.reason],
      raw: {
        asr: {
          status: config.status,
          provider: 'gemini',
          error: config.reason,
        },
      },
    };
  }

  try {
    const playurl = await fetchPlayurl(input);
    const selectedTrack = selectBilibiliAudioTrack(
      playurl.data?.dash?.audio ?? []
    );
    if (!selectedTrack) {
      return {
        segments: [],
        warnings: ['No Bilibili DASH audio track is available for ASR fallback.'],
        raw: {
          asr: {
            status: 'no_audio',
            provider: 'gemini',
            model: config.model,
            error: 'No Bilibili DASH audio track is available.',
          },
        },
      };
    }

    const audioUrl = getAudioUrl(selectedTrack);
    if (!audioUrl) {
      throw new BilibiliAsrError(
        'Selected Bilibili audio track did not include a playable URL.',
        'no_audio'
      );
    }

    const mimeType =
      selectedTrack.mimeType || process.env.BILIBILI_ASR_AUDIO_MIME_TYPE || 'audio/mp4';
    const audioBytes = await downloadAudio(
      audioUrl,
      input.canonicalUrl,
      config.maxAudioBytes
    );
    const transcriber = transcriberForTest
      ? transcriberForTest
      : (transcriberInput: AudioTranscriberInput) =>
          transcribeAudioWithGemini(transcriberInput, config);
    const transcript = await transcriber({
      audioBytes,
      mimeType,
      title: input.title,
      preferredLanguage: input.preferredLanguage,
      expectedDuration: input.expectedDuration,
    });

    return {
      segments: transcript.segments,
      language: transcript.language,
      warnings: transcript.warnings ?? [],
      raw: {
        asr: {
          status: 'success',
          provider: 'gemini',
          model:
            typeof transcript.raw === 'object' && transcript.raw
              ? String((transcript.raw as Record<string, unknown>).model ?? config.model)
              : config.model,
          audio: {
            id: selectedTrack.id,
            bandwidth: selectedTrack.bandwidth,
            codecs: selectedTrack.codecs,
            mimeType,
            bytes: audioBytes.byteLength,
          },
          usage:
            typeof transcript.raw === 'object' && transcript.raw
              ? (transcript.raw as Record<string, unknown>).usage
              : undefined,
        },
      },
    };
  } catch (error) {
    const status =
      error instanceof BilibiliAsrError ? error.status : ('failed' as const);
    const message = error instanceof Error ? error.message : String(error);

    return {
      segments: [],
      warnings: [`Bilibili ASR fallback failed: ${message}`],
      raw: {
        asr: {
          status,
          provider: 'gemini',
          model: config.model,
          error: message,
        },
      },
    };
  }
}
