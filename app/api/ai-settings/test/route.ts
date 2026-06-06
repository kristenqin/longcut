import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { createClient } from '@/lib/supabase/server';
import {
  markUserAIProviderSettingsTested,
  resolveUserAIProviderConfig,
  testUserAIProviderConnection,
  userAIProviderSettingsInputSchema,
  type ResolvedUserAIProviderConfig,
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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let config: ResolvedUserAIProviderConfig | null = null;
  let shouldMarkSavedConfigTested = false;

  const normalizedPayload = normalizePayload(body);
  const hasInlineKey =
    typeof normalizedPayload.apiKey === 'string' &&
    normalizedPayload.apiKey.trim().length > 0;

  if (hasInlineKey) {
    let input;
    try {
      input = userAIProviderSettingsInputSchema.parse(normalizedPayload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation failed', details: error.flatten() },
          { status: 400 }
        );
      }

      throw error;
    }

    if (!input.apiKey) {
      return NextResponse.json(
        { error: 'API key is required for an inline connection test.' },
        { status: 400 }
      );
    }

    config = {
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      apiBaseUrl: input.apiBaseUrl,
      configSource: 'user',
    };
  } else {
    config = await resolveUserAIProviderConfig(supabase, user.id);
    shouldMarkSavedConfigTested = Boolean(config);
  }

  if (!config) {
    return NextResponse.json(
      { ok: false, error: 'Save an AI provider API key before testing.' },
      { status: 400 }
    );
  }

  const result = await testUserAIProviderConnection(config);

  if (result.ok && shouldMarkSavedConfigTested) {
    await markUserAIProviderSettingsTested(supabase, user.id);
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export const POST = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
