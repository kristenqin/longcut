import type {
  NormalizedTranscriptSegment,
  TranscriptQuality,
  TranscriptResult,
  TranscriptSource,
} from './types';

type RawTranscriptSegment = {
  text: string;
  start: number;
  duration: number;
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeTranscriptSegments(
  segments: RawTranscriptSegment[],
  options: {
    idPrefix?: string;
    language?: string;
    source?: TranscriptSource;
  } = {}
): NormalizedTranscriptSegment[] {
  const idPrefix = options.idPrefix ?? 'segment';

  return segments.map((segment, index) => {
    const start = toFiniteNumber(segment.start);
    const duration = Math.max(0, toFiniteNumber(segment.duration));
    const text = typeof segment.text === 'string' ? segment.text : '';

    return {
      id: `${idPrefix}-${index}`,
      text,
      start,
      duration,
      end: start + duration,
      language: options.language,
      source: options.source ?? 'unknown',
    };
  });
}

export function assessTranscriptQuality(
  segments: NormalizedTranscriptSegment[],
  expectedDuration?: number | null
): TranscriptQuality {
  const warnings: string[] = [];
  let isMonotonic = true;
  let emptySegments = 0;
  let transcriptEnd = 0;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (!segment.text.trim()) {
      emptySegments++;
    }

    if (index > 0 && segment.start < segments[index - 1].start) {
      isMonotonic = false;
    }

    transcriptEnd = Math.max(transcriptEnd, segment.end);
  }

  if (segments.length === 0) {
    warnings.push('Transcript is empty.');
  }

  if (!isMonotonic) {
    warnings.push('Transcript segment timestamps are not monotonic.');
  }

  const emptySegmentRatio = segments.length > 0 ? emptySegments / segments.length : 0;
  if (emptySegmentRatio > 0.1) {
    warnings.push('Transcript contains many empty segments.');
  }

  const durationCoverage =
    expectedDuration && expectedDuration > 0 ? transcriptEnd / expectedDuration : undefined;

  if (durationCoverage !== undefined && durationCoverage < 0.5) {
    warnings.push('Transcript covers less than half of the expected video duration.');
  }

  return {
    segmentCount: segments.length,
    durationCoverage,
    isMonotonic,
    emptySegmentRatio,
    warnings,
  };
}

export function createTranscriptResult(
  segments: RawTranscriptSegment[],
  options: {
    idPrefix?: string;
    language?: string;
    availableLanguages?: string[];
    source?: TranscriptSource;
    expectedDuration?: number | null;
    raw?: unknown;
    warnings?: string[];
  } = {}
): TranscriptResult {
  const normalizedSegments = normalizeTranscriptSegments(segments, {
    idPrefix: options.idPrefix,
    language: options.language,
    source: options.source,
  });
  const quality = assessTranscriptQuality(normalizedSegments, options.expectedDuration);
  const warnings = [...(options.warnings ?? []), ...quality.warnings];

  return {
    segments: normalizedSegments,
    language: options.language,
    availableLanguages: options.availableLanguages,
    source: options.source ?? 'unknown',
    quality,
    warnings,
    raw: options.raw,
  };
}
