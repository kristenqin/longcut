import type { VideoRef } from '@/lib/platform';

export type ConceptRole =
  | 'first_principle'
  | 'core_concept'
  | 'derived_concept'
  | 'example'
  | 'counterexample'
  | 'method'
  | 'conclusion';

export type ConceptRelationType =
  | 'depends_on'
  | 'causes'
  | 'explains'
  | 'supports'
  | 'contrasts'
  | 'leads_to'
  | 'refines';

export type ConceptMapProvider =
  | 'deepseek'
  | 'minimax'
  | 'grok'
  | 'gemini'
  | 'custom-openai-compatible';

export type ConceptMapConfigSource = 'user' | 'workspace_default' | 'system_fallback';

export interface ModelRunMetadata {
  provider: ConceptMapProvider | string;
  model: string;
  configSource: ConceptMapConfigSource;
  usedAt: string;
}

export interface TranscriptRef {
  segmentCount: number;
  language?: string;
  source?: string;
  coverageRatio?: number;
}

export interface EvidenceSpan {
  start: number;
  end: number;
  transcriptSegmentIds: string[];
  quote?: string;
  reason: string;
  confidence: number;
}

export interface ConceptNode {
  id: string;
  label: string;
  role: ConceptRole;
  definition: string;
  evidence: EvidenceSpan[];
  importance: number;
}

export interface ConceptRelation {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  relationType: ConceptRelationType;
  description: string;
  evidence: EvidenceSpan[];
  confidence: number;
}

export interface EvidenceQuality {
  hasTranscript: boolean;
  coverageRatio?: number;
  warnings: string[];
}

export interface ConceptMapAnalysis {
  schemaVersion: '1.0';
  analysisType: 'concept_map';
  videoRef: VideoRef;
  transcriptRef: TranscriptRef;
  thesis?: string;
  centralQuestion?: string;
  modelRun: ModelRunMetadata;
  concepts: ConceptNode[];
  relations: ConceptRelation[];
  evidenceQuality: EvidenceQuality;
}
