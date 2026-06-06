"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Network, Play, Sparkles } from "lucide-react";
import type {
  ConceptMapAnalysis,
  ConceptNode,
  EvidenceSpan,
} from "@/lib/concept-map";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConceptMapPanelProps {
  analysis: ConceptMapAnalysis | null;
  isLoading: boolean;
  elapsedTime: number;
  error: string | null;
  onGenerate: () => void;
  onSeek: (seconds: number) => void;
  isAuthenticated: boolean;
  onRequestSignIn: () => void;
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function firstEvidence(concept: ConceptNode): EvidenceSpan | null {
  return concept.evidence.find((evidence) => Number.isFinite(evidence.start)) ?? null;
}

export function ConceptMapPanel({
  analysis,
  isLoading,
  elapsedTime,
  error,
  onGenerate,
  onSeek,
  isAuthenticated,
  onRequestSignIn,
}: ConceptMapPanelProps) {
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const selectedConcept = useMemo(
    () => analysis?.concepts.find((concept) => concept.id === selectedConceptId) ?? null,
    [analysis?.concepts, selectedConceptId]
  );

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
          onClick={isAuthenticated ? onGenerate : onRequestSignIn}
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

      {!analysis && !isLoading && !error && (
        <div className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          Generate concepts from the transcript.
        </div>
      )}

      {analysis && (
        <div className="mt-4 space-y-4">
          {(analysis.centralQuestion || analysis.thesis) && (
            <div className="space-y-2 rounded-md bg-slate-50 p-3">
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

          <div className="grid gap-3 sm:grid-cols-2">
            {analysis.concepts.map((concept) => {
              const evidence = firstEvidence(concept);
              const isSelected = concept.id === selectedConceptId;

              return (
                <button
                  key={concept.id}
                  type="button"
                  onClick={() => handleConceptClick(concept)}
                  className={cn(
                    "min-h-[124px] rounded-md border p-3 text-left transition hover:border-slate-400 hover:bg-slate-50",
                    isSelected
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {concept.label}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-normal text-slate-500">
                        {concept.role.replace(/_/g, " ")}
                      </p>
                    </div>
                    {evidence && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        <Play className="h-3 w-3" />
                        {formatTime(evidence.start)}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-600">
                    {concept.definition}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedConcept?.evidence.length ? (
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                Evidence
              </p>
              {selectedConcept.evidence.slice(0, 3).map((evidence) => (
                <button
                  key={`${evidence.start}-${evidence.end}-${evidence.reason}`}
                  type="button"
                  onClick={() => onSeek(evidence.start)}
                  className="block w-full rounded-md px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">
                    {formatTime(evidence.start)}
                  </span>
                  {evidence.quote ? ` - ${evidence.quote}` : ` - ${evidence.reason}`}
                </button>
              ))}
            </div>
          ) : null}

          {analysis.relations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                Relations
              </p>
              <div className="space-y-2">
                {analysis.relations.slice(0, 8).map((relation) => {
                  const from = analysis.concepts.find(
                    (concept) => concept.id === relation.fromConceptId
                  );
                  const to = analysis.concepts.find(
                    (concept) => concept.id === relation.toConceptId
                  );

                  return (
                    <div
                      key={relation.id}
                      className="rounded-md border border-slate-200 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {from?.label ?? relation.fromConceptId} -&gt;{" "}
                        {to?.label ?? relation.toConceptId}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        {relation.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
