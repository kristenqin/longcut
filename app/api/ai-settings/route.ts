import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { createClient } from '@/lib/supabase/server';
import {
  deleteUserAIProviderSettings,
  getUserAIProviderSettings,
  toPublicUserAISettings,
  upsertUserAIProviderSettings,
  userAIProviderSettingsInputSchema,
} from '@/lib/user-ai-settings';

function normalizePayload(body: unknown) {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const payload = { ...(body as Record<string, unknown>) };

  for (const key of ['apiKey', 'apiBaseUrl']) {
    if (typeof payload[key] === 'string' && payload[key].trim() === '') {
      delete payload[key];
    }
  }

  return payload;
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

  if (req.method === 'GET') {
    const settings = await getUserAIProviderSettings(supabase, user.id);
    return NextResponse.json({ settings: toPublicUserAISettings(settings) });
  }

  if (req.method === 'DELETE') {
    await deleteUserAIProviderSettings(supabase, user.id);
    return NextResponse.json({ settings: null });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    let input;
    try {
      input = userAIProviderSettingsInputSchema.parse(normalizePayload(parsedBody));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.flatten() },
          { status: 400 }
        );
      }

      throw error;
    }

    try {
      const settings = await upsertUserAIProviderSettings(
        supabase,
        user.id,
        input
      );
      return NextResponse.json({ settings: toPublicUserAISettings(settings) });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save AI settings.';
      const status = message.includes('API key is required') ? 400 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export const GET = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
export const PUT = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
export const POST = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
export const DELETE = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
