---
id: agents-todos-bilibili-asr-fallback
type: task
module: concept-map-mvp
tags: [agent-todo, bilibili, transcript, asr]
---

# Bilibili ASR Fallback TODO

- [x] Add Bilibili ASR fallback module.
  Verify: `npx tsc --noEmit`.

- [x] Wire fallback after native subtitle lookup.
  Verify: `npx tsx --test lib/__tests__/platform-registry.test.ts`.

- [x] Document configuration and current test-video behavior.
  Verify: `npm run docs:check`.

- [ ] Smoke test the provided Bilibili URL.
  Verify: `POST /api/video-info` returns Bilibili metadata and `POST /api/transcript` reports transcript or explicit ASR configuration gap.
