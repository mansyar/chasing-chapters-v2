# Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4 (stable) App Router, standalone build (webpack), server-rendered hero (no `ssr:false` above the fold), next/image optimizer cache 24h |
| CMS | Payload CMS 3.90 (local API, Postgres adapter, drafts/versions, localization en/id) |
| i18n | Hand-rolled path-based locales (`/en`, `/id`) - typed dictionaries in `src/lib/i18n/` (`en` is the key source of truth, `id` typed over it; key-parity and source-scan tests), `src/proxy.ts` redirects unprefixed paths (307) and legacy `?locale=` (308), per-page canonical/hreflang/`og:locale` in `src/lib/seo/metadata.ts`, sitemap alternates (`src/lib/seo/sitemap.ts`), a feed per locale, and a remembered `NEXT_LOCALE` cookie written only by the language control; no i18n dependency (added 2026-10-24) |
| Language | TypeScript 7 (`bun check` — Bun-native type checker, TS7 behavior) |
| Runtime/Package Manager | Bun (runtime, package manager, test runner, type checking) |
| Database | PostgreSQL 16 (drizzle-orm 0.45, schema managed via migrations) |
| Cache | Redis (ioredis 6) — translation cache + rate limiting |
| Comment Moderation | Shared decision module `src/lib/comment-moderation.ts` (`resolveCommentStatus`: banned → rejected, spam-flagged → pending, trusted bypass → approved) built on blocklist heuristics; persisted `spamSignals` field on comments (migration `20261009_195737_add_spam_signals_to_comments`); admin dashboard moderation widget backed by lean `src/lib/moderation-summary.ts` + admin-only `src/app/actions/moderation.ts` (added 2026-10-10) |
| Styling | Tailwind CSS 4 (latest), shadcn/ui + Radix (latest), tw-animate-css, sonner (toasts, added 2026-10-08) |
| Media | Cloudflare R2 (S3 adapter, latest), sharp (blurDataURL, resized variants); public covers served straight from the R2 bucket domain via `src/lib/media-url.ts` + `NEXT_PUBLIC_R2_PUBLIC_URL` (added 2026-10-09), admin uploads still proxy through `/api/media/file`; the storage adapter is selectable (`STORAGE_ADAPTER`: `s3` default, `local` = Payload's own disk storage, used by the e2e run) (added 2026-10-22) |
| Translation | Google Cloud Translation API v10 |
| Monitoring | Sentry 11 (`withSentryConfig` from `@sentry/nextjs/config`, `dataCollection` replaces `sendDefaultPii`), Umami analytics |
| Validation | Zod 4.6 |
| Testing | Bun test (unit), Playwright (e2e, chromium) — the e2e suite runs against a **production build** (the standalone artifact on port 3100) with a deterministic, idempotent fixture, an offline translation stub and a bounded worker count (3 by default, `PLAYWRIGHT_WORKERS` override, 1 in CI); the run has **a database of its own** (`<DATABASE_URI database name>_e2e`, created and seeded by `src/scripts/e2e-run.ts`), stores its media on the local disk (`STORAGE_ADAPTER=local`) and fails fast when Redis is unreachable; added 2026-10-22 |
| Lint/Format | Biome 2.5 (migrated from ESLint), husky pre-commit (bun check + biome + bun test) |
| Deploy | Docker (bun alpine, standalone, non-root) → Docker Hub → Coolify (GitHub Actions); PR validation CI via `.github/workflows/ci.yml` (typecheck, lint, test, build against Postgres service; required check on main, added 2026-10-21; plus a sibling e2e job running the Playwright suite against a production build with Postgres + Redis services, added 2026-10-22); boot warm-up via `src/instrumentation.ts` → `src/lib/warm-up.ts` (ISR pages warmed on start, added 2026-10-08) |
