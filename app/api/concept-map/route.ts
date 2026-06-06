import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

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

  const userAIConfig = await resolveUserAIProviderConfig(supabase, user.id);
  const transcript = createTranscriptResult(parsedBody.transcript, {
    idPrefix: `${videoRef.platform}-${videoRef.platformVideoId}`,
    language: parsedBody.videoInfo?.language,
    availableLanguages: parsedBody.videoInfo?.availableLanguages,
    expectedDuration: parsedBody.videoInfo?.duration,
    source: 'unknown',
  });

  const analysis = await generateConceptMapFromTranscript({
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

  return NextResponse.json({ analysis });
}

export const POST = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
