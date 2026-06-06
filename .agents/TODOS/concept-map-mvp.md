---
id: agents-todos-concept-map-mvp
type: task
module: concept-map-mvp
tags: [agent-todo, mvp]
---

# Concept Map MVP TODO

- [x] Define MVP scope.
  Verify: `docs/concept-map-mvp/01-mvp-scope.md`.

- [x] Define core implementation flow.
  Verify: `docs/concept-map-mvp/02-core-flow.md`.

- [x] Define plugin boundaries for non-main-flow features.
  Verify: `docs/concept-map-mvp/03-plugin-boundaries.md`.

- [x] Define soft plugin isolation plan.
  Verify: `docs/concept-map-mvp/11-plugin-isolation-plan.md`.

- [x] Define Concept Map analysis contract.
  Verify: `docs/concept-map-mvp/04-concept-map-analysis-contract.md`.

- [x] Define platform adapter contract.
  Verify: `docs/concept-map-mvp/05-platform-adapter-contract.md`.

- [x] Define MVP API reference.
  Verify: `docs/concept-map-mvp/08-api-reference.md`.

- [x] Define LongCut system mapping to prevent requirement drift.
  Verify: `docs/concept-map-mvp/09-longcut-system-mapping.md`.

- [x] Define user AI model configuration with DeepSeek as first target.
  Verify: `docs/concept-map-mvp/10-ai-model-configuration.md`.

- [x] Research Bilibili script/subtitle path and mismatch risks.
  Verify: `docs/concept-map-mvp/06-bilibili-script-research.md`.

- [x] Define phased MVP implementation plan.
  Verify: `docs/concept-map-mvp/07-implementation-plan.md`.

- [x] Implement platform-neutral data models.
  Verify: new TypeScript contracts compile.

- [x] Wrap current YouTube logic behind `YouTubeAdapter`.
  Verify: `platform-registry.test.ts` resolves YouTube URLs through `YouTubeAdapter` without changing current routes.

- [x] Add a static plugin registry for non-main-flow features.
  Verify: registry documents plugin id, requirements, existing file anchors, and MVP status without changing runtime behavior.

- [x] Isolate Highlight Reels behind plugin boundaries.
  Verify: `highlight-plugin-boundary.test.ts` confirms highlight APIs call through `lib/plugins/highlight-reels` and Concept Map does not import legacy topic generation.

- [x] Implement user-configured AI provider settings.
  Verify: `user-ai-settings.test.ts`, `deepseek-adapter.test.ts`, and `concept-map-api-boundary.test.ts` cover encrypted storage, masked client response, connection testing, and Concept Map API usage.

- [x] Implement `DeepSeekAdapter`.
  Verify: provider config and adapter tests select and call `deepseek-v4-flash` when `AI_PROVIDER=deepseek`.

- [x] Implement `generateConceptMapFromTranscript`.
  Verify: returns `ConceptMapAnalysis` with evidence spans.

- [x] Render Concept Map and support concept-to-video seek.
  Verify: `right-column-layout.test.ts` confirms `ConceptMapPanel` renders before legacy highlights and passes evidence timestamps to `requestSeek`; browser preview requires local Supabase env.

- [x] Implement `BilibiliAdapter` MVP.
  Verify: `platform-registry.test.ts` covers Bilibili URL parsing, page/cid selection, subtitle JSON download, and normalized transcript output.
