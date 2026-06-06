import { fetchYouTubeVideoInfo } from '@/lib/video-info-provider';
import { fetchYouTubeTranscript } from '@/lib/youtube-transcript-provider';
import { extractVideoId } from '@/lib/utils';
import { createTranscriptResult } from './transcript-normalizer';
import type {
  PlayerEmbedConfig,
  TranscriptOptions,
  TranscriptResult,
  VideoMetadata,
  VideoPlatformAdapter,
  VideoRef,
} from './types';

function youtubeCanonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const YouTubeAdapter: VideoPlatformAdapter = {
  platform: 'youtube',

  canHandle(url: string): boolean {
    return extractVideoId(url) !== null;
  },

  async parseUrl(url: string): Promise<VideoRef> {
    const videoId = extractVideoId(url);

    if (!videoId) {
      throw new Error('Invalid YouTube URL.');
    }

    return {
      platform: 'youtube',
      canonicalUrl: youtubeCanonicalUrl(videoId),
      platformVideoId: videoId,
      platformPartId: null,
      raw: { url },
    };
  },

  async fetchMetadata(ref: VideoRef): Promise<VideoMetadata> {
    if (ref.platform !== 'youtube') {
      throw new Error(`YouTubeAdapter cannot fetch metadata for platform "${ref.platform}".`);
    }

    const info = await fetchYouTubeVideoInfo(ref.platformVideoId);

    return {
      platform: 'youtube',
      platformVideoId: info.videoId,
      platformPartId: null,
      canonicalUrl: ref.canonicalUrl,
      title: info.title,
      author: info.author,
      thumbnail: info.thumbnail,
      duration: info.duration,
      description: info.description,
      tags: info.tags,
      raw: info,
    };
  },

  async fetchTranscript(
    ref: VideoRef,
    options: TranscriptOptions = {}
  ): Promise<TranscriptResult> {
    if (ref.platform !== 'youtube') {
      throw new Error(`YouTubeAdapter cannot fetch transcript for platform "${ref.platform}".`);
    }

    const result = await fetchYouTubeTranscript(
      ref.platformVideoId,
      options.preferredLanguage,
      options.expectedDuration ?? undefined
    );

    if (!result) {
      return createTranscriptResult([], {
        idPrefix: `youtube-${ref.platformVideoId}`,
        expectedDuration: options.expectedDuration,
        source: 'unknown',
        warnings: ['No transcript available for this YouTube video.'],
      });
    }

    return createTranscriptResult(result.segments, {
      idPrefix: `youtube-${ref.platformVideoId}`,
      language: result.language,
      availableLanguages: result.availableLanguages,
      expectedDuration: options.expectedDuration,
      source: 'unknown',
      raw: result,
    });
  },

  getEmbedConfig(ref: VideoRef): PlayerEmbedConfig {
    return {
      kind: 'api',
      src: `https://www.youtube.com/embed/${ref.platformVideoId}`,
      canProgrammaticSeek: true,
    };
  },
};
