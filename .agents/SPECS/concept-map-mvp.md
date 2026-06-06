---
id: agents-spec-concept-map-mvp
type: design
module: concept-map-mvp
tags: [agent-spec, mvp]
---

# Concept Map MVP Spec

## Problem

The current main analysis pipeline is clip-first. It chunks or scans transcript content to produce highlight reels and quote-like topics.

The new MVP should be concept-first:

```txt
Transcript -> first-principles concepts -> concept relations -> evidence spans -> playable navigation
```

## Required Behavior

1. The system accepts a video URL.
2. A platform adapter resolves metadata and transcript.
3. The transcript is normalized into `TranscriptSegment[]`.
4. The analysis engine resolves the current user's configured AI provider/model, with DeepSeek as the first new target provider.
5. The analysis engine generates `ConceptMapAnalysis`.
6. Concepts and relations include evidence spans.
7. Clicking a concept or relation seeks the video player to the corresponding evidence start time.

## Explicit Non-Goals

- Highlight reels are not the default analysis.
- Fixed time chunks are not a product-level output.
- Evidence Timeline is not required for first MVP.
- Chat, notes, billing, translation, and image generation are plugins or deferred modules.
- Plugin isolation is soft/static in the MVP; dynamic plugin loading and marketplace behavior are out of scope.

## Acceptance Criteria

- Documentation defines the new MVP scope, core flow, plugin boundaries, analysis contract, platform adapter contract, API reference, LongCut system mapping, user AI model configuration, Bilibili research, and implementation plan.
- Doc Pipeline can scan/check/build the documentation package.
- The Bilibili research includes mismatch risks and mitigation strategies.
- The docs explicitly state this is an in-place LongCut evolution, not a greenfield rewrite.
- The docs define which existing LongCut capabilities are Core Pipeline, Core Infrastructure, or Feature Plugins.
