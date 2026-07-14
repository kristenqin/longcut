import { NextRequest, NextResponse } from 'next/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { createClient } from '@/lib/supabase/server';
import { resolvePlatformAdapter, type VideoRef } from '@/lib/platform';
import { invalidJsonBodyResponse, isInvalidJsonBodyError, readJsonObject } from '@/lib/api-json';
import { buildVideoCacheKey } from '@/lib/video-cache-key';

function getCachedConceptMap(summary: unknown) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }

  const record = summary as Record<string, unknown>;
  const analysis = record.analysis ?? record.conceptMap;

  if (!analysis || typeof analysis !== 'object') {
    return null;
  }

  return analysis;
}

async function handler(req: NextRequest) {
  try {
    const { url } = await readJsonObject(req);

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const adapter = resolvePlatformAdapter(url);
    if (!adapter) {
      return NextResponse.json(
        { error: 'Enter a YouTube or bilibili video URL with captions.' },
        { status: 400 }
      );
    }

    const parsedRef = await adapter.parseUrl(url);
    let videoRef: VideoRef = parsedRef;

    if (adapter.platform === 'bilibili') {
      const metadata = await adapter.fetchMetadata(parsedRef);
      videoRef = {
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
    }

    const key = buildVideoCacheKey(videoRef);
    const supabase = await createClient();

    const { data: cachedVideo } = await supabase
      .from('video_analyses')
      .select('*')
      .eq('youtube_id', key)
      .maybeSingle();

    const analysis = getCachedConceptMap(cachedVideo?.summary);

    if (!cachedVideo || !analysis) {
      return NextResponse.json({
        cached: false,
        videoRef,
        cacheKey: key,
      });
    }

    return NextResponse.json({
      cached: true,
      cacheKey: key,
      videoRef,
      videoDbId: cachedVideo.id,
      transcript: cachedVideo.transcript,
      videoInfo: {
        videoId: videoRef.platformVideoId,
        platform: videoRef.platform,
        title: cachedVideo.title,
        author: cachedVideo.author ?? 'Unknown',
        duration: cachedVideo.duration,
        thumbnail: cachedVideo.thumbnail_url ?? '',
        language: cachedVideo.language ?? undefined,
        availableLanguages: cachedVideo.available_languages ?? undefined,
        videoRef,
      },
      analysis,
      cacheDate: cachedVideo.updated_at ?? cachedVideo.created_at,
    });
  } catch (error) {
    if (isInvalidJsonBodyError(error)) {
      return invalidJsonBodyResponse();
    }

    console.error('Error checking video cache:', error);
    return NextResponse.json(
      { error: 'Failed to check video cache' },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
