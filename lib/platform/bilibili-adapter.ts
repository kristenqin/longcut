import { createTranscriptResult } from './transcript-normalizer';
import type {
  PlayerEmbedConfig,
  TranscriptOptions,
  TranscriptResult,
  TranscriptSource,
  VideoMetadata,
  VideoPlatformAdapter,
  VideoRef,
} from './types';

interface BilibiliPageInfo {
  cid: number;
  page: number;
  part?: string;
  duration?: number;
  first_frame?: string;
}

interface BilibiliViewData {
  aid?: number;
  bvid?: string;
  cid?: number;
  title?: string;
  desc?: string;
  pic?: string;
  duration?: number;
  owner?: {
    name?: string;
  };
  pages?: BilibiliPageInfo[];
}

interface BilibiliSubtitleItem {
  id?: number;
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
  subtitle_url_v2?: string;
  type?: number;
  ai_type?: number;
  ai_status?: number;
}

interface BilibiliSubtitleJson {
  body?: Array<{
    from: number;
    to: number;
    content: string;
  }>;
}

interface BilibiliContext {
  aid?: number;
  bvid: string;
  cid: number;
  page: number;
  canonicalUrl: string;
  metadata?: VideoMetadata;
}

const BVID_PATTERN = /^BV[a-zA-Z0-9]+$/;
const AV_PATTERN = /^av(\d+)$/i;

