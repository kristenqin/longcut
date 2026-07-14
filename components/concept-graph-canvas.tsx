"use client";

import { useMemo } from "react";
import * as dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type {
  ConceptMapAnalysis,
  ConceptNode,
  ConceptRelation,
  ConceptRelationType,
  ConceptRole,
} from "@/lib/concept-map";
import { cn } from "@/lib/utils";

interface ConceptGraphCanvasProps {
  analysis: ConceptMapAnalysis;
  selectedConceptId: string | null;
  onSelectConcept: (concept: ConceptNode) => void;
}

type ConceptGraphNodeData = {
  concept: ConceptNode;
  selected: boolean;
  relationCount: number;
  onSelect: (concept: ConceptNode) => void;
};

type ConceptGraphNode = Node<ConceptGraphNodeData, "concept">;

const NODE_WIDTH = 230;
const NODE_HEIGHT = 126;

const roleStyles: Record<
  ConceptRole,
  {
    label: string;
    border: string;
    badge: string;
    accent: string;
  }
> = {
  first_principle: {
    label: "First principle",
    border: "border-emerald-300",
    badge: "bg-emerald-50 text-emerald-700",
    accent: "bg-emerald-500",
  },
  core_concept: {
    label: "Core concept",
    border: "border-sky-300",
    badge: "bg-sky-50 text-sky-700",
    accent: "bg-sky-500",
  },
  derived_concept: {
    label: "Derived concept",
    border: "border-indigo-300",
    badge: "bg-indigo-50 text-indigo-700",
    accent: "bg-indigo-500",
  },
  example: {
    label: "Example",
    border: "border-amber-300",
    badge: "bg-amber-50 text-amber-700",
    accent: "bg-amber-500",
  },
  counterexample: {
    label: "Counterexample",
    border: "border-rose-300",
    badge: "bg-rose-50 text-rose-700",
    accent: "bg-rose-500",
  },
  method: {
    label: "Method",
    border: "border-teal-300",
    badge: "bg-teal-50 text-teal-700",
    accent: "bg-teal-500",
  },
  conclusion: {
    label: "Conclusion",
    border: "border-slate-300",
    badge: "bg-slate-100 text-slate-700",
    accent: "bg-slate-500",
  },
};

const relationColors: Record<ConceptRelationType, string> = {
  depends_on: "#475569",
  causes: "#0f766e",
  explains: "#2563eb",
  supports: "#16a34a",
  contrasts: "#e11d48",
  leads_to: "#d97706",
  refines: "#4f46e5",
};

function relationLabel(type: ConceptRelationType) {
  return type.replace(/_/g, " ");
}

function ConceptNodeCard({ data }: NodeProps<ConceptGraphNode>) {
  const style = roleStyles[data.concept.role];
  const importance = Math.round(data.concept.importance * 100);
  const selectConcept = () => data.onSelect(data.concept);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={data.selected}
      aria-label={`Select concept ${data.concept.label}`}
      onClick={selectConcept}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectConcept();
        }
      }}
      className={cn(
        "relative h-[126px] w-[230px] cursor-pointer rounded-lg border bg-white p-3 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-slate-900/35 focus:ring-offset-2 focus-visible:ring-4 focus-visible:ring-slate-900/35 focus-visible:ring-offset-2",
        style.border,
        data.selected ? "ring-2 ring-slate-900" : "hover:shadow-md"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
      <div className={cn("absolute left-0 top-3 h-10 w-1 rounded-r-full", style.accent)} />
      <div className="ml-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
            {data.concept.label}
          </p>
          <span
            className={cn(
              "mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
              style.badge
            )}
          >
            {style.label}
          </span>
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500">
          <p>{importance}%</p>
          <p>{data.relationCount} links</p>
        </div>
      </div>
      <p className="ml-2 mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
        {data.concept.definition}
      </p>
    </div>
  );
}

const nodeTypes = {
  concept: ConceptNodeCard,
} satisfies NodeTypes;

function buildElements(
  analysis: ConceptMapAnalysis,
  selectedConceptId: string | null,
  onSelectConcept: (concept: ConceptNode) => void
): {
  nodes: ConceptGraphNode[];
  edges: Edge[];
} {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 42,
    ranksep: 76,
    marginx: 30,
    marginy: 30,
  });

  const conceptsById = new Map(analysis.concepts.map((concept) => [concept.id, concept]));
  const validRelations = analysis.relations.filter(
    (relation) =>
      conceptsById.has(relation.fromConceptId) &&
      conceptsById.has(relation.toConceptId)
  );
  const relationCounts = new Map<string, number>();

  for (const concept of analysis.concepts) {
    graph.setNode(concept.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
    relationCounts.set(concept.id, 0);
  }

  for (const relation of validRelations) {
    graph.setEdge(relation.fromConceptId, relation.toConceptId);
    relationCounts.set(
      relation.fromConceptId,
      (relationCounts.get(relation.fromConceptId) ?? 0) + 1
    );
    relationCounts.set(
      relation.toConceptId,
      (relationCounts.get(relation.toConceptId) ?? 0) + 1
    );
  }

  dagre.layout(graph);

  const nodes: ConceptGraphNode[] = analysis.concepts.map((concept) => {
    const position = graph.node(concept.id) ?? { x: 0, y: 0 };

    return {
      id: concept.id,
      type: "concept",
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      data: {
        concept,
        selected: concept.id === selectedConceptId,
        relationCount: relationCounts.get(concept.id) ?? 0,
        onSelect: onSelectConcept,
      },
      draggable: false,
    };
  });

  const edges: Edge[] = validRelations.map((relation: ConceptRelation) => {
    const color = relationColors[relation.relationType];

    return {
      id: relation.id,
      source: relation.fromConceptId,
      target: relation.toConceptId,
      type: "smoothstep",
      label: relationLabel(relation.relationType),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: 1.5 + relation.confidence,
        opacity: 0.72 + relation.confidence * 0.22,
        strokeDasharray: relation.relationType === "contrasts" ? "6 4" : undefined,
      },
      labelStyle: {
        fill: "#334155",
        fontSize: 11,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.88,
      },
    };
  });

  return { nodes, edges };
}

export function ConceptGraphCanvas({
  analysis,
  selectedConceptId,
  onSelectConcept,
}: ConceptGraphCanvasProps) {
  const { nodes, edges } = useMemo(
    () => buildElements(analysis, selectedConceptId, onSelectConcept),
    [analysis, onSelectConcept, selectedConceptId]
  );

  return (
    <div className="h-[420px] min-h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.25}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
