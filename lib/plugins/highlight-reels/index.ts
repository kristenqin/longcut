import {
  generateThemesFromTranscript as generateLegacyThemesFromTranscript,
  generateTopicsFromTranscript as generateLegacyTopicsFromTranscript,
} from '@/lib/ai-processing';

export type GenerateHighlightReelsOptions = NonNullable<
  Parameters<typeof generateLegacyTopicsFromTranscript>[1]
>;

export type GenerateHighlightThemesOptions = {
  language?: string;
  model?: string;
};

export type HighlightReelsResult = Awaited<
  ReturnType<typeof generateLegacyTopicsFromTranscript>
>;

export type HighlightThemesResult = Awaited<
  ReturnType<typeof generateLegacyThemesFromTranscript>
>;

/**
 * Legacy highlight-reel generation is kept behind this plugin boundary so the
 * Concept Map core flow can evolve without importing topic-generation internals.
 */
export function generateHighlightReelsFromTranscript(
  transcript: Parameters<typeof generateLegacyTopicsFromTranscript>[0],
  options: GenerateHighlightReelsOptions = {}
): Promise<HighlightReelsResult> {
  return generateLegacyTopicsFromTranscript(transcript, options);
}

export function generateHighlightThemesFromTranscript(
  transcript: Parameters<typeof generateLegacyThemesFromTranscript>[0],
  videoInfo: Parameters<typeof generateLegacyThemesFromTranscript>[1],
  options: GenerateHighlightThemesOptions = {}
): Promise<HighlightThemesResult> {
  return generateLegacyThemesFromTranscript(
    transcript,
    videoInfo,
    options.model,
    options.language
  );
}
