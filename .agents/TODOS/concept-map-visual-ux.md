# Concept Map Visual UX TODO

- [x] Add implementation docs
  Verify: `npm run docs:check`

- [x] Install graph dependencies
  Verify: `npm ls @xyflow/react @dagrejs/dagre`

- [x] Add `ConceptGraphCanvas`
  Verify: `npx tsc --noEmit`

- [x] Update `ConceptMapPanel` to use graph + inspector + staged loading
  Verify: `npx tsx --test app/analyze/__tests__/right-column-layout.test.ts`

- [x] Add regression tests for graph rendering source boundaries
  Verify: `npx tsx --test app/analyze/__tests__/right-column-layout.test.ts lib/__tests__/concept-map-graph.test.ts`

- [x] Run final checks
  Verify: `npx tsc --noEmit && npx eslint components/concept-map-panel.tsx components/concept-graph-canvas.tsx app/analyze/__tests__/right-column-layout.test.ts lib/__tests__/concept-map-graph.test.ts && npm run docs:check`
