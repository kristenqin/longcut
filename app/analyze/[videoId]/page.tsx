"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Play, RefreshCw } from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
import { BilibiliPlayer } from "@/components/bilibili-player";
import { ConceptMapPanel } from "@/components/concept-map-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { YouTubePlayer, type YouTubePlayerHandle } from "@/components/youtube-player";
import { useAuth } from "@/contexts/auth-context";
import { csrfFetch } from "@/lib/csrf-client";
import { useElapsedTimer } from "@/lib/hooks/use-elapsed-timer";
import type { ConceptMapAnalysis } from "@/lib/concept-map";
import type { TranscriptSource, VideoRef } from "@/lib/platform";
import type { PlaybackCommand, TranscriptSegment, VideoInfo } from "@/lib/types";
import { extractSupportedVideoId, formatDuration } from "@/lib/utils";

type PageState = "idle" | "loading" | "ready" | "error";

type TranscriptMeta = {
  language?: string;
  availableLanguages?: string[];
  source?: TranscriptSource;
};

type CachedConceptMapResponse = {
  cached?: boolean;
  transcript?: TranscriptSegment[];
  videoInfo?: VideoInfo & {
    platform?: string;
    videoRef?: VideoRef;
  };
  videoRef?: VideoRef;
  analysis?: ConceptMapAnalysis;
  error?: string;
};

type TranscriptResponse = {
  transcript?: TranscriptSegment[];
  language?: string;
  availableLanguages?: string[];
  source?: TranscriptSource;
  videoRef?: VideoRef;
  videoInfo?: VideoInfo & {
    platform?: string;
    videoRef?: VideoRef;
  };
  error?: string;
  details?: string;
};

type VideoInfoResponse = VideoInfo & {
  platform?: string;
  videoRef?: VideoRef;
  error?: string;
};

function buildDefaultVideoUrl(routeVideoId: string | null): string {
  if (!routeVideoId) return "";

  if (/^(BV[a-zA-Z0-9]+|av\d+)$/i.test(routeVideoId)) {
    return `https://www.bilibili.com/video/${routeVideoId}`;
  }

  return `https://www.youtube.com/watch?v=${routeVideoId}`;
}

function normalizeErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error.trim() : "";
  const details = typeof record.details === "string" ? record.details.trim() : "";

  if (error && details) return `${error}: ${details}`;
  return details || error || fallback;
}

function normalizeTranscript(input: unknown): TranscriptSegment[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((segment) => {
    if (!segment || typeof segment !== "object") return [];
    const record = segment as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const start = Number(record.start);
    const duration = Number(record.duration);

    if (!text || !Number.isFinite(start)) return [];

    return [
      {
        text,
        start: Math.max(0, start),
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      },
    ];
  });
}

function mergeVideoInfo(
  routeVideoId: string,
  info: Partial<VideoInfoResponse> | null | undefined,
  fallback?: Partial<VideoInfoResponse> | null
): VideoInfo {
  const source = info && !info.error ? info : fallback;

  return {
    videoId: source?.videoId ?? source?.videoRef?.platformVideoId ?? routeVideoId,
    title: source?.title ?? "Untitled video",
    author: source?.author ?? "Unknown",
    thumbnail: source?.thumbnail ?? "",
    duration:
      typeof source?.duration === "number" && Number.isFinite(source.duration)
        ? source.duration
        : null,
    description: source?.description,
    tags: source?.tags,
    language: source?.language,
    availableLanguages: source?.availableLanguages,
  };
}

function transcriptEnd(segment: TranscriptSegment) {
  return segment.start + Math.max(0, segment.duration || 0);
}

function activeTranscriptWindow(transcript: TranscriptSegment[], currentTime: number) {
  if (transcript.length === 0) return [];

  const activeIndex = transcript.findIndex((segment) => {
    const end = transcriptEnd(segment);
    return currentTime >= segment.start && currentTime <= end;
  });

  const center = activeIndex >= 0 ? activeIndex : 0;
  return transcript.slice(Math.max(0, center - 4), center + 8);
}