function requestHeaders(referer?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/json, text/plain, */*',
    Referer: referer ?? 'https://www.bilibili.com/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  };

  if (process.env.BILIBILI_COOKIE) {
    headers.Cookie = process.env.BILIBILI_COOKIE;
  }

  return headers;
}

async function fetchBilibiliJson<T>(url: string, referer?: string): Promise<T> {
  const response = await fetch(url, {
    headers: requestHeaders(referer),
  });

  if (!response.ok) {
    throw new Error(`Bilibili request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function parseBilibiliUrl(url: string): {
  bvid?: string;
  aid?: number;
  page: number;
} | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)bilibili\.com$/i.test(parsed.hostname)) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === 'video');
  const idSegment = videoIndex >= 0 ? segments[videoIndex + 1] : undefined;
  if (!idSegment) {
    return null;
  }

  const page = Math.max(1, Number(parsed.searchParams.get('p') ?? '1') || 1);

  if (BVID_PATTERN.test(idSegment)) {
    return { bvid: idSegment, page };
  }

  const avMatch = idSegment.match(AV_PATTERN);
  if (avMatch) {
    return { aid: Number(avMatch[1]), page };
  }

  return null;
}

function buildCanonicalUrl(bvid: string, page: number): string {
  const pageParam = page > 1 ? `?p=${page}` : '';
  return `https://www.bilibili.com/video/${bvid}${pageParam}`;
}

function normalizeSubtitleUrl(url: string): string {
  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (url.startsWith('/')) {
    return `https://www.bilibili.com${url}`;
  }

  return url;
}

function inferSubtitleSource(item: BilibiliSubtitleItem): TranscriptSource {
  return item.ai_type !== undefined || item.ai_status !== undefined || item.type === 1
    ? 'ai'
    : 'manual';
}

function selectSubtitle(
  subtitles: BilibiliSubtitleItem[],
  preferredLanguage?: string
): BilibiliSubtitleItem | undefined {
  const usable = subtitles.filter(
    (subtitle) => subtitle.subtitle_url || subtitle.subtitle_url_v2
  );

  if (usable.length === 0) {
    return undefined;
  }

  if (preferredLanguage) {
    const preferred = usable.find((subtitle) => subtitle.lan === preferredLanguage);
    if (preferred) {
      return preferred;
    }
  }

  return (
    usable.find((subtitle) => inferSubtitleSource(subtitle) === 'manual') ??
    usable.find((subtitle) => subtitle.lan?.startsWith('zh')) ??
    usable[0]
  );
}

function getRawPage(ref: VideoRef): number {
  const page = Number(ref.raw?.page);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function fetchViewData(ref: VideoRef): Promise<BilibiliViewData> {
  const query = new URLSearchParams();
  const bvid = typeof ref.raw?.bvid === 'string' ? ref.raw.bvid : undefined;
  const aid = typeof ref.raw?.aid === 'number' ? ref.raw.aid : undefined;

  if (bvid) {
    query.set('bvid', bvid);
  } else if (aid) {
    query.set('aid', String(aid));
  } else {
    query.set('bvid', ref.platformVideoId);
  }

  const payload = await fetchBilibiliJson<{
    code: number;
    message?: string;
    data?: BilibiliViewData;
  }>(`https://api.bilibili.com/x/web-interface/view?${query.toString()}`, ref.canonicalUrl);

  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || 'Failed to fetch Bilibili metadata.');
  }

  return payload.data;
}

async function resolveContext(ref: VideoRef): Promise<BilibiliContext> {
  if (ref.platform !== 'bilibili') {
    throw new Error(`BilibiliAdapter cannot handle platform "${ref.platform}".`);
  }

  const existingCid = Number(ref.platformPartId ?? ref.raw?.cid);
  const existingBvid =
    typeof ref.raw?.bvid === 'string' ? ref.raw.bvid : ref.platformVideoId;

  if (BVID_PATTERN.test(existingBvid) && Number.isFinite(existingCid) && existingCid > 0) {
    const page = getRawPage(ref);
    return {
      aid: typeof ref.raw?.aid === 'number' ? ref.raw.aid : undefined,
      bvid: existingBvid,
      cid: existingCid,
      page,
      canonicalUrl: buildCanonicalUrl(existingBvid, page),
    };
  }

  const metadata = await BilibiliAdapter.fetchMetadata(ref);
  const raw = metadata.raw as Record<string, unknown> | undefined;
  const cid = Number(raw?.cid ?? metadata.platformPartId);

  if (!Number.isFinite(cid) || cid <= 0) {
    throw new Error('Bilibili metadata did not include a valid cid.');
  }

  return {
    aid: typeof raw?.aid === 'number' ? raw.aid : undefined,
    bvid: metadata.platformVideoId,
    cid,
    page: Number(raw?.page) || 1,
    canonicalUrl: metadata.canonicalUrl,
    metadata,
  };
}

export const BilibiliAdapter: VideoPlatformAdapter = {
  platform: 'bilibili',

  canHandle(url: string): boolean {
    return parseBilibiliUrl(url) !== null;
  },

  async parseUrl(url: string): Promise<VideoRef> {
    const parsed = parseBilibiliUrl(url);
    if (!parsed) {
      throw new Error('Invalid Bilibili URL.');
    }

    const platformVideoId = parsed.bvid ?? `av${parsed.aid}`;
    const canonicalUrl = parsed.bvid
      ? buildCanonicalUrl(parsed.bvid, parsed.page)
      : `https://www.bilibili.com/video/av${parsed.aid}${parsed.page > 1 ? `?p=${parsed.page}` : ''}`;

    return {
      platform: 'bilibili',
      canonicalUrl,
      platformVideoId,
      platformPartId: null,
      raw: {
        url,
        bvid: parsed.bvid,
        aid: parsed.aid,
        page: parsed.page,
      },
    };
  },

  async fetchMetadata(ref: VideoRef): Promise<VideoMetadata> {
    const data = await fetchViewData(ref);
    const page = getRawPage(ref);
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const selectedPage =
      pages.find((candidate) => candidate.page === page) ??
      pages[page - 1] ??
      pages[0];
    const cid = selectedPage?.cid ?? data.cid;
    const bvid = data.bvid ?? ref.platformVideoId;

    if (!bvid || !cid) {
      throw new Error('Bilibili metadata did not include bvid or cid.');
    }

    const canonicalUrl = buildCanonicalUrl(bvid, selectedPage?.page ?? page);

    return {
      platform: 'bilibili',
      platformVideoId: bvid,
      platformPartId: String(cid),
      canonicalUrl,
      title: data.title ?? selectedPage?.part ?? `Bilibili Video ${bvid}`,
      author: data.owner?.name,
      thumbnail: data.pic ?? selectedPage?.first_frame,
      duration: selectedPage?.duration ?? data.duration ?? null,
      description: data.desc,
      raw: {
        aid: data.aid,
        bvid,
        cid,
        page: selectedPage?.page ?? page,
        pages,
      },
    };
  },

  async fetchTranscript(
    ref: VideoRef,
    options: TranscriptOptions = {}
  ): Promise<TranscriptResult> {
    const context = await resolveContext(ref);
    const query = new URLSearchParams({
      cid: String(context.cid),
      bvid: context.bvid,
    });
    if (context.aid) {
      query.set('aid', String(context.aid));
    }

    const playerInfo = await fetchBilibiliJson<{
      code: number;
      message?: string;
      data?: {
        need_login_subtitle?: boolean;
        subtitle?: {
          subtitles?: BilibiliSubtitleItem[];
        };
      };
    }>(
      `https://api.bilibili.com/x/player/v2?${query.toString()}`,
      context.canonicalUrl
    );

    if (playerInfo.code !== 0) {
      throw new Error(playerInfo.message || 'Failed to fetch Bilibili player info.');
    }

    const subtitleInfo = playerInfo.data?.subtitle;
    const subtitles = subtitleInfo?.subtitles ?? [];
    const selectedSubtitle = selectSubtitle(subtitles, options.preferredLanguage);

    if (!selectedSubtitle) {
      const warnings = [
        playerInfo.data?.need_login_subtitle
          ? 'Bilibili subtitles require login for this video.'
          : 'No Bilibili subtitle track is available for this video.',
      ];

      return createTranscriptResult([], {
        idPrefix: `bilibili-${context.bvid}-${context.cid}`,
        expectedDuration: context.metadata?.duration,
        source: 'unknown',
        warnings,
        raw: {
          aid: context.aid,
          bvid: context.bvid,
          cid: context.cid,
          page: context.page,
          subtitles,
        },
      });
    }

    const subtitleUrl = normalizeSubtitleUrl(
      selectedSubtitle.subtitle_url_v2 ?? selectedSubtitle.subtitle_url ?? ''
    );
    const subtitleJson = await fetchBilibiliJson<BilibiliSubtitleJson>(
      subtitleUrl,
      context.canonicalUrl
    );
    const segments = (subtitleJson.body ?? []).map((item) => ({
      text: item.content,
      start: item.from,
      duration: Math.max(0, item.to - item.from),
    }));
    const availableLanguages = subtitles
      .map((subtitle) => subtitle.lan)
      .filter((language): language is string => Boolean(language));

    return createTranscriptResult(segments, {
      idPrefix: `bilibili-${context.bvid}-${context.cid}-${selectedSubtitle.id ?? selectedSubtitle.lan ?? 'subtitle'}`,
      language: selectedSubtitle.lan,
      availableLanguages,
      expectedDuration: context.metadata?.duration,
      source: inferSubtitleSource(selectedSubtitle),
      raw: {
        aid: context.aid,
        bvid: context.bvid,
        cid: context.cid,
        page: context.page,
        selectedSubtitle,
      },
    });
  },

  getEmbedConfig(ref: VideoRef): PlayerEmbedConfig {
    const bvid = typeof ref.raw?.bvid === 'string' ? ref.raw.bvid : ref.platformVideoId;
    const cid = ref.platformPartId ?? ref.raw?.cid;
    const page = getRawPage(ref);
    const params = new URLSearchParams({
      bvid,
      p: String(page),
      autoplay: '0',
    });

    if (cid) {
      params.set('cid', String(cid));
    }

    return {
      kind: 'iframe',
      src: `https://player.bilibili.com/player.html?${params.toString()}`,
      canProgrammaticSeek: false,
    };
  },
};
