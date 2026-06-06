import { NextRequest, NextResponse } from 'next/server';
import { extractVideoId } from '@/lib/utils';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { getMockVideoInfo, shouldUseMockVideoInfo } from '@/lib/mock-data';
import { fetchYouTubeVideoInfo } from '@/lib/video-info-provider';
import { resolvePlatformAdapter, type VideoMetadata } from '@/lib/platform';

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
    videoRef: {
      platform: metadata.platform,
      canonicalUrl: metadata.canonicalUrl,
      platformVideoId: metadata.platformVideoId,
      platformPartId: metadata.platformPartId ?? null,
      raw: metadata.raw,
    },
  };
}

async function handler(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'Video URL is required' },
        { status: 400 }
      );
    }

    const adapter = resolvePlatformAdapter(url);
    if (!adapter) {
      return NextResponse.json(
        { error: 'Invalid video URL' },
        { status: 400 }
      );
    }

    // Use mock data if enabled for local development.
    const youtubeId = extractVideoId(url);
    if (adapter.platform === 'youtube' && youtubeId && shouldUseMockVideoInfo()) {
      console.log(
        '[VIDEO-INFO] Using mock data (NEXT_PUBLIC_USE_MOCK_VIDEO_INFO=true)'
      );
      const mockData = getMockVideoInfo(youtubeId);
      return NextResponse.json({
        videoId: youtubeId,
        platform: 'youtube',
        title: mockData.title,
        author: mockData.channel.name,
        thumbnail: mockData.thumbnail,
        duration: mockData.duration,
        description: mockData.description,
        tags: mockData.tags
      });
    }

    if (adapter.platform === 'youtube' && youtubeId) {
      const info = await fetchYouTubeVideoInfo(youtubeId);
      return NextResponse.json({
        ...info,
        platform: 'youtube',
        videoRef: {
          platform: 'youtube',
          canonicalUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
          platformVideoId: youtubeId,
          platformPartId: null,
        },
      });
    }

    const ref = await adapter.parseUrl(url);
    const metadata = await adapter.fetchMetadata(ref);
    return NextResponse.json(serializeVideoInfo(metadata));
  } catch (error) {
    console.error('[VIDEO-INFO] Top-level error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    );
  }
}

export const POST = withSecurity(handler, SECURITY_PRESETS.PUBLIC);
