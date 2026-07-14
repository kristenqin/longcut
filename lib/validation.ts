import { z } from 'zod';

export const platformVideoIdSchema = z
  .string()
  .min(1, 'Video ID is required')
  .max(200, 'Video ID is too long');

// Kept under the old export name because the Concept Map route accepts both
// legacy YouTube IDs and platform-scoped IDs during the cleanup.
export const youtubeIdSchema = platformVideoIdSchema;

export const videoInfoSchema = z.object({
  videoId: platformVideoIdSchema.optional(),
  platform: z.enum(['youtube', 'bilibili']).optional(),
  title: z.string().min(1).max(500).transform((value) => value.trim()),
  author: z.string().max(200).transform((value) => value.trim()).optional(),
  thumbnail: z.string().max(2000).optional(),
  duration: z.number().min(0).nullable().optional(),
  description: z.string().max(20000).optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
  language: z.string().min(2).max(20).nullish().transform((value) => value ?? undefined),
  availableLanguages: z.array(z.string().min(2).max(20)).nullish().transform((value) => value ?? undefined),
});

export const transcriptSegmentSchema = z.object({
  text: z.string().min(1).max(500000),
  start: z.number().min(0),
  duration: z.number().min(0),
});

export const transcriptSchema = z
  .array(transcriptSegmentSchema)
  .min(1, 'Transcript must have at least one segment')
  .max(50000, 'Transcript exceeds maximum segments');

export function formatValidationError(error: z.ZodError<any>): string {
  return error.issues
    .map((issue) => {
      const field = issue.path?.join('.') || 'field';
      return `${field}: ${issue.message}`;
    })
    .join(', ');
}
