import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PublicUserAIProviderSettings } from '@/lib/user-ai-settings'
import SettingsForm from './settings-form'

// Force dynamic rendering so account and AI provider settings stay current.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: aiSettingsRow } = await supabase
    .from('user_ai_provider_settings')
    .select('provider, model, api_key_last4, api_base_url, tested_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const aiSettings = aiSettingsRow
    ? {
        provider: aiSettingsRow.provider,
        model: aiSettingsRow.model,
        hasApiKey: Boolean(aiSettingsRow.api_key_last4),
        apiKeyLast4: aiSettingsRow.api_key_last4,
        apiBaseUrl: aiSettingsRow.api_base_url,
        testedAt: aiSettingsRow.tested_at,
        updatedAt: aiSettingsRow.updated_at,
      } satisfies PublicUserAIProviderSettings
    : null

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <SettingsForm
        user={user}
        profile={profile}
        aiSettings={aiSettings}
      />
    </div>
  )
}
