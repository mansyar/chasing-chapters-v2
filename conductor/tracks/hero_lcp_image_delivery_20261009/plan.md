# Implementation Plan: Hero LCP & Image Delivery Optimization

- **Track ID:** `hero_lcp_image_delivery_20261009`
- **Spec:** [`spec.md`](./spec.md)
- **Branch:** `perf/hero-lcp`

## Phase 1: Baseline & Hero SSR

The measurement problem is that the local database holds only one published featured review, so the homepage renders `SingleReviewHero` (already server-rendered) and the carousel path — the thing under test — never executes locally. The baseline has to be captured on the carousel path, which means a temporary second featured review.

- [ ] Task: Create a throwaway second featured review so the local carousel path renders (script must be deleted after measurement, and the review removed from the local DB)
- [ ] Task: Capture the local baseline: LCP subparts (TTFB / resource load delay / load duration / render delay) and CLS against a real production build, using a throwaway Playwright probe
- [ ] Task: Remove `ssr: false` from the `ModernBookCarousel` dynamic import in `src/components/FeaturedHero.tsx` (UI/config change — exempt from unit tests per Workflow Principle 4)
- [ ] Task: Verify the hero cover is now in the server response: curl the SSR HTML and confirm the cover `<img>` with `fetchpriority` is present, with exactly one preload hint (no duplicate from Next's automatic `priority` preload)
- [ ] Task: Re-measure LCP subparts and CLS on the same setup; confirm the resource load delay collapses and CLS remains 0 (reserved height preserved)
- [ ] Task: Delete all throwaway probe scripts and remove the temporary review from the local DB before committing — any root-level `.ts` file is type-checked by `next build` and will fail the build
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Image Delivery

- [ ] Task: Audit every above-the-fold `next/image` usage for `sizes` and `priority`/`fetchPriority` correctness — homepage hero, homepage latest reviews and reading lists, `/reviews`, `/reading-lists`, review detail — and fix only genuine gaps
- [ ] Task: Raise `images.minimumCacheTTL` from 60 to 86400 in `next.config.ts`, with a comment recording why this is safe (Payload generates a new filename per upload, so a replaced cover is a new cache key rather than a stale hit)
- [ ] Task: Confirm no duplicate-preload or image-loading regression in the dev/production console after the config change
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Verification & Documentation

- [ ] Task: Full local gates — `bun run typecheck`, `bun run lint`, `bun test`, Playwright e2e
- [ ] Task: Record the pre/post LCP subparts, CLS, and the client JS bundle delta in `docs/pagespeed-optimization.md` Progress History, alongside the caveat that the production Lighthouse re-run is deferred until after deploy
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Notes

- Production Lighthouse verification (LCP ≤ 2.0s, Performance ≥ 85) happens after merge and deploy, and is recorded by a follow-up docs-only PR — the same pattern used at the end of `lighthouse_prod_fixes_20261008`.
- Thrown away after measurement: the second-featured-review script, the LCP/CLS probe, and the temporary local review itself.