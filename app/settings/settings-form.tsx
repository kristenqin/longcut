'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, PlugZap, KeyRound, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'
import { csrfFetch, getCSRFToken } from '@/lib/csrf-client'
import type { PublicUserAIProviderSettings } from '@/lib/user-ai-settings'

interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

interface SettingsFormProps {
  user: User
  profile: Profile | null
  aiSettings: PublicUserAIProviderSettings | null
}

type AISettingsAction = 'save' | 'test' | 'delete'

export default function SettingsForm({ user, profile, aiSettings }: SettingsFormProps) {
  const supabase = createClient()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [savedAISettings, setSavedAISettings] = useState<PublicUserAIProviderSettings | null>(aiSettings)
  const [aiProvider, setAIProvider] = useState<PublicUserAIProviderSettings['provider']>(aiSettings?.provider ?? 'deepseek')
  const [aiModel, setAIModel] = useState(aiSettings?.model ?? 'deepseek-v4-flash')
  const [aiApiKey, setAIApiKey] = useState('')
  const [aiBaseUrl, setAIBaseUrl] = useState(aiSettings?.apiBaseUrl ?? '')
  const [aiAction, setAIAction] = useState<AISettingsAction | null>(null)

  useEffect(() => {
    getCSRFToken().catch((error) => {
      console.error('Failed to pre-fetch CSRF token:', error)
    })
  }, [])

  useEffect(() => {
    setSavedAISettings(aiSettings)
    setAIProvider(aiSettings?.provider ?? 'deepseek')
    setAIModel(aiSettings?.model ?? 'deepseek-v4-flash')
    setAIBaseUrl(aiSettings?.apiBaseUrl ?? '')
    setAIApiKey('')
  }, [aiSettings])

  const hasAISettingsChanges = useMemo(() => {
    return (
      aiProvider !== (savedAISettings?.provider ?? 'deepseek') ||
      aiModel.trim() !== (savedAISettings?.model ?? 'deepseek-v4-flash') ||
      aiBaseUrl.trim() !== (savedAISettings?.apiBaseUrl ?? '') ||
      aiApiKey.trim().length > 0
    )
  }, [aiProvider, aiModel, aiBaseUrl, aiApiKey, savedAISettings])

  const buildAISettingsPayload = () => ({
    provider: aiProvider,
    model: aiModel.trim() || 'deepseek-v4-flash',
    ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
    ...(aiBaseUrl.trim() ? { apiBaseUrl: aiBaseUrl.trim() } : {}),
  })

  const handleSaveProfile = async () => {
    setProfileLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) throw error
      toast.success('Profile updated')
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleSaveAISettings = async () => {
    setAIAction('save')
    try {
      const response = await csrfFetch.put('/api/ai-settings', buildAISettingsPayload())
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to save AI settings')
      }

      setSavedAISettings(payload.settings ?? null)
      setAIApiKey('')
      toast.success('AI model settings saved')
    } catch (error) {
      console.error('Failed to save AI settings:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save AI settings')
    } finally {
      setAIAction(null)
    }
  }

  const handleTestAISettings = async () => {
    setAIAction('test')
    try {
      const response = await csrfFetch.post('/api/ai-settings/test', buildAISettingsPayload())
      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Connection test failed')
      }

      toast.success(`Connected to ${payload.provider} (${payload.model})`)
    } catch (error) {
      console.error('Failed to test AI settings:', error)
      toast.error(error instanceof Error ? error.message : 'Connection test failed')
    } finally {
      setAIAction(null)
    }
  }

  const handleDeleteAISettings = async () => {
    setAIAction('delete')
    try {
      const response = await csrfFetch.delete('/api/ai-settings')
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to clear AI settings')
      }

      setSavedAISettings(null)
      setAIProvider('deepseek')
      setAIModel('deepseek-v4-flash')
      setAIBaseUrl('')
      setAIApiKey('')
      toast.success('AI model settings cleared')
    } catch (error) {
      console.error('Failed to clear AI settings:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to clear AI settings')
    } finally {
      setAIAction(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserRound className="h-5 w-5" />
            Account
          </CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="fullName">Name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSaveProfile} disabled={profileLoading}>
            {profileLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save profile'
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5" />
            AI model
          </CardTitle>
          <CardDescription>
            Configure the DeepSeek-compatible model used for Concept Map analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-5">
          <Alert>
            <AlertDescription>
              Your API key is encrypted server-side and is never returned to the browser.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="aiProvider">Provider</Label>
              <Select
                value={aiProvider}
                onValueChange={(value) =>
                  setAIProvider(value as PublicUserAIProviderSettings['provider'])
                }
              >
                <SelectTrigger id="aiProvider" className="w-full">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aiModel">Model</Label>
              <Input
                id="aiModel"
                value={aiModel}
                onChange={(event) => setAIModel(event.target.value)}
                placeholder="deepseek-v4-flash"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aiApiKey">API key</Label>
            <Input
              id="aiApiKey"
              type="password"
              value={aiApiKey}
              onChange={(event) => setAIApiKey(event.target.value)}
              placeholder={
                savedAISettings?.apiKeyLast4
                  ? `Saved key ending in ${savedAISettings.apiKeyLast4}`
                  : 'Enter API key'
              }
              autoComplete="off"
            />
            {savedAISettings?.hasApiKey && (
              <p className="text-xs text-muted-foreground">
                Saved key ending in {savedAISettings.apiKeyLast4 ?? 'unknown'}
                {savedAISettings.testedAt
                  ? `, tested ${new Date(savedAISettings.testedAt).toLocaleDateString()}`
                  : ''}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="aiBaseUrl">Base URL</Label>
            <Input
              id="aiBaseUrl"
              value={aiBaseUrl}
              onChange={(event) => setAIBaseUrl(event.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </div>
        </CardContent>
        <CardFooter className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-white/95 px-6 py-3 backdrop-blur sm:static sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3 sm:border-t-0 sm:bg-transparent sm:py-6 sm:backdrop-blur-none">
          {savedAISettings && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDeleteAISettings}
              disabled={aiAction !== null}
              className="w-full sm:w-auto"
            >
              {aiAction === 'delete' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleTestAISettings}
            disabled={aiAction !== null || (!aiApiKey.trim() && !savedAISettings?.hasApiKey)}
            className="w-full sm:w-auto"
          >
            {aiAction === 'test' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <PlugZap className="mr-2 h-4 w-4" />
                Test
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={handleSaveAISettings}
            disabled={aiAction !== null || !hasAISettingsChanges || !aiModel.trim()}
            className="w-full sm:w-auto"
          >
            {aiAction === 'save' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save AI model'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
