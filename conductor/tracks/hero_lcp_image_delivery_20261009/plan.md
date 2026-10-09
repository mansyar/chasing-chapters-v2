# Implementation Plan: Hero LCP & Image Delivery Optimization

- **Track ID:** `hero_lcp_image_delivery_20261009`
- **Spec:** [`spec.md`](./spec.md)
- **Branch:** `perf/hero-lcp`

## Phase 1: Baseline & Hero SSR [checkpoint: aa95d33]

The measurement problem is that the local database holds only one published featured review, so the homepage renders `SingleReviewHero` (already server-rendered) and the carousel path — the thing under test — never executes locally. The baseline has to be captured on the carousel path, which means a temporary second featured review.

- [x] Task: Create a throwaway second featured review so the local carousel path renders — `LCP Probe Review` (id 5), with a distinct 91KB cover (`lcp-probe-cover` media, id 5) so the hero image is large enough to be the LCP element and has its own URL; the shared fixture cover decoded to 70 bytes and its preload hint masked the hero's discovery delay
- [x] Task: Capture the local baseline: LCP subparts and CLS against a real production build, using a throwaway Playwright probe — pre-fix resourceLoadDelay **715ms**, warm LCP **1404ms**, CLS 0
- [x] Task: Remove `ssr: false` from the `ModernBookCarousel` dynamic import in `src/components/FeaturedHero.tsx` (UI/config change — exempt from unit tests per Workflow Principle 4) — `[aa95d33]`
- [x] Task: Verify the hero cover is now in the server response — carousel region present in SSR HTML, hero `<img fetchpriority="high">` present, img tags 2 → 4, image preload links 1 → 2 (one per priority image, no duplicate)
- [x] Task: Re-measure LCP subparts and CLS on the same setup — resourceLoadDelay **715ms → 9ms**, warm LCP **1404ms → 352ms**, CLS **0 → 0**
- [x] Task: Delete all throwaway probe scripts before committing — any root-level `.ts` file is type-checked by `next build` and will fail the build. The temporary review and its cover stay in the local DB until the checkpoint, so the carousel path can be verified manually, and are removed in Phase 3
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Image Delivery [checkpoint: ad9ff77]

- [x] Task: Audit every above-the-fold `next/image` usage for `sizes` and `priority`/`fetchPriority` correctness — **two genuine gaps found and fixed**: `/reviews` and `/reading-lists/[slug]` passed no `priority` to their card grids, leaving above-the-fold covers lazy; both now use `priority={index < 2}`. Already correct and deliberately untouched: homepage hero/cards, `SingleReviewHero`, review detail hero, about page, reading-lists page
- [x] Task: Raise `images.minimumCacheTTL` from 60 to 86400 in `next.config.ts`, with a comment recording why this is safe — verified in the response header (`max-age=86400`, previously `max-age=60`); the churn it removes was measured at 2.65s cold optimize vs 0.22s repeat for a single cover — `[ad9ff77]`
- [x] Task: Confirm no duplicate-preload or image-loading regression after the config change — homepage re-checked in the SSR HTML (carousel region present, slide 0 `fetchpriority=high`, slide 1 lazy, both cards eager); `/reviews` shows 2 preload links for 2 priority images
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Verification & Documentation [checkpoint: 47e0c09]

- [x] Task: Full local gates — `bun run typecheck` (160 files clean), `bun run lint` (67 pre-existing warnings), `bun test` (205 pass / 0 fail across 16 files), Playwright **33/33** with `--workers=1`; the machine-local parallel `page.goto` flake did not recur
- [x] Task: Record the pre/post LCP subparts, CLS, and the client JS bundle delta in `docs/pagespeed-optimization.md` Progress History, alongside the caveat that the production Lighthouse re-run is deferred until after deploy — `[47e0c09]` (bundle cost came out at **−7 bytes** across the same 21 initial scripts, so SSR-ing the carousel cost nothing measurable)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — user-confirmed; verification report attached as a git note to `47e0c09`

## Notes

- Production Lighthouse verification (LCP ≤ 2.0s, Performance ≥ 85) happens after merge and deploy, and is recorded by a follow-up docs-only PR — the same pattern used at the end of `lighthouse_prod_fixes_20261008`.
- Thrown away after measurement: the second-featured-review script, the LCP/CLS probe, and the temporary local review itself. Cleanup order mattered — the e2e run left a comment on the probe review that blocks its deletion with a FK violation, so the comment goes first, then the review, then its cover media. Local DB verified back to the single fixture review.