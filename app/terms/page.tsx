import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | LongCut',
  description: 'Understand the terms for using LongCut with your own AI provider key.',
}

const supportEmail = 'zara@longcut.ai'

export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-16 pt-24 text-base leading-relaxed text-[#3f3f3f] sm:px-6 lg:px-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-[#3f3f3f]">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: July 13, 2026</p>
        <p>
          These Terms govern your access to and use of LongCut. By creating an account or using the product, you agree
          to these Terms. If you do not agree, please do not use LongCut.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Account &amp; AI Provider Keys</h2>
        <p>
          You are responsible for maintaining the security of your LongCut account and any AI provider API key you save
          in Settings. LongCut encrypts saved provider keys server-side and uses them only to run video analysis
          requests you initiate.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Video Analysis</h2>
        <p>
          LongCut analyzes captioned YouTube and bilibili videos by fetching video metadata, fetching available
          transcript data, and generating a Concept Map from that transcript. If a video has no usable transcript,
          LongCut should fail clearly rather than inventing unsupported concepts.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Acceptable Use</h2>
        <p>
          You agree not to misuse LongCut, interfere with other users, submit content you do not have permission to
          process, or attempt to access the service using automated scripts at a rate that would degrade performance.
          We may suspend or terminate accounts that violate these Terms or applicable law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we will notify you via email or an
          in-app message and indicate the effective date. Your continued use of LongCut after the update becomes
          effective means you accept the revised Terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-[#3f3f3f]">Contact</h2>
        <p>
          If you have questions about these Terms, please reach out to us at{' '}
          <a className="font-medium text-[#3f3f3f] underline underline-offset-4" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      </section>
    </div>
  )
}
