"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  GitBranch,
  Loader2,
  Network,
  Play,
  Sparkles,
} from "lucide-react";
import type {
  ConceptMapAnalysis,
  ConceptNode,
  ConceptRelation,
  ConceptRelationType,
  ConceptRole,
  EvidenceSpan,
} from "@/lib/concept-map";
import { Button } from "@/components/ui/button";
import { ConceptGraphCanvas } from "@/components/concept-graph-canvas";

interface ConceptMapPanelProps {
  analysis: ConceptMapAnalysis | null;
  isLoading: boolean;
  elapsedTime: number;
  error: string | null;
  onGenerate: () => void;
  onSeek: (seconds: number) => void;
}

const generationStages = [
  { at: 0, label: "Reading transcript" },
  { at: 5, label: "Extracting concepts" },
  { at: 12, label: "Linking relations" },
  { at: 20, label: "Anchoring evidence" },
  { at: 30, label: "Preparing graph" },
] as const;

const roleLabels: Record<ConceptRole, string> = {
  first_principle: "First principle",
  core_concept: "Core concept",
  derived_concept: "Derived concept",
  example: "Example",
  counterexample: "Counterexample",
  method: "Method",
  conclusion: "Conclusion",
};

const relationLabels: Record<ConceptRelationType, string> = {
  depends_on: "depends on",
  causes: "causes",
  explains: "explains",
  supports: "supports",
  contrasts: "contrasts",
  leads_to: "leads to",
  refines: "refines",
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function firstEvidence(concept: ConceptNode): EvidenceSpan | null {
  return concept.evidence.find((evidence) => Number.isFinite(evidence.start)) ?? null;
}

function generationStage(elapsedTime: number) {
  let index = 0;
  for (let i = 0; i < generationStages.length; i += 1) {
    if (elapsedTime >= generationStages[i].at) {
      index = i;
    }
  }

  return {
    index,
    label: generationStages[index].label,
    progress: Math.round(((index + 1) / generationStages.length) * 100),
  };
}

function conceptLabel(analysis: ConceptMapAnalysis, conceptId: string) {
  return (
    analysis.concepts.find((concept) => concept.id === conceptId)?.label ??
    conceptId
  );
}

function EvidenceButton({
  evidence,
  onSeek,
}: {
  evidence: EvidenceSpan;
  onSeek: (seconds: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(evidence.start)}
      className="group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-slate-50"
    >
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 group-hover:bg-slate-200">
        <Play className="h-3 w-3" />
        {formatTime(evidence.start)}
      </span>
      <span className="text-sm leading-5 text-slate-600">
        {evidence.quote || evidence.reason}
      </span>
    </button>
  );
}

function LoadingState({ elapsedTime }: { elapsedTime: number }) {
  const stage = generationStage(elapsedTime);

  return (
    <div
      role="status"
      className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
          <div>
            <p className="text-sm font-medium text-slate-900">{stage.label}</p>
            <p className="text-xs text-slate-500">
              {elapsedTime > 0 ? `${elapsedTime}s elapsed` : "Starting"}
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {stage.index + 1}/{generationStages.length}
        </span>
      </div>
      <div className="h-1 bg-slate-200">
        <div
          className="h-full bg-slate-900 transition-all duration-500"
          style={{ width: `${stage.progress}%` }}
        />
      </div>
    </div>
  );
}

function ConceptInspector({
  analysis,
  concept,
  relatedRelations,
  onSeek,
}: {
  analysis: ConceptMapAnalysis;
  concept: ConceptNode | null;
  relatedRelations: ConceptRelation[];
  onSeek: (seconds: number) => void;
}) {
  if (!concept) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
        Select a concept.
      </div>
    );
  }

  const evidence = concept.evidence
    .filter((item) => Number.isFinite(item.start))
    .slice(0, 4);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold leading-6 text-slate-950">
            {concept.label}
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
            {roleLabels[concept.role]}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{concept.definition}</p>
      </div>

      {evidence.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">Evidence</p>
          <div className="space-y-1">
            {evidence.map((item) => (
              <EvidenceButton
                key={`${item.start}-${item.end}-${item.reason}`}
                evidence={item}
                onSeek={onSeek}
              />
            ))}
          </div>
        </div>
      )}

      {relatedRelations.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">Relations</p>
          <div className="space-y-2">
            {relatedRelations.map((relation) => {
              const isOutgoing = relation.fromConceptId === concept.id;
              const peerId = isOutgoing
                ? relation.toConceptId
                : relation.fromConceptId;

              return (
                <div
                  key={relation.id}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <GitBranch className="h-3.5 w-3.5 text-slate-500" />
                    <span>{isOutgoing ? "to" : "from"}</span>
                    <span>{conceptLabel(analysis, peerId)}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {relationLabels[relation.relationType]} ·{" "}
                    {Math.round(relation.confidence * 100)}%
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {relation.description}
                  </p>
                  {relation.evidence
                    .filter((item) => Number.isFinite(item.start))
                    .slice(0, 1)
                    .map((item) => (
                      <button
                        key={`${relation.id}-${item.start}`}
                        type="button"
                        onClick={() => onSeek(item.start)}
                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                      >
                        <Play className="h-3 w-3" />
                        {formatTime(item.start)}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConceptMapPanel({
  analysis,
  isLoading,
  elapsedTime,
  error,
  onGenerate,
  onSeek,
}: ConceptMapPanelProps) {
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);

  useEffect(() => {
    if (!analysis) {
      setSelectedConceptId(null);
      return;
    }

    if (
      selectedConceptId &&
      analysis.concepts.some((concept) => concept.id === selectedConceptId)
    ) {
      return;
    }

    setSelectedConceptId(analysis.concepts[0]?.id ?? null);
  }, [analysis, selectedConceptId]);

  const selectedConcept = useMemo(
    () =>
      analysis?.concepts.find((concept) => concept.id === selectedConceptId) ??
      null,
    [analysis?.concepts, selectedConceptId]
  );

  const relatedRelations = useMemo(() => {
    if (!analysis || !selectedConcept) return [];

    return analysis.relations.filter(
      (relation) =>
        relation.fromConceptId === selectedConcept.id ||
        relation.toConceptId === selectedConcept.id
    );
  }, [analysis, selectedConcept]);

  const handleConceptClick = (concept: ConceptNode) => {
    setSelectedConceptId(concept.id);
    const evidence = firstEvidence(concept);
    if (evidence) {
      onSeek(evidence.start);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Network className="h-4 w-4" />
            Concept Map
          </div>
          {analysis?.modelRun && (
            <p className="mt-1 text-xs text-slate-500">
              {analysis.modelRun.provider} · {analysis.modelRun.model}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onGenerate}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {elapsedTime > 0 ? `${elapsedTime}s` : "Generating"}
            </>
          ) : analysis ? (
            "Regenerate"
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && <LoadingState elapsedTime={elapsedTime} />}

      {!analysis && !isLoading && !error && (
        <div className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          No Concept Map yet.
        </div>
      )}

      {analysis && (
        <div className="mt-4 space-y-4">
          {(analysis.centralQuestion || analysis.thesis) && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              {analysis.centralQuestion && (
                <p className="text-sm font-medium text-slate-900">
                  {analysis.centralQuestion}
                </p>
              )}
              {analysis.thesis && (
                <p className="text-sm leading-6 text-slate-600">{analysis.thesis}</p>
              )}
            </div>
          )}

          <ConceptGraphCanvas
            analysis={analysis}
            selectedConceptId={selectedConceptId}
            onSelectConcept={handleConceptClick}
          />

          <ConceptInspector
            analysis={analysis}
            concept={selectedConcept}
            relatedRelations={relatedRelations}
            onSeek={onSeek}
          />

          {analysis.evidenceQuality.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {analysis.evidenceQuality.warnings.slice(0, 2).join(" ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
