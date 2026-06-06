-- User-configured AI provider settings for Concept Map MVP.
-- API keys are encrypted by trusted server code before they are stored here.

CREATE TABLE IF NOT EXISTS public.user_ai_provider_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'deepseek',
    model text NOT NULL DEFAULT 'deepseek-v4-flash',
    encrypted_api_key text,
    api_key_last4 text,
    api_base_url text,
    tested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_ai_provider_settings_provider_check CHECK (provider IN ('deepseek')),
    CONSTRAINT user_ai_provider_settings_model_check CHECK (length(model) > 0 AND length(model) <= 100),
    CONSTRAINT user_ai_provider_settings_key_last4_check CHECK (api_key_last4 IS NULL OR length(api_key_last4) <= 8)
);

COMMENT ON TABLE public.user_ai_provider_settings IS 'Per-user AI provider preferences. API keys are encrypted server-side before storage.';
COMMENT ON COLUMN public.user_ai_provider_settings.encrypted_api_key IS 'AES-GCM encrypted provider API key. Never return this field to clients.';
COMMENT ON COLUMN public.user_ai_provider_settings.api_key_last4 IS 'Display-only suffix for the saved API key.';

CREATE INDEX IF NOT EXISTS idx_user_ai_provider_settings_provider
ON public.user_ai_provider_settings(provider);

DROP TRIGGER IF EXISTS update_user_ai_provider_settings_updated_at
ON public.user_ai_provider_settings;

CREATE TRIGGER update_user_ai_provider_settings_updated_at
    BEFORE UPDATE ON public.user_ai_provider_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_ai_provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own AI provider settings"
ON public.user_ai_provider_settings;
CREATE POLICY "Users can read own AI provider settings"
    ON public.user_ai_provider_settings
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own AI provider settings"
ON public.user_ai_provider_settings;
CREATE POLICY "Users can insert own AI provider settings"
    ON public.user_ai_provider_settings
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own AI provider settings"
ON public.user_ai_provider_settings;
CREATE POLICY "Users can update own AI provider settings"
    ON public.user_ai_provider_settings
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own AI provider settings"
ON public.user_ai_provider_settings;
CREATE POLICY "Users can delete own AI provider settings"
    ON public.user_ai_provider_settings
    FOR DELETE
    USING (auth.uid() = user_id);
