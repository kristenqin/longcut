"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlaybackCommand } from "@/lib/types";
import type { VideoRef } from "@/lib/platform";

interface BilibiliPlayerProps {
  videoRef: VideoRef | null;
  fallbackVideoId: string;
  playbackCommand?: PlaybackCommand | null;
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

function buildBilibiliPlayerSrc(videoRef: VideoRef | null, fallbackVideoId: string, seekTime: number | null) {
  const bvid = videoRef?.platformVideoId || fallbackVideoId;
  const params = new URLSearchParams({
    bvid,
    p: String(readPageFromRef(videoRef)),
    autoplay: "0",
  });

  if (videoRef?.platformPartId) {
    params.set("cid", videoRef.platformPartId);
  }

  if (seekTime !== null && Number.isFinite(seekTime) && seekTime > 0) {
    params.set("t", String(Math.max(0, Math.floor(seekTime))));
  }

  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

export function BilibiliPlayer({
  videoRef,
  fallbackVideoId,
  playbackCommand,
  onCommandExecuted,
}: BilibiliPlayerProps) {
  const [seekTime, setSeekTime] = useState<number | null>(null);

  useEffect(() => {
    if (!playbackCommand) return;

    if (playbackCommand.type === "SEEK" && typeof playbackCommand.time === "number") {
      setSeekTime(playbackCommand.time);
      onCommandExecuted?.();
      return;
    }

    if (playbackCommand.type === "PLAY_TOPIC" && playbackCommand.topic?.segments?.[0]) {
      setSeekTime(playbackCommand.topic.segments[0].start);
      onCommandExecuted?.();
      return;
    }

    if (playbackCommand.type === "PLAY_SEGMENT" && playbackCommand.segment) {
      setSeekTime(playbackCommand.segment.start);
      onCommandExecuted?.();
      return;
    }

    onCommandExecuted?.();
  }, [onCommandExecuted, playbackCommand]);

  const src = useMemo(
    () => buildBilibiliPlayerSrc(videoRef, fallbackVideoId, seekTime),
    [fallbackVideoId, seekTime, videoRef]
  );

  return (
    <div className="overflow-hidden rounded-3xl bg-black">
      <iframe
        key={src}
        src={src}
        title="Bilibili video player"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full border-0"
      />
    </div>
  );
}
