---
id: agents-spec-bilibili-asr-fallback
type: design
module: concept-map-mvp
tags: [agent-spec, bilibili, transcript, asr]
---

# Bilibili ASR Fallback Spec

## Purpose

Make the Bilibili MVP usable for videos that expose metadata and audio but do not expose a public subtitle track. The fallback must still produce a normal timestamped transcript before Concept Map analysis runs.

## Non-Goals

- Do not generate Concept Map directly from video/audio without a transcript.
- Do not add dynamic plugin loading.
- Do not implement Bilibili login UI, WBI signing, PGC/Bangumi, or multi-page batch analysis in this step.
- Do not change the Concept Map analyzer contract.

## Interfaces

- `BilibiliAdapter.fetchTranscript(ref, options)` first tries native Bilibili subtitles.
- If no native subtitle is available and ASR is configured, it fetches a DASH audio URL from `x/player/playurl`, downloads the audio, and transcribes it.
- ASR output is normalized through `createTranscriptResult` with `source: "ai"`.
- If ASR is not configured, the API returns the existing no-transcript response with warnings that explain the missing ASR provider.

## Key Decisions

- The first ASR provider is Gemini audio input because the project already depends on `@google/generative-ai`.
- ASR is opt-in by configuration but auto-enabled when `GEMINI_API_KEY` exists unless explicitly disabled.
- Download size is capped to prevent accidental large inline uploads.
- The Bilibili adapter owns platform-specific audio URL discovery; the ASR module owns audio-to-transcript conversion.

## Edge Cases and Failure Modes

- Bilibili subtitle list empty or login-only.
- `playurl` returns no DASH audio.
- Audio CDN rejects HEAD but supports GET/range.
- Audio exceeds configured byte cap.
- Gemini key missing or Gemini returns invalid JSON.
- ASR transcript covers too little of the expected duration.

## Acceptance Criteria

- The test Bilibili URL can resolve metadata and discover an audio source.
- With mocked Gemini, no-subtitle Bilibili videos return AI transcript segments.
- Without Gemini configuration, the API returns a clear no-credits error instead of a generic failure.
- Existing YouTube and native Bilibili subtitle tests still pass.

## Test Plan

- Unit test Bilibili native subtitle behavior.
- Unit test no-subtitle + no ASR configuration warnings.
- Unit test no-subtitle + mocked ASR transcript output.
- Run TypeScript typecheck.
