# Implementation Plan: R2-Direct Image Delivery

Branch: `perf/r2-images` · Spec: `./spec.md` · Workflow: `conductor/workflow.md`

> Lessons carried from the two prior performance tracks: throwaway `.ts` probe scripts at the project root are type-checked by `next build` (cast `any` + `biome-ignore` or delete before committing); a standalone server running on :3000 locks sharp's DLL, so kill the listener before rebuilding; ISR takes ~60s+ to observe doc changes; probe reviews must be created `_status: "published"` with a distinct real cover, and deleted in FK-safe order (comments → review → media).

## Phase 1: R2 Evidence & Local Baseline

- [ ] Task: Verify the R2 object key layout against a real object — read-only S3 `ListObjectsV2`/`HeadObject` using the existing env credentials, then `GET https://storage.chasing-chapters.com/<key>` and record the HTTP status + content-length as evidence. If the key layout includes composite prefixes (e.g. `media/<filename>`), the mapping util must reproduce it exactly.
- [ ] Task: Capture the local pre-fix baseline — create a throwaway published featured review with a distinct real cover (the probe-review pattern), run a production build + standalone server, and measure with a throwaway Playwright probe: hero image `currentSrc`, `loadDuration`, warm LCP, CLS, plus an SSR-HTML audit counting `/api/media/file/` occurrences. Record numbers in the plan.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Mapping Util (TDD) & Wiring

- [ ] Task: Write failing unit tests for the URL-mapping util (`src/lib/media-url.ts`): maps `/api/media/file/<filename>` → `<NEXT_PUBLIC_R2_PUBLIC_URL>/<key>` with the env set (including sized-variant filenames like `thumbnail-400x300.jpg`, `card-768x1024.jpg`); passes URLs through unchanged when the env is unset; passes absolute URLs and non-media paths through unchanged in both modes. Confirm red.
- [ ] Task: Implement the util to green. It must never throw and must fall back to the original URL when the input is not a mappable media path.
- [ ] Task: Wire the util into every image component that renders media (grep-audit `src` for `/api/media` and `coverImage.url`-style sources first; hero carousel, SingleReviewHero, ReviewCard, ReadingListCard, review detail, about, reading-lists). UI-only; exempt from unit tests per Workflow Principle 4.
- [ ] Task: Add `NEXT_PUBLIC_R2_PUBLIC_URL` to `.env` (dev), `images.remotePatterns`, and `img-src` in the CSP (public header; admin header if admin previews covers), each with a documenting comment.
- [ ] Task: Pass `NEXT_PUBLIC_R2_PUBLIC_URL` through the Docker build — `ARG`/`ENV` in the builder stage of the `Dockerfile` next to the existing R2 build args, and the corresponding env in `deploy.yml`'s build job (build-time inlining, not runtime).
- [ ] Task: Re-measure with the probe on a fresh production build — SSR HTML now shows `storage.chasing-chapters.com` URLs and zero `/api/media/file/` references on public pages; hero image load duration and warm LCP compared against the Phase 1 baseline; CLS still 0.
- [ ] Task: Manually verify every media-backed surface renders (homepage incl. carousel + latest cards, /reviews, /reading-lists, a review detail, a reading-list detail, /about, and one admin thumbnail) with no console errors or broken images.
- [ ] Task: Delete throwaway probe scripts and the probe review/cover/comment in FK-safe order; verify local DB back to the fixture review.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Verification & Documentation

- [ ] Task: Full local gates — `bun run typecheck`, `bun run lint` (no new warnings), `bun test`, Playwright e2e (`--workers=1` caveat per tracker).
- [ ] Task: Record the local pre/post numbers (image load duration, warm LCP, CLS, SSR URL audit) and the pending post-deploy targets in `docs/pagespeed-optimization.md` Progress History, following the established pattern.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Notes

- Post-deploy Lighthouse verification (acceptance criterion 3) happens after merge via a follow-up docs-only PR — the pattern used at the end of `lighthouse_prod_fixes_20261008` and `hero_lcp_image_delivery_20261009`.
- The plugin's own URL generation (`@payloadcms/storage-s3` `generateURL`) emits the private S3 endpoint; do not attempt a config-only fix via `disablePayloadProxy`.
