"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PlaybackCommand } from "@/lib/types";
import type { VideoRef } from "@/lib/platform";
import { Button } from "@/components/ui/button";

interface BilibiliPlayerProps {
  videoRef: VideoRef | null;
  fallbackVideoId: string;
  playbackCommand?: PlaybackCommand | null;
  requestedSeekTime?: number | null;
  onCommandExecuted?: () => void;
}

function readPageFromRef(videoRef: VideoRef | null): number {
  const rawPage = Number(videoRef?.raw?.page);
  if (Number.isFinite(rawPage) && rawPage > 0) {
    return rawPage;
  }

  try {
    const parsed = videoRef?.canonicalUrl ? new URL(videoRef.canonicalUrl) : null;
    const page = Number(parsed?.searchParams.get("p"));
    return Number.isFinite(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function buildBilibiliPlayerSrc(videoRef: VideoRef | null, fallbackVideoId: string) {
  const bvid = videoRef?.platformVideoId || fallbackVideoId;
  const params = new URLSearchParams({
    bvid,
    p: String(readPageFromRef(videoRef)),
    autoplay: "0",
  });

  if (videoRef?.platformPartId) {
    params.set("cid", videoRef.platformPartId);
  }

  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

function buildBilibiliTimestampUrl(videoRef: VideoRef | null, fallbackVideoId: string, seekTime: number) {
  const baseUrl =
    videoRef?.canonicalUrl || `https://www.bilibili.com/video/${videoRef?.platformVideoId || fallbackVideoId}`;

  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("t", String(Math.max(0, Math.floor(seekTime))));
    return parsed.toString();
  } catch {
    return `https://www.bilibili.com/video/${videoRef?.platformVideoId || fallbackVideoId}?t=${Math.max(
      0,
      Math.floor(seekTime)
    )}`;
  }
}

export function BilibiliPlayer({
  videoRef,
  fallbackVideoId,
  playbackCommand,
  requestedSeekTime,
  onCommandExecuted,
}: BilibiliPlayerProps) {
  const [commandSeekTime, setCommandSeekTime] = useState<number | null>(null);

  useEffect(() => {
    if (!playbackCommand) return;

    if (playbackCommand.type === "SEEK" && typeof playbackCommand.time === "number") {
      setCommandSeekTime(playbackCommand.time);
      onCommandExecuted?.();
      return;
    }

    if (playbackCommand.type === "PLAY_TOPIC" && playbackCommand.topic?.segments?.[0]) {
      setCommandSeekTime(playbackCommand.topic.segments[0].start);
      onCommandExecuted?.();
      return;
    }

    if (playbackCommand.type === "PLAY_SEGMENT" && playbackCommand.segment) {
      setCommandSeekTime(playbackCommand.segment.start);
      onCommandExecuted?.();
      return;
    }

    onCommandExecuted?.();
  }, [onCommandExecuted, playbackCommand]);

  const src = useMemo(
    () => buildBilibiliPlayerSrc(videoRef, fallbackVideoId),
    [fallbackVideoId, videoRef]
  );
  const activeSeekTime = requestedSeekTime ?? commandSeekTime;
  const requestedSeekUrl = useMemo(
    () =>
      activeSeekTime !== null && activeSeekTime !== undefined
        ? buildBilibiliTimestampUrl(videoRef, fallbackVideoId, activeSeekTime)
        : null,
    [activeSeekTime, fallbackVideoId, videoRef]
  );

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-black">
      <div className="bg-black">
        <iframe
          src={src}
          title="Bilibili video player"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full border-0"
        />
      </div>
      {activeSeekTime !== null && activeSeekTime !== undefined && requestedSeekUrl && (
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Transcript moved to {formatTime(activeSeekTime)}. Inline bilibili seeking is not reliable in this embedded player.
          </span>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={requestedSeekUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on bilibili at {formatTime(activeSeekTime)}
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
