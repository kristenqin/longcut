import { z } from 'zod';
import type { ProviderKey } from '@/lib/ai-providers';
import { generateAIResult } from '@/lib/ai-client';
import type {
  NormalizedTranscriptSegment,
  TranscriptResult,
  VideoMetadata,
  VideoRef,
} from '@/lib/platform';
import { buildTranscriptIndex, findTextInTranscript } from '@/lib/quote-matcher';
import type {
  ConceptMapAnalysis,
  ConceptNode,
  ConceptRelation,
  ConceptRelationType,
  ConceptRole,
  EvidenceSpan,
  ModelRunMetadata,
} from './types';

const conceptRoleSchema = z.enum([
  'first_principle',
  'core_concept',
  'derived_concept',
  'example',
  'counterexample',
  'method',
  'conclusion',
]);

const relationTypeSchema = z.enum([
  'depends_on',
  'causes',
  'explains',
  'supports',
  'contrasts',
  'leads_to',
  'refines',
]);

const evidenceSpanSchema = z.object({
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  transcriptSegmentIds: z.array(z.string()).optional(),
  quote: z.string().max(4000).optional(),
  reason: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1).optional(),
});

const conceptNodeSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  role: conceptRoleSchema,
  definition: z.string().min(1).max(2000),
  evidence: z.array(evidenceSpanSchema).max(5).default([]),
  importance: z.number().min(0).max(1).default(0.5),
});

const conceptRelationSchema = z.object({
  id: z.string().min(1).max(100),
  fromConceptId: z.string().min(1).max(80),
  toConceptId: z.string().min(1).max(80),
  relationType: relationTypeSchema,
  description: z.string().min(1).max(2000),
  evidence: z.array(evidenceSpanSchema).max(5).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

const conceptMapResponseSchema = z.object({
  thesis: z.string().max(3000).optional(),
  centralQuestion: z.string().max(1000).optional(),
  concepts: z.array(conceptNodeSchema).min(1).max(24),
  relations: z.array(conceptRelationSchema).max(48).default([]),
  warnings: z.array(z.string().max(1000)).default([]),
});

type ConceptMapResponse = z.infer<typeof conceptMapResponseSchema>;
type ResponseEvidenceSpan = z.infer<typeof evidenceSpanSchema>;

interface NormalizedConceptsResult {
  concepts: ConceptNode[];
  conceptIdMap: Map<string, string>;
}

export interface GenerateConceptMapOptions {
  videoRef: VideoRef;
  metadata?: Partial<VideoMetadata>;
  transcript: TranscriptResult | NormalizedTranscriptSegment[];
  provider?: ProviderKey;
  model?: string;
  configSource?: ModelRunMetadata['configSource'];
  maxConcepts?: number;
  timeoutMs?: number;
  generateAI?: typeof generateAIResult;
}

function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function slugId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || fallback;
}

function conceptReferenceKeys(value: string | undefined): string[] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const slug = slugId(normalized, '');
  return slug && slug !== normalized ? [normalized, slug] : [normalized];
}

function addConceptReference(
  conceptIdMap: Map<string, string>,
  reference: string | undefined,
  normalizedId: string
) {
  for (const key of conceptReferenceKeys(reference)) {
    conceptIdMap.set(key, normalizedId);
  }
}

function resolveConceptReference(
  conceptIdMap: Map<string, string>,
  reference: string
): string | undefined {
  for (const key of conceptReferenceKeys(reference)) {
    const id = conceptIdMap.get(key);
    if (id) {
      return id;
    }
  }

  return undefined;
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function asTranscriptSegments(
  transcript: TranscriptResult | NormalizedTranscriptSegment[]
): {
  segments: NormalizedTranscriptSegment[];
  language?: string;
  source?: string;
  coverageRatio?: number;
  warnings: string[];
} {
  if (Array.isArray(transcript)) {
    return {
      segments: transcript,
      warnings: [],
    };
  }

  return {
    segments: transcript.segments,
    language: transcript.language,
    source: transcript.source,
    coverageRatio: transcript.quality.durationCoverage,
    warnings: transcript.warnings,
  };
}

function buildTranscriptPromptBlock(segments: NormalizedTranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const end = Number.isFinite(segment.end)
        ? segment.end
        : segment.start + segment.duration;
      return `[${segment.id} ${formatSeconds(segment.start)}-${formatSeconds(end)}] ${segment.text}`;
    })
    .join('\n');
}

