export type {
  NormalizedTranscriptSegment,
  PlatformKey,
  PlayerEmbedConfig,
  TranscriptOptions,
  TranscriptQuality,
  TranscriptResult,
  TranscriptSource,
  VideoMetadata,
  VideoPlatformAdapter,
  VideoRef,
} from './types';
export { videoInfoToMetadata } from './types';
export {
  assessTranscriptQuality,
  createTranscriptResult,
  normalizeTranscriptSegments,
} from './transcript-normalizer';
export { BilibiliAdapter } from './bilibili-adapter';
export { YouTubeAdapter } from './youtube-adapter';
export {
  getPlatformAdapter,
  getPlatformAdapters,
  resolvePlatformAdapter,
} from './registry';
