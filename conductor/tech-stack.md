# Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (canary) App Router, standalone build (webpack) |
| CMS | Payload CMS 3.72 (local API, Postgres adapter, drafts/versions, localization en/id) |
| Language | TypeScript (strict) |
| Runtime/Package Manager | Bun |
| Database | PostgreSQL 16 (drizzle-orm) |
| Cache | Redis (ioredis) — translation cache + rate limiting |
| Styling | Tailwind CSS 4, shadcn/ui + Radix, tw-animate-css |
| Media | Cloudflare R2 (S3 adapter), sharp (blurDataURL, resized variants) |
| Translation | Google Cloud Translation API |
| Monitoring | Sentry, Umami analytics |
| Validation | Zod (env + server action inputs) |
| Testing | Bun test (unit), Playwright (e2e, chromium) |
| Lint/Format | ESLint 9 (eslint-config-next), husky pre-commit (typecheck+lint+test) |
| Deploy | Docker (bun alpine, standalone, non-root) → Docker Hub → Coolify (GitHub Actions) |
