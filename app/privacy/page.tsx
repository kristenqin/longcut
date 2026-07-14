import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | LongCut',
  description:
    'Learn how LongCut collects, uses, and protects account, transcript, AI key, and Concept Map data.',
}

const supportEmail = 'zara@longcut.ai'

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-16 pt-24 text-base leading-relaxed text-[#3f3f3f] sm:px-6 lg:px-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-[#3f3f3f]">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: July 13, 2026</p>
        <p>
          This Privacy Policy describes how LongCut collects, uses, and protects your personal information when you use
          our service.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Information We Collect</h2>
        <p>
          We collect account information such as your email address, saved AI model settings, encrypted provider API
          keys, submitted YouTube or bilibili URLs, video metadata, transcripts, and generated Concept Map analysis
          results.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">How We Use Your Information</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Authenticate your account and keep your session active.</li>
          <li>Fetch video metadata and transcripts for videos you submit.</li>
          <li>Use your configured AI provider key to generate Concept Maps.</li>
          <li>Cache analysis results so repeated opens do not always require a new AI request.</li>
          <li>Protect the service from abuse and troubleshoot failures.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Third-Party Services</h2>
        <p>
          We use Supabase for authentication and database storage. We fetch video data from YouTube and bilibili when
          you submit a video link. AI analysis is sent to the provider you configure, such as DeepSeek, or to the
          workspace default provider if configured.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">AI Provider Keys</h2>
        <p>
          Provider API keys are encrypted before storage and are never returned to the browser. We use saved keys only
          to process analysis requests for your account. You can clear your saved AI settings from Settings.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Data Security</h2>
        <p>
          We use HTTPS, server-side key encryption, authentication controls, and database access policies to protect
          your data. No method of internet transmission is perfectly secure, but we design the system to avoid exposing
          raw provider API keys to clients.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Your Choices</h2>
        <p>
          You can update your profile and clear AI model settings in LongCut. To request account deletion or ask about
          stored data, contact{' '}
          <a className="font-medium text-[#3f3f3f] underline underline-offset-4" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      </section>
    </div>
  )
}
