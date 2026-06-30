# LongCut – Architecture & Repository Map

Reviewer-first guide to the repository. Start here to find what you need quickly.

---

## What is LongCut?

LongCut transforms long-form YouTube videos into structured learning workspaces. Users paste a URL; the app extracts the transcript, runs AI analysis in parallel, and surfaces highlight reels, a summary, timestamped chat, and a personal notes layer.

---

## Main Runtime Flow

```
User pastes URL
  → /api/transcript        (public YouTube captions)
  → /api/video-info        (oEmbed metadata)
  → /api/generate-topics   (AI highlight reels)   ─┐ parallel
  → /api/generate-summary  (AI summary)            ─┘
  → /api/suggested-questions (background)
  → UI: two-column workspace (player + tabs)
```

State-changing requests go through `csrfFetch` → `withSecurity` middleware (CSRF token, rate limit, body-size cap).

---

## Top-Level Directory Map

| Path | Role | Reviewer priority |
|---|---|---|
| `app/` | Next.js pages and API route handlers | **High** – all user-facing behaviour |
| `components/` | UI modules for the analysis workspace | **High** – UI logic |
| `lib/` | Core business logic, AI orchestration, security, transcript processing | **High** – algorithmic core |
| `contexts/` | React global context (auth session) | Medium |
| `supabase/` | Database config and SQL migrations | Medium – when touching data |
| `scripts/` | Operational scripts (not in request path) | Low for app reviews; relevant for ops/billing |
| `docs/` | Architecture, product, and migration planning docs | Low for app reviews |
| `public/` | Static assets | Low |
| `resources/` | Sample transcript / video-info fixtures | Low |
| `.agents/` | Internal agent specs, todos, decisions | Internal only |

---

## Primary App Code vs Other

**Primary app code** (always review for functional changes):

- `app/` – pages, layouts, API routes
- `components/` – workspace UI
- `lib/` – AI client, processing, quote matching, security, types
- `contexts/` – auth context
- `middleware.ts` – session refresh and security headers

**Infrastructure / config** (review when adding dependencies or changing build):

- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`
- `supabase/` – local Supabase config and migrations
- `package.json` – scripts and dependencies

**Operations** (review for ops/billing work, not routine app PRs):

- `scripts/env/` – environment validation
- `scripts/smoke/` – smoke tests for the MVP and Stripe integration
- `scripts/stripe/` – Stripe portal, pricing, subscription sync
- `scripts/ops/` – newsletter, credits, grant access, product maintenance

**Migration / planning docs** (review when scoping architecture changes):

- `docs/migrations/concept-map-mvp/` – concept-map feature migration plan
- `docs/superpowers/` – design specs for feature expansions

**Internal process** (not relevant for routine code review):

- `.agents/`
- `docs/doc-pipeline-usage.md`

---

## Where to Look First by Change Type

| Change type | Start here |
|---|---|
| New API endpoint or route | `app/api/` + `lib/security-middleware.ts` |
| AI prompt or model change | `lib/ai-processing.ts`, `lib/prompts/`, `lib/ai-providers/` |
| UI panel or tab | `components/` + `app/analyze/[videoId]/page.tsx` |
| Auth or session behaviour | `contexts/auth-context.tsx`, `middleware.ts`, `lib/supabase/` |
| Database schema change | `supabase/migrations/` |
| Stripe / billing | `lib/stripe-*.ts`, `scripts/stripe/`, `app/pricing/` |
| Rate limiting | `lib/rate-limiter.ts`, `lib/security-middleware.ts` |
| Security (CSRF, CSP, input) | `lib/csrf-*.ts`, `lib/sanitizer.ts`, `middleware.ts` |
| Transcript processing | `lib/youtube-transcript-provider.ts`, `lib/quote-matcher.ts`, `lib/transcript-*.ts` |
| Notes system | `lib/notes-client.ts`, `app/api/notes/`, `components/notes-panel.tsx` |
| Concept-map feature | `lib/concept-map/`, `components/concept-map-panel.tsx`, `docs/migrations/concept-map-mvp/` |

---

## Key Files Quick Reference

- `app/analyze/[videoId]/page.tsx` – the main analysis orchestrator (state machine, parallel fetch, playback control)
- `lib/ai-processing.ts` – prompt building, transcript chunking, candidate pooling, topic generation
- `lib/ai-client.ts` – provider-agnostic AI entry point
- `lib/security-middleware.ts` – `withSecurity` wrapper used by all stateful API routes
- `lib/quote-matcher.ts` – Boyer-Moore + n-gram matching to map AI output back to transcript timestamps

---

*This file is intentionally concise. For migration planning see `docs/migrations/`.*
