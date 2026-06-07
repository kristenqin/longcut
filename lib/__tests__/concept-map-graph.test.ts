import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('Concept Graph renders Concept Map data through React Flow and Dagre', () => {
  const graphSource = readProjectFile('components/concept-graph-canvas.tsx');

  assert.match(graphSource, /from "@xyflow\/react"/);
  assert.match(graphSource, /from "@dagrejs\/dagre"/);
  assert.match(graphSource, /analysis\.concepts\.map/);
  assert.match(graphSource, /analysis\.relations\.filter/);
  assert.match(graphSource, /dagre\.layout\(graph\)/);
  assert.match(graphSource, /onNodeClick=\{\(_, node\) => onSelectConcept\(node\.data\.concept\)\}/);
});

test('Concept Map panel uses graph, inspector, and staged loading', () => {
  const panelSource = readProjectFile('components/concept-map-panel.tsx');

  assert.match(panelSource, /generationStages/);
  assert.match(panelSource, /Reading transcript/);
  assert.match(panelSource, /Extracting concepts/);
  assert.match(panelSource, /Linking relations/);
  assert.match(panelSource, /Anchoring evidence/);
  assert.match(panelSource, /Preparing graph/);
  assert.match(panelSource, /<ConceptGraphCanvas/);
  assert.match(panelSource, /<ConceptInspector/);
  assert.match(panelSource, /onSeek\(evidence\.start\)/);
});
