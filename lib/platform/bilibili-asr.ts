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

type AsrProvider = 'mock';

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
      provider?: AsrProvider;
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

let transcriberForTest: AudioTranscriber | null = null;

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

function getAsrConfig():
  | {
      enabled: true;
      provider: AsrProvider;
      model: string;
      maxAudioBytes: number;
    }
  | {
      enabled: false;
      status: 'disabled' | 'not_configured';
      reason: string;
    } {
  const provider = (process.env.BILIBILI_ASR_PROVIDER ?? '')
    .trim()
    .toLowerCase();

  if (provider === 'mock') {
    if (parseBooleanEnv(process.env.BILIBILI_ENABLE_MOCK_ASR) !== true) {
      return {
        enabled: false,
        status: 'disabled',
        reason:
          'Mock Bilibili ASR is disabled. Set BILIBILI_ENABLE_MOCK_ASR=true for local end-to-end validation only.',
      };
    }

    return {
      enabled: true,
      provider: 'mock',
      model: 'mock-bilibili-asr',
      maxAudioBytes: parsePositiveInteger(
        process.env.BILIBILI_ASR_MAX_AUDIO_BYTES,
        DEFAULT_MAX_AUDIO_BYTES
      ),
    };
  }

  return {
    enabled: false,
    status: 'not_configured',
    reason:
      'No native Bilibili subtitle track is available. Configure BILIBILI_COOKIE for login-required subtitles, or use BILIBILI_ASR_PROVIDER=mock only for local smoke validation.',
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
      cache: 'no-store',
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
    cache: 'no-store',
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

function transcribeAudioWithMock(input: AudioTranscriberInput): AudioTranscriptionResult {
  const expectedDuration =
    input.expectedDuration && input.expectedDuration > 0
      ? input.expectedDuration
      : 360;
  const segmentCount = 8;
  const segmentDuration = Math.max(8, Math.floor(expectedDuration / segmentCount));
  const title = input.title || 'Bilibili video';
  const texts = [
    `Mock ASR transcript for local MVP validation. The video title is "${title}".`,
    'This mock segment stands in for the opening context and problem statement.',
    'This mock segment represents the first core concept that the Concept Map should identify.',
    'This mock segment represents a supporting mechanism or causal explanation.',
    'This mock segment represents an example that can be used as timestamped evidence.',
    'This mock segment represents a tradeoff or counterpoint in the argument.',
    'This mock segment represents how the concepts connect into a reusable map.',
    'This mock segment represents the conclusion and lets click-to-video seeking be verified.',
  ];

  return {
    language: input.preferredLanguage || 'zh-CN',
    segments: texts.map((text, index) => {
      const start = Math.min(index * segmentDuration, Math.max(0, expectedDuration - 1));
      const nextStart =
        index === texts.length - 1
          ? expectedDuration
          : Math.min((index + 1) * segmentDuration, expectedDuration);

      return {
        text,
        start,
        duration: Math.max(1, nextStart - start),
      };
    }),
    warnings: [
      'Mock Bilibili ASR transcript was used for local MVP validation. Do not treat this as video-grounded content.',
    ],
    raw: {
      model: 'mock-bilibili-asr',
      usage: {
        audioBytes: input.audioBytes.byteLength,
      },
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
        warnings: ['No Bilibili DASH audio track is available for local smoke validation.'],
        raw: {
          asr: {
            status: 'no_audio',
            provider: config.provider,
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
    const transcriber = transcriberForTest ?? transcribeAudioWithMock;
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
          provider: config.provider,
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
      warnings: [`Bilibili local smoke ASR failed: ${message}`],
      raw: {
        asr: {
          status,
          provider: config.provider,
          model: config.model,
          error: message,
        },
      },
    };
  }
}
