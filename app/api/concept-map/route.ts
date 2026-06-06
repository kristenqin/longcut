import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity } from '@/lib/security-middleware';
import { RATE_LIMITS } from '@/lib/rate-limiter';
import { createClient } from '@/lib/supabase/server';
import { generateConceptMapFromTranscript } from '@/lib/concept-map';
import {
  createTranscriptResult,
  type PlatformKey,
  type VideoRef,
} from '@/lib/platform';
import {
  createUserConfiguredGenerateAI,
  resolveUserAIProviderConfig,
} from '@/lib/user-ai-settings';
import { transcriptSchema, videoInfoSchema, youtubeIdSchema } from '@/lib/validation';

const platformKeySchema = z.enum(['youtube', 'bilibili']);

const videoRefSchema = z.object({
  platform: platformKeySchema,
  canonicalUrl: z.string().url(),
  platformVideoId: z.string().min(1).max(200),
  platformPartId: z.string().max(200).nullable().optional(),
});

const conceptMapRequestSchema = z.object({
  videoId: youtubeIdSchema.optional(),
  videoRef: videoRefSchema.optional(),
  videoInfo: videoInfoSchema.partial().optional(),
  transcript: transcriptSchema,
  maxConcepts: z.number().int().min(4).max(24).optional(),
});

const CONCEPT_MAP_SECURITY = {
  rateLimit: RATE_LIMITS.AUTH_GENERATION,
  maxBodySize: 10 * 1024 * 1024,
  allowedMethods: ['POST'],
  csrfProtection: false,
};

function buildYouTubeRef(videoId: string): VideoRef {
  return {
    platform: 'youtube',
    platformVideoId: videoId,
    platformPartId: null,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function normalizeVideoRef(body: z.infer<typeof conceptMapRequestSchema>): VideoRef {
  if (body.videoRef) {
    return {
      platform: body.videoRef.platform as PlatformKey,
      platformVideoId: body.videoRef.platformVideoId,
      platformPartId: body.videoRef.platformPartId ?? null,
      canonicalUrl: body.videoRef.canonicalUrl,
    };
  }

  if (body.videoId) {
    return buildYouTubeRef(body.videoId);
  }

  throw new Error('videoRef or videoId is required.');
}

async function handler(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth
    .getUser()
    .catch(() => ({ data: { user: null } }));

  let parsedBody;
  try {
    parsedBody = conceptMapRequestSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 400 }
      );
    }

    throw error;
  }

  let videoRef: VideoRef;
  try {
    videoRef = normalizeVideoRef(parsedBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid video reference.' },
      { status: 400 }
    );
  }

  const userAIConfig = user
    ? await resolveUserAIProviderConfig(supabase, user.id)
    : null;
  const transcript = createTranscriptResult(parsedBody.transcript, {
    idPrefix: `${videoRef.platform}-${videoRef.platformVideoId}`,
    language: parsedBody.videoInfo?.language,
    availableLanguages: parsedBody.videoInfo?.availableLanguages,
    expectedDuration: parsedBody.videoInfo?.duration,
    source: 'unknown',
  });

  let analysis;
  try {
    analysis = await generateConceptMapFromTranscript({
      videoRef,
      metadata: parsedBody.videoInfo
        ? {
            platform: videoRef.platform,
            platformVideoId: videoRef.platformVideoId,
            platformPartId: videoRef.platformPartId,
            canonicalUrl: videoRef.canonicalUrl,
            ...parsedBody.videoInfo,
          }
        : undefined,
      transcript,
      provider: userAIConfig?.provider,
      model: userAIConfig?.model,
      configSource: userAIConfig ? 'user' : 'workspace_default',
      maxConcepts: parsedBody.maxConcepts,
      generateAI: userAIConfig
        ? createUserConfiguredGenerateAI(userAIConfig)
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate Concept Map';

    if (message.includes('AI provider') && message.includes('not configured')) {
      return NextResponse.json(
        {
          error: 'AI provider is not configured.',
          details:
            'Set DEEPSEEK_API_KEY in the workspace environment or sign in and save a personal DeepSeek key in Settings.',
        },
        { status: 503 }
      );
    }

    console.error('Concept Map generation failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Concept Map.',
        details: message,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ analysis });
}

export const POST = withSecurity(handler, CONCEPT_MAP_SECURITY);
