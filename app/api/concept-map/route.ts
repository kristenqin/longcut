import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity } from '@/lib/security-middleware';
import { RATE_LIMITS } from '@/lib/rate-limiter';
import { createClient } from '@/lib/supabase/server';
import { generateConceptMapFromTranscript } from '@/lib/concept-map';
import {
  createTranscriptResult,
  type PlatformKey,
  type TranscriptSource,
  type VideoRef,
} from '@/lib/platform';
import {
  createUserConfiguredGenerateAI,
  resolveUserAIProviderConfig,
} from '@/lib/user-ai-settings';
import { getConfiguredProviderKey } from '@/lib/ai-providers';
import { transcriptSchema, videoInfoSchema, youtubeIdSchema } from '@/lib/validation';
import { saveVideoAnalysisWithRetry } from '@/lib/video-save-utils';
import { invalidJsonBodyResponse, isInvalidJsonBodyError, readJsonObject } from '@/lib/api-json';
import { buildTranscriptIdPrefix, buildVideoCacheKey } from '@/lib/video-cache-key';

const platformKeySchema = z.enum(['youtube', 'bilibili']);

const videoRefSchema = z.object({
  platform: platformKeySchema,
  canonicalUrl: z.string().url(),
  platformVideoId: z.string().min(1).max(200),
  platformPartId: z.string().max(200).nullable().optional(),
});

const transcriptMetaSchema = z.object({
  language: z.string().min(2).max(20).optional(),
  availableLanguages: z.array(z.string().min(2).max(20)).optional(),
  source: z.string().max(40).optional(),
});

const conceptMapRequestSchema = z.object({
  videoId: youtubeIdSchema.optional(),
  videoRef: videoRefSchema.optional(),
  videoInfo: videoInfoSchema.partial().optional(),
  transcript: transcriptSchema,
  transcriptMeta: transcriptMetaSchema.optional(),
  maxConcepts: z.number().int().min(4).max(24).optional(),
});

const CONCEPT_MAP_SECURITY = {
  requireAuth: true,
  rateLimit: RATE_LIMITS.AUTH_GENERATION,
  maxBodySize: 10 * 1024 * 1024,
  allowedMethods: ['POST'],
  csrfProtection: true,
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

function normalizeTranscriptSource(source?: string): TranscriptSource {
  switch (source) {
    case 'manual':
    case 'auto':
    case 'ai':
    case 'unknown':
      return source;
    case 'youtube-direct':
    case 'supadata':
      return 'auto';
    default:
      return 'unknown';
  }
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
    parsedBody = conceptMapRequestSchema.parse(await readJsonObject(req));
  } catch (error) {
    if (isInvalidJsonBodyError(error)) {
      return invalidJsonBodyResponse();
    }

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
  const workspaceProvider = getConfiguredProviderKey() ?? 'deepseek';
  const transcript = createTranscriptResult(parsedBody.transcript, {
    idPrefix: buildTranscriptIdPrefix(videoRef),
    language: parsedBody.transcriptMeta?.language ?? parsedBody.videoInfo?.language,
    availableLanguages:
      parsedBody.transcriptMeta?.availableLanguages ??
      parsedBody.videoInfo?.availableLanguages,
    expectedDuration: parsedBody.videoInfo?.duration,
    source: normalizeTranscriptSource(parsedBody.transcriptMeta?.source),
  });

  let analysis;
  try {
    analysis = await generateConceptMapFromTranscript({
      videoRef,
      metadata: parsedBody.videoInfo
        ? {
            ...parsedBody.videoInfo,
            platform: videoRef.platform,
            platformVideoId: videoRef.platformVideoId,
            platformPartId: videoRef.platformPartId,
            canonicalUrl: videoRef.canonicalUrl,
          }
        : undefined,
      transcript,
      provider: userAIConfig?.provider ?? workspaceProvider,
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

  if (parsedBody.videoInfo) {
    const cacheId = buildVideoCacheKey(videoRef);
    await saveVideoAnalysisWithRetry(
      supabase,
      {
        youtubeId: cacheId,
        title: parsedBody.videoInfo.title ?? 'Untitled video',
        author: parsedBody.videoInfo.author ?? null,
        duration:
          typeof parsedBody.videoInfo.duration === 'number' &&
          Number.isFinite(parsedBody.videoInfo.duration)
            ? Math.max(0, Math.round(parsedBody.videoInfo.duration))
            : 0,
        thumbnailUrl: parsedBody.videoInfo.thumbnail ?? null,
        transcript: parsedBody.transcript,
        topics: null,
        summary: {
          type: 'concept_map',
          analysis,
        },
        suggestedQuestions: null,
        modelUsed: analysis.modelRun.model,
        userId: user.id,
        language:
          parsedBody.transcriptMeta?.language ??
          parsedBody.videoInfo.language ??
          null,
        availableLanguages:
          parsedBody.transcriptMeta?.availableLanguages ??
          parsedBody.videoInfo.availableLanguages ??
          null,
      },
      { maxRetries: 2, retryDelayMs: 300 }
    ).catch((error) => {
      console.error('Failed to cache Concept Map analysis:', error);
    });
  }

  return NextResponse.json({ analysis });
}

export const POST = withSecurity(handler, CONCEPT_MAP_SECURITY);
