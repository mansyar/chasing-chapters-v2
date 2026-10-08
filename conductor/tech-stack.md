# Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4 (stable) App Router, standalone build (webpack) |
| CMS | Payload CMS 3.90 (local API, Postgres adapter, drafts/versions, localization en/id) |
| Language | TypeScript 7 (`bun check` — Bun-native type checker, TS7 behavior) |
| Runtime/Package Manager | Bun (runtime, package manager, test runner, type checking) |
| Database | PostgreSQL 16 (drizzle-orm 0.45, schema managed via migrations) |
| Cache | Redis (ioredis 6) — translation cache + rate limiting |
| Styling | Tailwind CSS 4 (latest), shadcn/ui + Radix (latest), tw-animate-css, sonner (toasts, added 2026-10-08) |
| Media | Cloudflare R2 (S3 adapter, latest), sharp (blurDataURL, resized variants) |
| Translation | Google Cloud Translation API v10 |
| Monitoring | Sentry 11 (`withSentryConfig` from `@sentry/nextjs/config`, `dataCollection` replaces `sendDefaultPii`), Umami analytics |
| Validation | Zod 4.6 |
| Testing | Bun test (unit), Playwright (e2e, chromium) |
| Lint/Format | Biome 2.5 (migrated from ESLint), husky pre-commit (bun check + biome + bun test) |
| Deploy | Docker (bun alpine, standalone, non-root) → Docker Hub → Coolify (GitHub Actions); boot warm-up via `src/instrumentation.ts` → `src/lib/warm-up.ts` (ISR pages warmed on start, added 2026-10-08) |
