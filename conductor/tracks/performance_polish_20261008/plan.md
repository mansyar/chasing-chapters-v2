# Implementation Plan: performance_polish_20261008

> Follows `conductor/workflow.md`: TDD for logic-bearing code, status markers
> (`[ ]` pending, `[~]` in progress, `[x]` complete), phase checkpoints with
> verification protocol.

## Phase 1: Carousel Finalization (Phase 3 Completion) [checkpoint: ae209aa]

- [x] Task: Record bundle baseline
  - [ ] Run `bun run build` and record first-load JS for `/` (and `bun run analyze` route breakdown) as the before-metric in `docs/pagespeed-optimization.md`
- [x] Task: Remove legacy carousel and feature flag
  - [ ] Delete `src/components/RealisticBookCarousel.tsx` and remove `react-pageflip` from `package.json` + lockfile
  - [ ] Remove the `NEXT_PUBLIC_MODERN_CAROUSEL` gate in `src/components/FeaturedHero.tsx` — `ModernBookCarousel` becomes the only carousel
  - [ ] Remove `.env.example` / docs references to the flag
  - [ ] Verify homepage e2e (`e2e/homepage.spec.ts`) still passes
- [x] Task: Record bundle delta
  - [ ] Re-run build; record after-metric (KiB saved) in the tracker doc
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Dynamic OG Images [checkpoint: bb8dcb8]

- [x] Task: Write failing tests (Red)
  - [x] `src/lib/__tests__/og-image.test.ts` — pure builder for OG image props (title/author/rating truncation, rating star rendering, list title + count, fallback defaults)
- [x] Task: Implement (Green)
  - [x] `src/lib/og-image.ts` — pure prop-builder logic
  - [x] `opengraph-image.tsx` (`ImageResponse`) for `reviews/[slug]` and `reading-lists/[slug]`
  - [x] Static `/og-image.jpg` remains fallback for all other routes
- [x] Task: Verify OG tags render on detail pages (metadata inspection + e2e smoke)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Advanced Optimizations (Phase 4) [checkpoint: 4fe17a4]

- [x] Task: `content-visibility: auto` on below-fold sections (comments, related reviews)
- [x] Task: Resource hints (`preconnect` / `dns-prefetch`) for R2/CDN origins in root layout
- [x] Task: `will-change` for continuously animated elements (marquee, gradient); review CSS delivery
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Accessibility Pass [checkpoint: a51d6e8]

- [x] Task: Skip-to-content link in public layout (visible on focus)
- [x] Task: `aria-live="polite"` regions for async form feedback (comment submit, report form, share copy)
- [x] Task: `aria-describedby` linking comment form validation errors to inputs
- [x] Task: Keyboard/focus audit of interactive components (navbar sheet, carousels, like button)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 5: Toast System [checkpoint: 01d0f4d]

- [x] Task: Install & wire toast library (sonner, theme-aware `<Toaster />` in public layout)
- [x] Task: Replace `setTimeout` inline messages in `CommentForm.tsx`, `CommentList.tsx`, `ShareButton.tsx` with toasts (keep copy/behavior)
- [x] Task: Remove dead inline-message state/rendering
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 6: Empty States & Locale-Aware Dates [checkpoint: b9e5bb9]

- [x] Task: Write failing tests (Red)
  - [x] `src/lib/__tests__/date-format.test.ts` — locale-aware formatting util (en/id, invalid dates, date vs datetime)
- [x] Task: Implement (Green)
  - [x] `src/lib/date-format.ts` formatting util
  - [x] Apply to reading dates, publish dates, comment timestamps (respecting `?locale=id`)
- [x] Task: Reusable `EmptyState` component; apply to `/reviews` no-results, `/reading-lists`, homepage fallbacks
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 7: Final Verification & Documentation [checkpoint: 5590816]

- [x] Task: Full quality gates — `bun run typecheck && bun run lint && bun test` + Playwright e2e suite
- [x] Task: Update `docs/pagespeed-optimization.md` — mark Phase 3 fully complete, log Phase 4 results, record final metrics in Progress History
- [x] Task: Final bundle comparison summary (before/after first-load JS)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
