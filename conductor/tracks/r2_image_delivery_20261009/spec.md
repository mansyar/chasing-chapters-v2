# Specification: R2-Direct Image Delivery

- **Track ID:** `r2_image_delivery_20261009`
- **Type:** Fix (performance)
- **Branch:** `perf/r2-images`
- **Status:** new
- **Created:** 2026-10-09

## Overview

Follow-up to `hero_lcp_image_delivery_20261009`. The post-deploy Lighthouse re-run confirmed the hero cover is now discoverable (`requestDiscoverable: true`, `fetchpriority=high` applied), yet LCP remains 2.8–3.0s and Performance 68–77 because the **image fetch itself** takes ~2.0s simulated load duration. The measured cause: every cover request is a double-hop — browser → `/_next/image` → the app's own `/api/media/file/<filename>` route → streams the object out of R2 → sharp optimizes. The app pays for its own bytes on every cache miss.

Payload already stores media in R2 via `@payloadcms/storage-s3` (`src/payload.config.ts`, bucket/endpoint from env). The bucket is publicly reachable at the custom domain **`storage.chasing-chapters.com`** (confirmed by the user). Rewiring delivery so `/_next/image` fetches covers straight from that domain removes the app from the image path.

**Constraint discovered during reconnaissance:** the plugin's `generateURL` emits `${endpoint}/${bucket}/${key}` — the *private* S3 API host — so the plugin cannot be configured alone to produce public URLs. The fix therefore maps URLs at the application layer.

## Functional Requirements

1. **FR1 — URL mapping util:** a small pure util (e.g. `src/lib/media-url.ts`) that maps a Payload media URL (`/api/media/file/<filename>`, including sized variants like `...-768x1024.jpg`) to its public R2 URL. The public base URL comes from the env: **`NEXT_PUBLIC_R2_PUBLIC_URL`** (the `NEXT_PUBLIC_` prefix is required because the carousel is a client component and consumes media URLs directly, so the value is inlined at build time). If the env is unset, the util passes URLs through unchanged — local dev keeps the `/api/media/file/` proxy with no configuration. The util must also pass through already-absolute URLs and non-media paths unchanged, and be covered by unit tests (both with the env set and unset).
2. **FR1b — Env plumbing:** add `NEXT_PUBLIC_R2_PUBLIC_URL` to `.env` (dev) and pass it through the Docker build like the existing R2 build args (`Dockerfile` ARG/ENV + `deploy.yml`), since `NEXT_PUBLIC_*` values are inlined at build time, not read at runtime.
2. **FR2 — Wire into image components:** all `next/image` sources that currently reference `/api/media/file/...` (hero carousel / SingleReviewHero, ReviewCard, ReadingListCard, review detail, about page, reading-lists, any remaining) use the mapped R2 URL.
3. **FR3 — Optimizer allow-list:** add `storage.chasing-chapters.com` to `next.config.ts` `images.remotePatterns`.
4. **FR4 — CSP:** add `https://storage.chasing-chapters.com` to `img-src` in the public CSP (and admin CSP if admin previews covers), with a documenting comment.
5. **FR5 — Key-layout verification:** before trusting the mapping, verify the actual R2 object key layout (prefix/composite prefixes from `buildStoragePathData`) against at least one real object so the mapped URL resolves; record the evidence.
6. **FR6 — No regression in upload/delete:** media upload and delete flows keep working (the storage plugin still writes to R2); admin thumbnails still render.

## Non-Functional Requirements

- No CLS regression (reserved hero height untouched); no a11y regression.
- No new runtime dependencies.
- All gates green: typecheck, lint (no new warnings), `bun test`, Playwright e2e (serial caveat documented in the tracker).
- Record local pre/post measurements and the post-deploy re-run in `docs/pagespeed-optimization.md`.
- Dark mode / mobile unaffected.

## Acceptance Criteria

1. Production SSR HTML references `https://storage.chasing-chapters.com/...` cover URLs; `/api/media/file/` no longer appears in any rendered `<img>`/`/_next/image` src on public pages.
2. Local A/B on a production build shows the hero image load duration materially reduced (the ~2s optimizer fetch chain gone; target: hero image load duration < 500ms from cache-miss state, measured by probe).
3. Post-deploy Lighthouse (desktop, 3-run window as before): **LCP ≤ 2.0s and Performance ≥ 85**, holding A11y ≥ 95, BP ≥ 95, CLS < 0.1. If not met, the residual bottleneck is documented with evidence before any further track is proposed.
4. Every media-backed image on public pages renders (manual verification list in the plan).
5. `bun test` covers the URL-mapping util (success + pass-through cases).

## Out of Scope

- Pre-sized srcsets from Payload's `feature`/`card` variants (possible follow-up; the optimizer fetch becomes cheap once off-app).
- Cloudflare Cache Rules for `/api/media/file/*` or `/_next/image`.
- Migrating existing media objects, renaming, or changing upload behaviour.
- The 413ms `redirects` measurement artifact; bundle trimming; CSP nonce/strict-dynamic; i18n routing.

## Risks & Assumptions

- **Assumption (user-confirmed):** `storage.chasing-chapters.com` is live and publicly readable. If the key layout differs from the assumed mapping, FR5 catches it before rollout.
- **Risk:** an object missing from R2 (uploaded before the s3Storage plugin was enabled) would 404 at its new URL — mitigated by FR5's evidence check and a render-time fallback to the original URL in the util when mapping is not applicable.
- **Risk:** admin/previews may rely on proxied URLs — admin CSP and upload flows verified separately (FR4/FR6).

## Two assumptions that could not be verified locally

1. The exact R2 object key layout (composite prefixes) — verified in Phase 1 (FR5).
2. That all current cover objects exist in R2 (they should, since uploads went through the plugin) — spot-checked in FR5.