function buildConceptMapPrompt(input: {
  metadata?: Partial<VideoMetadata>;
  segments: NormalizedTranscriptSegment[];
  maxConcepts: number;
}): string {
  const videoContext = [
    input.metadata?.title ? `Title: ${input.metadata.title}` : undefined,
    input.metadata?.author ? `Author: ${input.metadata.author}` : undefined,
    input.metadata?.description ? `Description: ${input.metadata.description}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  return `<task>
<role>You are an expert at first-principles conceptual analysis of long-form video transcripts.</role>
<goal>Build a concept map that explains the transcript's core concepts and how they relate. Do not create highlight reels or time-based chunks.</goal>
<context>
${videoContext || 'No video metadata provided.'}
</context>
<instructions>
  <item>Identify the central question and thesis of the transcript.</item>
  <item>Extract up to ${input.maxConcepts} concepts, prioritizing first principles, core concepts, derived concepts, methods, examples, counterexamples, and conclusions.</item>
  <item>Describe relationships between concepts using only the allowed relation types.</item>
  <item>Every core concept and relation should include evidence from the transcript.</item>
  <item>Use transcript segment ids when possible. Evidence quotes must be exact transcript text, not paraphrases.</item>
  <item>Prefer conceptual structure over chronological order.</item>
</instructions>
<outputFormat>Return strict JSON with thesis, centralQuestion, concepts, relations, and warnings. Each concept must include id, label, role, definition, importance, and evidence. Each relation must include id, fromConceptId, toConceptId, relationType, description, confidence, and evidence.</outputFormat>
<transcript><![CDATA[
${buildTranscriptPromptBlock(input.segments)}
]]></transcript>
</task>`;
}

function findSegmentsByIds(
  segments: NormalizedTranscriptSegment[],
  ids: string[] | undefined
): NormalizedTranscriptSegment[] {
  if (!ids || ids.length === 0) {
    return [];
  }

  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return ids.flatMap((id) => {
    const segment = byId.get(id);
    return segment ? [segment] : [];
  });
}

function findSegmentsByTime(
  segments: NormalizedTranscriptSegment[],
  start?: number,
  end?: number
): NormalizedTranscriptSegment[] {
  if (
    typeof start !== 'number' ||
    !Number.isFinite(start) ||
    typeof end !== 'number' ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return [];
  }

  return segments.filter((segment) => {
    const segmentEnd = Number.isFinite(segment.end)
      ? segment.end
      : segment.start + segment.duration;
    return segment.start <= end && segmentEnd >= start;
  });
}

function createEvidenceFromSegments(
  evidence: ResponseEvidenceSpan,
  matchedSegments: NormalizedTranscriptSegment[],
  confidence: number
): EvidenceSpan | null {
  if (matchedSegments.length === 0) {
    return null;
  }

  const start = Math.min(...matchedSegments.map((segment) => segment.start));
  const end = Math.max(
    ...matchedSegments.map((segment) =>
      Number.isFinite(segment.end) ? segment.end : segment.start + segment.duration
    )
  );

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return {
    start,
    end,
    transcriptSegmentIds: matchedSegments.map((segment) => segment.id),
    quote: evidence.quote,
    reason: evidence.reason,
    confidence,
  };
}

function anchorEvidence(
  evidence: ResponseEvidenceSpan,
  segments: NormalizedTranscriptSegment[],
  transcriptIndex: ReturnType<typeof buildTranscriptIndex>
): EvidenceSpan | null {
  const confidence = clampConfidence(evidence.confidence);
  const byIds = createEvidenceFromSegments(
    evidence,
    findSegmentsByIds(segments, evidence.transcriptSegmentIds),
    confidence
  );
  if (byIds) {
    return byIds;
  }

  if (evidence.quote) {
    const match = findTextInTranscript(segments, evidence.quote, transcriptIndex, {
      strategy: 'all',
      minSimilarity: 0.72,
    });

    if (match) {
      const matchedSegments = segments.slice(match.startSegmentIdx, match.endSegmentIdx + 1);
      return createEvidenceFromSegments(
        evidence,
        matchedSegments,
        Math.max(confidence, match.confidence ?? 0.75)
      );
    }
  }

  const byTime = createEvidenceFromSegments(
    evidence,
    findSegmentsByTime(segments, evidence.start, evidence.end),
    Math.min(confidence, 0.65)
  );
  if (byTime) {
    return byTime;
  }

  return null;
}

function normalizeConcepts(
  responseConcepts: ConceptMapResponse['concepts'],
  segments: NormalizedTranscriptSegment[],
  transcriptIndex: ReturnType<typeof buildTranscriptIndex>
): NormalizedConceptsResult {
  const usedIds = new Set<string>();
  const conceptIdMap = new Map<string, string>();

  const concepts = responseConcepts.map((concept, index) => {
    const baseId = slugId(concept.id || concept.label, `concept-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    usedIds.add(id);

    const node: ConceptNode = {
      id,
      label: concept.label.trim(),
      role: concept.role as ConceptRole,
      definition: concept.definition.trim(),
      importance: clampConfidence(concept.importance),
      evidence: concept.evidence
        .map((evidence) => anchorEvidence(evidence, segments, transcriptIndex))
        .filter((evidence): evidence is EvidenceSpan => Boolean(evidence)),
    };

    addConceptReference(conceptIdMap, concept.id, node.id);
    addConceptReference(conceptIdMap, concept.label, node.id);
    addConceptReference(conceptIdMap, node.id, node.id);

    return node;
  });

  return { concepts, conceptIdMap };
}