export default function AnalyzePage() {
  const params = useParams<{ videoId: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const routeVideoId = Array.isArray(params?.videoId) ? params.videoId[0] : params?.videoId ?? null;
  const urlParam = searchParams?.get("url") ?? "";
  const forceRegenerate = searchParams?.get("regen") === "1" || searchParams?.get("regen") === "true";
  const inputUrl = useMemo(
    () => urlParam || buildDefaultVideoUrl(routeVideoId),
    [routeVideoId, urlParam]
  );

  const youtubePlayerRef = useRef<YouTubePlayerHandle | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pageState, setPageState] = useState<PageState>("idle");
  const [loadingMessage, setLoadingMessage] = useState("Preparing video");
  const [error, setError] = useState("");
  const [videoRef, setVideoRef] = useState<VideoRef | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [transcriptMeta, setTranscriptMeta] = useState<TranscriptMeta | null>(null);
  const [conceptMap, setConceptMap] = useState<ConceptMapAnalysis | null>(null);
  const [isGeneratingConceptMap, setIsGeneratingConceptMap] = useState(false);
  const [conceptMapError, setConceptMapError] = useState<string | null>(null);
  const [conceptMapGenerationStartTime, setConceptMapGenerationStartTime] = useState<number | null>(null);
  const [playbackCommand, setPlaybackCommand] = useState<PlaybackCommand | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [bilibiliSeekTime, setBilibiliSeekTime] = useState<number | null>(null);
  const conceptMapElapsedTime = useElapsedTimer(conceptMapGenerationStartTime);

  const extractedVideo = useMemo(
    () => (inputUrl ? extractSupportedVideoId(inputUrl) : null),
    [inputUrl]
  );
  const currentVideoId = videoRef?.platformVideoId ?? extractedVideo?.videoId ?? routeVideoId ?? "";
  const visibleTranscript = useMemo(
    () => activeTranscriptWindow(transcript, currentTime),
    [currentTime, transcript]
  );

  const clearPlaybackCommand = useCallback(() => {
    setPlaybackCommand(null);
  }, []);

  const requestSeek = useCallback((time: number) => {
    if (videoRef?.platform === "bilibili") {
      setBilibiliSeekTime(time);
    }

    if (youtubePlayerRef.current?.seekTo(time)) {
      return;
    }

    setPlaybackCommand({ type: "SEEK", time });
    setCurrentTime(time);
  }, [videoRef?.platform]);

  const loadVideoWorkspace = useCallback(async () => {
    if (!inputUrl || !routeVideoId) return;

    const extracted = extractSupportedVideoId(inputUrl);
    if (!extracted) {
      setPageState("error");
      setError("Enter a YouTube or bilibili video URL with captions.");
      return;
    }

    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;

    setPageState("loading");
    setLoadingMessage("Checking saved analysis");
    setError("");
    setVideoRef(null);
    setVideoInfo(null);
    setTranscript([]);
    setTranscriptMeta(null);
    setConceptMap(null);
    setConceptMapError(null);
    setCurrentTime(0);
    setBilibiliSeekTime(null);

    try {
      if (!forceRegenerate) {
        const cacheResponse = await fetch("/api/check-video-cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: inputUrl }),
          signal: controller.signal,
        });
        const cacheData: CachedConceptMapResponse = await cacheResponse.json().catch(() => ({}));

        if (cacheResponse.ok && cacheData.cached && cacheData.transcript && cacheData.videoInfo) {
          const cachedTranscript = normalizeTranscript(cacheData.transcript);
          setTranscript(cachedTranscript);
          setVideoInfo(mergeVideoInfo(routeVideoId, cacheData.videoInfo));
          setVideoRef(cacheData.videoInfo.videoRef ?? cacheData.videoRef ?? null);
          setTranscriptMeta({
            language: cacheData.videoInfo.language,
            availableLanguages: cacheData.videoInfo.availableLanguages,
            source: "unknown",
          });
          setConceptMap(cacheData.analysis ?? null);
          setPageState("ready");
          return;
        }
      }

      setLoadingMessage("Fetching transcript and video information");

      const [transcriptResponse, videoInfoResponse] = await Promise.all([
        fetch("/api/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: inputUrl }),
          signal: controller.signal,
        }),
        fetch("/api/video-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: inputUrl }),
          signal: controller.signal,
        }),
      ]);

      const transcriptPayload: TranscriptResponse = await transcriptResponse.json().catch(() => ({}));
      const videoInfoPayload: VideoInfoResponse = await videoInfoResponse.json().catch(() => ({} as VideoInfoResponse));

      if (!transcriptResponse.ok) {
        throw new Error(
          normalizeErrorMessage(
            transcriptPayload,
            "No transcript available. Use a YouTube or bilibili video with captions."
          )
        );
      }

      const nextTranscript = normalizeTranscript(transcriptPayload.transcript);
      if (nextTranscript.length === 0) {
        throw new Error("No transcript available. Use a YouTube or bilibili video with captions.");
      }

      const nextVideoInfo = mergeVideoInfo(
        routeVideoId,
        videoInfoResponse.ok ? videoInfoPayload : null,
        transcriptPayload.videoInfo
      );

      setTranscript(nextTranscript);
      setVideoInfo(nextVideoInfo);
      setVideoRef(videoInfoPayload.videoRef ?? transcriptPayload.videoRef ?? transcriptPayload.videoInfo?.videoRef ?? {
        platform: extracted.platform,
        platformVideoId: extracted.videoId,
        canonicalUrl: inputUrl,
        platformPartId: null,
      });
      setTranscriptMeta({
        language: transcriptPayload.language ?? nextVideoInfo.language,
        availableLanguages: transcriptPayload.availableLanguages ?? nextVideoInfo.availableLanguages,
        source: transcriptPayload.source ?? "unknown",
      });
      setPageState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("Failed to load video workspace:", error);
      setError(error instanceof Error ? error.message : "Failed to load video workspace");
      setPageState("error");
    }
  }, [forceRegenerate, inputUrl, routeVideoId]);

  const handleGenerateConceptMap = useCallback(async () => {
    if (!currentVideoId || !videoInfo || !videoRef || transcript.length === 0 || isGeneratingConceptMap) {
      return;
    }

    setConceptMapError(null);
    setConceptMapGenerationStartTime(Date.now());
    setIsGeneratingConceptMap(true);

    try {
      const response = await csrfFetch.post("/api/concept-map", {
        videoRef,
        videoInfo,
        transcript,
        transcriptMeta: transcriptMeta ?? undefined,
        maxConcepts: 8,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(normalizeErrorMessage(payload, "Failed to generate Concept Map"));
      }

      setConceptMap(payload.analysis ?? null);
    } catch (error) {
      console.error("Failed to generate Concept Map:", error);
      setConceptMapError(
        error instanceof Error
          ? error.message
          : "Failed to generate Concept Map. Please check your AI model settings."
      );
    } finally {
      setConceptMapGenerationStartTime(null);
      setIsGeneratingConceptMap(false);
    }
  }, [
    currentVideoId,
    isGeneratingConceptMap,
    transcript,
    transcriptMeta,
    videoInfo,
    videoRef,
  ]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      return;
    }

    void loadVideoWorkspace();

    return () => {
      activeRequestRef.current?.abort();
    };
  }, [authLoading, loadVideoWorkspace, user]);

  useEffect(() => {
    if (
      pageState === "ready" &&
      user &&
      transcript.length > 0 &&
      videoInfo &&
      videoRef &&
      !conceptMap &&
      !conceptMapError &&
      !isGeneratingConceptMap
    ) {
      void handleGenerateConceptMap();
    }
  }, [
    conceptMap,
    conceptMapError,
    handleGenerateConceptMap,
    isGeneratingConceptMap,
    pageState,
    transcript.length,
    user,
    videoInfo,
    videoRef,
  ]);

  if (authLoading || (user && (pageState === "idle" || pageState === "loading"))) {
    return (
      <section className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-5 text-center">
        <Loader2 className="mb-4 h-7 w-7 animate-spin text-slate-800" />
        <p className="text-sm font-medium text-slate-700">
          {authLoading ? "Checking session" : loadingMessage}
        </p>
      </section>
    );
  }

  if (!user) {
    return (
      <>
        <section className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-5 pt-12 text-center">
          <Card className="w-full max-w-md p-8">
            <h1 className="text-xl font-semibold text-slate-950">Sign in to analyze videos</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              LongCut uses your saved AI model settings to analyze YouTube and bilibili videos with captions.
            </p>
            <Button className="mt-5" onClick={() => setAuthModalOpen(true)}>
              Sign in
            </Button>
          </Card>
        </section>
        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          currentVideoId={currentVideoId}
        />
      </>
    );
  }

  if (pageState === "error") {
    return (
      <section className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-5 pt-12 text-center">
        <Card className="w-full max-w-2xl p-8">
          <AlertCircle className="mx-auto mb-4 h-7 w-7 text-red-500" />
          <h1 className="text-xl font-semibold text-slate-950">Could not analyze this video</h1>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{error}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={loadVideoWorkspace}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-5 pb-8 pt-12 sm:pt-14">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {videoRef?.platform ?? extractedVideo?.platform ?? "video"}
          </p>
          <h1 className="mt-1 max-w-4xl text-2xl font-semibold leading-tight text-slate-950">
            {videoInfo?.title ?? "Video analysis"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {videoInfo?.author ?? "Unknown creator"}
            {videoInfo?.duration ? ` · ${formatDuration(videoInfo.duration)}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={loadVideoWorkspace}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reload
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-4">
          {videoRef?.platform === "bilibili" ? (
            <BilibiliPlayer
              videoRef={videoRef}
              fallbackVideoId={currentVideoId}
              playbackCommand={playbackCommand}
              requestedSeekTime={bilibiliSeekTime}
              onCommandExecuted={clearPlaybackCommand}
            />
          ) : (
            <YouTubePlayer
              key={currentVideoId}
              ref={youtubePlayerRef}
              videoId={currentVideoId}
              selectedTopic={null}
              playbackCommand={playbackCommand}
              onCommandExecuted={clearPlaybackCommand}
              topics={[]}
              transcript={transcript}
              renderControls={false}
              compact={Boolean(conceptMap)}
              onTimeUpdate={setCurrentTime}
            />
          )}

          <ConceptMapPanel
            analysis={conceptMap}
            isLoading={isGeneratingConceptMap}
            elapsedTime={conceptMapElapsedTime}
            error={conceptMapError}
            onGenerate={handleGenerateConceptMap}
            onSeek={requestSeek}
          />
        </div>

        <aside className="lg:sticky lg:top-[6.5rem] lg:self-start">
          <Card className="max-h-[calc(100vh-8rem)] overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Transcript evidence</h2>
              <p className="mt-1 text-xs text-slate-500">
                {transcript.length} transcript segments
                {transcriptMeta?.language ? ` · ${transcriptMeta.language}` : ""}
              </p>
            </div>
            <div className="max-h-[calc(100vh-13rem)] space-y-1 overflow-y-auto p-3">
              {visibleTranscript.map((segment) => {
                const isActive =
                  currentTime >= segment.start && currentTime <= transcriptEnd(segment);

                return (
                  <button
                    key={`${segment.start}-${segment.text.slice(0, 24)}`}
                    type="button"
                    onClick={() => requestSeek(segment.start)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition ${
                      isActive ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                        isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <Play className="h-3 w-3" />
                      {formatDuration(segment.start)}
                    </span>
                    <span className={`text-sm leading-5 ${isActive ? "text-white" : "text-slate-600"}`}>
                      {segment.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
