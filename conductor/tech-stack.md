# Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4 (stable) App Router, standalone build (webpack), server-rendered hero (no `ssr:false` above the fold), next/image optimizer cache 24h |
| CMS | Payload CMS 3.90 (local API, Postgres adapter, drafts/versions, localization en/id) |
| Language | TypeScript 7 (`bun check` — Bun-native type checker, TS7 behavior) |
| Runtime/Package Manager | Bun (runtime, package manager, test runner, type checking) |
| Database | PostgreSQL 16 (drizzle-orm 0.45, schema managed via migrations) |
| Cache | Redis (ioredis 6) — translation cache + rate limiting |
| Comment Moderation | Shared decision module `src/lib/comment-moderation.ts` (`resolveCommentStatus`: banned → rejected, spam-flagged → pending, trusted bypass → approved) built on blocklist heuristics; persisted `spamSignals` field on comments (migration `20261009_195737_add_spam_signals_to_comments`); admin dashboard moderation widget backed by lean `src/lib/moderation-summary.ts` + admin-only `src/app/actions/moderation.ts` (added 2026-10-10) |
| Styling | Tailwind CSS 4 (latest), shadcn/ui + Radix (latest), tw-animate-css, sonner (toasts, added 2026-10-08) |
| Media | Cloudflare R2 (S3 adapter, latest), sharp (blurDataURL, resized variants); public covers served straight from the R2 bucket domain via `src/lib/media-url.ts` + `NEXT_PUBLIC_R2_PUBLIC_URL` (added 2026-10-09), admin uploads still proxy through `/api/media/file` |
| Translation | Google Cloud Translation API v10 |
| Monitoring | Sentry 11 (`withSentryConfig` from `@sentry/nextjs/config`, `dataCollection` replaces `sendDefaultPii`), Umami analytics |
| Validation | Zod 4.6 |
| Testing | Bun test (unit), Playwright (e2e, chromium) |
| Lint/Format | Biome 2.5 (migrated from ESLint), husky pre-commit (bun check + biome + bun test) |
| Deploy | Docker (bun alpine, standalone, non-root) → Docker Hub → Coolify (GitHub Actions); boot warm-up via `src/instrumentation.ts` → `src/lib/warm-up.ts` (ISR pages warmed on start, added 2026-10-08) |
