---
id: agents-decisions-bilibili-asr-fallback
type: decision
module: concept-map-mvp
tags: [agent-decision, bilibili, transcript, asr]
---

# Bilibili ASR Fallback Decisions

## D1: Transcript remains mandatory

Concept Map analysis still requires timestamped transcript segments. For videos without native subtitles, ASR is only a way to create that transcript first.

## D2: Platform audio discovery stays in the adapter

Bilibili-specific `bvid + cid -> playurl -> DASH audio` logic belongs to `BilibiliAdapter`; provider-specific transcription belongs to a separate ASR helper.

## D3: Gemini is the first audio ASR provider

The project already has `@google/generative-ai` and `GEMINI_API_KEY`, so the MVP can add audio transcription without adding a new runtime dependency.

## D4: ASR failure should be explainable

If subtitles and ASR are both unavailable, the API should preserve the no-credits behavior and return warnings that identify the missing configuration or blocked audio source.
