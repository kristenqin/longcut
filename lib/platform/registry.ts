import { BilibiliAdapter } from './bilibili-adapter';
import { YouTubeAdapter } from './youtube-adapter';
import type { PlatformKey, VideoPlatformAdapter } from './types';

const adapters: VideoPlatformAdapter[] = [YouTubeAdapter, BilibiliAdapter];

export function getPlatformAdapters(): VideoPlatformAdapter[] {
  return [...adapters];
}

export function getPlatformAdapter(platform: PlatformKey): VideoPlatformAdapter | undefined {
  return adapters.find((adapter) => adapter.platform === platform);
}

export function resolvePlatformAdapter(url: string): VideoPlatformAdapter | undefined {
  return adapters.find((adapter) => adapter.canHandle(url));
}
