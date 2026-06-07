# Concept Map Visual UX Decisions

## Decision

Use `@xyflow/react` for the Concept Map canvas and `@dagrejs/dagre` for deterministic directed graph layout.

## Why

- The existing Concept Map data is already `concepts` plus `relations`, which maps directly to React Flow nodes and edges.
- MVP maps are small, usually 6-12 concepts, so a deterministic layered layout is more useful than a force simulation.
- React Flow fits the existing React/Next/Tailwind stack and supports custom nodes, click selection, fit view, zoom, and pan without building graph mechanics from scratch.
- Dagre is simpler than ELK for the current graph size and is easy to replace later if maps become more complex.

## Alternatives Considered

- Cytoscape.js: powerful graph analysis and layout engine, but heavier than needed for the current MVP and less natural for custom React UI.
- D3 force layout: flexible, but force-directed movement makes concept chains less stable and harder to read.
- Custom SVG: low dependency cost, but quickly becomes expensive once selection, zoom, fit, responsive layout, and edge routing matter.

## Deferred

- Streaming partial JSON from the model.
- Two-phase model generation.
- Persistent Concept Map cache.
- Large-graph clustering or minimap.

## First Implementation Slice

- Render concepts as graph nodes and relations as directed edges.
- Use concept role and importance for visual hierarchy.
- Click a node or evidence item to seek the video.
- Show a details inspector for the selected node.
- Replace the spinner-only generation state with staged loading copy.
