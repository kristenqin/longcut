import type { VideoRef } from '@/lib/platform';

export function buildVideoCacheKey(videoRef: Pick<VideoRef, 'platform' | 'platformVideoId' | 'platformPartId'>) {
  const base = `${videoRef.platform}:${videoRef.platformVideoId}`;

  if (videoRef.platform === 'bilibili' && videoRef.platformPartId) {
    return `${base}:${videoRef.platformPartId}`;
  }

  return base;
}

export function buildTranscriptIdPrefix(videoRef: Pick<VideoRef, 'platform' | 'platformVideoId' | 'platformPartId'>) {
  if (videoRef.platform === 'bilibili' && videoRef.platformPartId) {
    return `${videoRef.platform}-${videoRef.platformVideoId}-${videoRef.platformPartId}`;
  }

  return `${videoRef.platform}-${videoRef.platformVideoId}`;
}