function normalizeRelations(
  relations: ConceptMapResponse['relations'],
  conceptIdMap: Map<string, string>,
  segments: NormalizedTranscriptSegment[],
  transcriptIndex: ReturnType<typeof buildTranscriptIndex>
): ConceptRelation[] {
  const usedIds = new Set<string>();

  return relations.flatMap((relation, index) => {
    const fromConceptId = resolveConceptReference(conceptIdMap, relation.fromConceptId);
    const toConceptId = resolveConceptReference(conceptIdMap, relation.toConceptId);

    if (!fromConceptId || !toConceptId || fromConceptId === toConceptId) {
      return [];
    }

    const baseId = slugId(relation.id, `relation-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    usedIds.add(id);

    return [
      {
        id,
        fromConceptId,
        toConceptId,
        relationType: relation.relationType as ConceptRelationType,
        description: relation.description.trim(),
        evidence: relation.evidence
          .map((evidence) => anchorEvidence(evidence, segments, transcriptIndex))
          .filter((evidence): evidence is EvidenceSpan => Boolean(evidence)),
        confidence: clampConfidence(relation.confidence),
      },
    ];
  });
}

export async function generateConceptMapFromTranscript(
  options: GenerateConceptMapOptions
): Promise<ConceptMapAnalysis> {
  const transcript = asTranscriptSegments(options.transcript);
  const segments = transcript.segments;

  if (segments.length === 0) {
    throw new Error('Cannot generate Concept Map without transcript segments.');
  }

  const maxConcepts = Math.max(4, Math.min(options.maxConcepts ?? 12, 24));
  const prompt = buildConceptMapPrompt({
    metadata: options.metadata,
    segments,
    maxConcepts,
  });

  const generateAI = options.generateAI ?? generateAIResult;
  const result = await generateAI(prompt, {
    provider: options.provider,
    preferredModel: options.model,
    temperature: 0.25,
    maxOutputTokens: 8000,
    timeoutMs: options.timeoutMs ?? 90_000,
    zodSchema: conceptMapResponseSchema,
    schemaName: 'ConceptMapResponse',
    metadata: {
      analysisType: 'concept_map',
      platform: options.videoRef.platform,
      videoId: options.videoRef.platformVideoId,
    },
  });

  const parsed = conceptMapResponseSchema.parse(JSON.parse(result.content));
  const transcriptIndex = buildTranscriptIndex(segments);
  const normalizedConcepts = normalizeConcepts(parsed.concepts, segments, transcriptIndex);
  const concepts = normalizedConcepts.concepts;
  const relations = normalizeRelations(
    parsed.relations,
    normalizedConcepts.conceptIdMap,
    segments,
    transcriptIndex
  );
  const warnings = [
    ...transcript.warnings,
    ...parsed.warnings,
    ...concepts
      .filter((concept) => concept.role === 'core_concept' && concept.evidence.length === 0)
      .map((concept) => `Core concept "${concept.label}" has no anchored evidence.`),
    ...relations
      .filter((relation) => relation.evidence.length === 0)
      .map((relation) => `Relation "${relation.id}" has no anchored evidence.`),
  ];

  return {
    schemaVersion: '1.0',
    analysisType: 'concept_map',
    videoRef: options.videoRef,
    transcriptRef: {
      segmentCount: segments.length,
      language: transcript.language,
      source: transcript.source,
      coverageRatio: transcript.coverageRatio,
    },
    thesis: parsed.thesis,
    centralQuestion: parsed.centralQuestion,
    modelRun: {
      provider: result.provider ?? options.provider ?? 'custom-openai-compatible',
      model: result.model ?? options.model ?? 'unknown',
      configSource: options.configSource ?? (options.provider ? 'workspace_default' : 'system_fallback'),
      usedAt: new Date().toISOString(),
    },
    concepts,
    relations,
    evidenceQuality: {
      hasTranscript: true,
      coverageRatio: transcript.coverageRatio,
      warnings,
    },
  };
}
