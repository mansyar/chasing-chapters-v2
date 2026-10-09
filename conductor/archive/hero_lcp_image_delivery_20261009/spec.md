# Specification: Hero LCP & Image Delivery Optimization

- **Track ID:** `hero_lcp_image_delivery_20261009`
- **Type:** Fix (performance)
- **Branch:** `perf/hero-lcp`
- **Status:** new

## Overview

Follow-up to `lighthouse_prod_fixes_20261008`. That track's production re-run confirmed all four of its defects are fixed — Accessibility 94 → 100, Best Practices 92 → 96, CLS 0.116 → 0, root-document TTFB 3.5s → 230ms — but the Performance score did not move (71 → 71), because none of those defects is the LCP bottleneck.

The production LCP element is the hero book cover, and `lcp-discovery-insight` reports `requestDiscoverable: false`: the image is **not present in the initial HTML**. `FeaturedHero` loads `ModernBookCarousel` through `next/dynamic` with `ssr: false`, so on a multi-featured-review site the server ships only the skeleton and the cover appears only once the client bundle mounts. That single fact costs 1041ms of resource load delay out of a 3.0s LCP:

| LCP subpart | Duration |
| ----------- | -------- |
| Time to first byte | 1070ms |
| **Resource load delay** | **1041ms** |
| Resource load duration | 226ms |
| Element render delay | 358ms |

A secondary cost sits in image delivery: `images.minimumCacheTTL` is 60 seconds, so the optimizer re-optimizes constantly, and each cache miss loops back through the app itself via Payload's local media API (`/_next/image?url=/api/media/file/...` measured at 1198ms). Cover art is not served from R2.

Image delivery was explicitly out of scope for the previous track, which is why this is a separate track rather than a regression.

## Functional Requirements

- **FR1 — Hero renders on the server.** Remove `ssr: false` from the dynamic carousel import in `src/components/FeaturedHero.tsx`, so the first slide and its cover `<img>` (already marked `priority` / `fetchPriority="high"` with `sizes`) are present in the initial HTML response and discoverable without executing JavaScript.
- **FR2 — Carousel behaviour is unchanged.** 5s auto-advance, pause on hover/focus, indicators, arrow navigation with accessible names, dark mode, and the mobile layout must all behave exactly as today.
- **FR3 — Reserved hero height is preserved.** The `h-full` container and skeleton height reservation from the previous track must remain, so CLS stays at 0 after the swap from skeleton to server-rendered carousel.
- **FR4 — Stop optimizer cache churn.** Raise `images.minimumCacheTTL` from 60s to 86400s (24h) in `next.config.ts`, with a comment recording why this is safe: Payload generates a new filename/URL per upload, so a replaced cover is a new cache key rather than a stale hit.
- **FR5 — Above-the-fold covers are correctly prioritised.** Audit every `next/image` usage in an above-the-fold slot — homepage hero, homepage latest reviews and reading lists, `/reviews`, `/reading-lists`, review detail — and ensure each has an accurate `sizes` and `priority`/`fetchPriority` where it can be the LCP candidate. Fix genuine gaps; do not churn code that is already correct.
- **FR6 — Measurements are recorded.** Local pre/post evidence and the post-deploy production Lighthouse comparison are recorded in `docs/pagespeed-optimization.md`, following the format already established there.

## Non-Functional Requirements

- **No CLS regression:** CLS must remain 0 (< 0.1 acceptance target) on the homepage.
- **No accessibility regression:** Accessibility must stay ≥ 95; the carousel's arrow accessible names must survive.
- **No new dependencies.**
- **Bundle discipline:** removing `ssr: false` moves the carousel into the initial client bundle. The delta must be measured and recorded; it is expected to be a few KB gzip against ~1.5MB gzip total.
- **Gates green:** `bun run typecheck`, `bun run lint`, `bun test`, and Playwright e2e must all pass. Unit tests are required only for logic-bearing code; this track is predominantly configuration and JSX, which is exempt per Workflow Principle 4.
- **Dark mode and mobile unaffected.**

## Acceptance Criteria

1. `lcp-discovery-insight.requestDiscoverable` is `true` in the production Lighthouse audit.
2. LCP resource load delay is < 300ms (from 1041ms).
3. Production desktop Lighthouse: **LCP ≤ 2.0s** (from 3.0s) and **Performance ≥ 85** (from 71), with Accessibility ≥ 95, Best Practices ≥ 95, CLS < 0.1.
4. Local pre/post measurement of the same LCP subparts, produced against a real production build, is recorded as evidence before merge.
5. Carousel UX confirmed unchanged by manual verification (auto-advance, hover/focus pause, arrows, indicators, keyboard).
6. Client JS delta recorded and accepted.
7. All local gates green, and the post-deploy production numbers recorded in `docs/pagespeed-optimization.md`.

## Out of Scope

- The 413ms `redirects` figure Lighthouse reported. `curl -I https://chasing-chapters.com/` returns `200 OK` with no `Location` header and `num_redirects=0`, so this is most likely a headless-Challenge or measurement artifact. Re-measure from PageSpeed Insights or a headed browser before acting on it.
- The five `ssr: false` dynamic imports in `src/components/layout/Navbar.tsx`.
- Moving cover storage from Payload's local media API to R2. FR4 is the cheap immediate win; R2 is a durable follow-up to be decided from the post-change measurements.
- Bundle trimming and legacy JS removal (covered by the Performance & Polish track).
- CSP nonce / `strict-dynamic`, i18n routing.

## Risks

- **Initial bundle growth** from server-rendering the carousel. Accepted in exchange for ~1s of LCP; measured and recorded.
- **Stale optimized images** if a cover were replaced in place at the same URL. Low risk — Payload filenames are content-derived and change per upload — and the reasoning is documented at the config change.
- **Duplicate preload hints:** Next emits a preload link automatically for `priority` images, so the server-rendered hero should produce exactly one. Verified during FR1.