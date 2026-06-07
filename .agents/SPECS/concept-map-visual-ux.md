# Concept Map Visual UX Spec

## Purpose

Upgrade the Concept Map MVP from a card list into an interactive concept graph that makes relationships visually scannable and preserves the video evidence jump behavior.

## Non-Goals

- Do not change the Concept Map API schema.
- Do not change transcript fetching, Bilibili adapter behavior, or DeepSeek provider selection.
- Do not implement streaming generation in this slice.
- Do not add persistent database storage or cache in this slice.

## Interfaces

Input:

- `ConceptMapAnalysis`
- `ConceptNode[]`
- `ConceptRelation[]`
- `EvidenceSpan[]`
- `onSeek(seconds: number)`

Output:

- A graph canvas with concept nodes and directed relation edges.
- An inspector showing selected concept details, evidence, and related relations.
- A staged loading panel while `isLoading` is true.

## Key Decisions

- Use `@xyflow/react` for graph rendering.
- Use `@dagrejs/dagre` for deterministic layout.
- Keep the existing `ConceptMapPanel` public props stable.
- Add a dedicated `ConceptGraphCanvas` component so the panel remains an orchestration component.
- Keep node counts small in the UI and use existing `maxConcepts = 6` for the first release.

## Edge Cases and Failure Modes

- Concepts with no relations still render as standalone nodes.
- Relations pointing to missing concept ids are ignored in the graph but can still be safely omitted from the inspector.
- Concepts with no evidence are selectable but do not seek video automatically.
- Small/mobile containers should still show the graph and inspector stacked vertically.
- Loading state must not imply real streaming progress; stages are UX milestones, not backend events.

## Acceptance Criteria

- Concept Map UI renders a graph canvas when `analysis.concepts` exists.
- Graph includes at least one node per concept and one directed edge per valid relation.
- Clicking a concept selects it and seeks to its first evidence timestamp when available.
- Inspector shows selected concept definition, role, evidence chips, and related relations.
- Loading state shows staged progress text and elapsed seconds.
- Existing Concept Map API request still sends `maxConcepts: 6`.
- Existing optional highlight plugins remain below Concept Map.

## Test Plan

- Source boundary tests for `ConceptMapPanel` and `ConceptGraphCanvas`.
- Typecheck with `npx tsc --noEmit`.
- Targeted eslint on changed files.
- Existing analyze layout tests.
- Manual browser smoke on the analyze page after dev server startup.
