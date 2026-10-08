# Specification: Performance & Polish (performance_polish_20261008)

## Overview

Finalize and extend the PageSpeed optimization effort (desktop 61 → 90+,
tracked in `docs/pagespeed-optimization.md`) by completing the remaining
Phase 3 work (retiring `react-pageflip`), executing Phase 4, and adding
polish features: dynamic OG images, an accessibility pass, a toast system,
reusable empty states, and locale-aware date formatting.

This is a **Refactor/Chore-hybrid** track: optimization of existing code plus
small additive UX features.

Context discovered during planning:

- Phase 3 was partially completed on 2026-01-20: `ModernBookCarousel`
  (CSS Scroll Snap) exists behind `NEXT_PUBLIC_MODERN_CAROUSEL`, the Navbar
  Sheet is lazy-loaded, and `motion` was already replaced with CSS animations
  in `GradientBackground.tsx` and removed from `package.json`.
- `RealisticBookCarousel.tsx` (~450 lines) still dynamic-imports
  `react-pageflip`, which remains a dependency. `FeaturedHero.tsx` gates the
  two carousels behind the feature flag.
- Phase 4 items (content-visibility, resource hints, will-change, CSS
  delivery) remain pending in the tracker doc.

## Functional Requirements

### A. Carousel Finalization (Phase 3 completion)

1. Remove `RealisticBookCarousel` and the `react-pageflip` dependency from
   `package.json`.
2. Remove the `NEXT_PUBLIC_MODERN_CAROUSEL` feature flag from
   `FeaturedHero.tsx` — the CSS Scroll Snap `ModernBookCarousel` becomes the
   only carousel.
3. Preserve current behavior: auto-advance (5s), skeleton fallback during
   load, no CLS regression, dark mode support.

### B. Phase 4 Advanced Optimizations (per docs/pagespeed-optimization.md)

4. `content-visibility: auto` on below-fold sections (comments, related
   reviews).
5. Resource hints (`preconnect` / `dns-prefetch`) for R2/CDN origins.
6. Judicious `will-change` for animated elements; review CSS delivery.
7. Update `docs/pagespeed-optimization.md` tracker with results.

### C. Dynamic OG Images

8. `ImageResponse`-based OG image generation for `/reviews/[slug]` and
   `/reading-lists/[slug]` (title, book author, rating, site branding;
   reading-list title + cover).
9. Static `/og-image.jpg` remains the fallback for all other routes.
10. Works with dark/light-appropriate styling; respects `metadataBase`.

### D. Accessibility Pass

11. Skip-to-content link on the public layout.
12. `aria-live` regions for async form states (comment submit, comment
    report, share copy).
13. `aria-describedby` linking comment form errors to inputs.
14. Audit interactive components for keyboard/focus behavior (no functional
    redesign).

### E. Toast System

15. Introduce a toast component (sonner, per shadcn convention) with theme
    support.
16. Replace ad-hoc `setTimeout` inline messages in `CommentForm`,
    `CommentList`, `ShareButton` with toasts; keep existing copy and
    languages.

### F. Empty States & Dates

17. Reusable `EmptyState` component; apply to `/reviews` (no search/filter
    results), `/reading-lists`, homepage fallbacks.
18. Date formatting utility that respects the active locale (`?locale=id` →
    Indonesian formatting) for reading dates, publish dates, comment
    timestamps.

## Non-Functional Requirements

- No CLS regression (< 0.1); ISR/revalidation behavior unchanged; public
  bundle reduced vs. current baseline (measurable via build output /
  `bun run analyze`).
- Unit tests for new logic-bearing code (OG image prop-builder, date
  formatting util); UI components exempt per workflow Principle 4.
- Must remain mobile-responsive; e2e suite stays green.

## Acceptance Criteria

- [ ] `react-pageflip` gone from dependencies and bundle; only one carousel
      code path remains.
- [ ] Phase 4 items implemented and tracker doc updated with before/after
      metrics.
- [ ] Review & reading-list detail pages emit unique dynamic OG images; other
      routes keep static OG.
- [ ] Skip link, aria-live, aria-describedby in place; keyboard navigation
      intact.
- [ ] No ad-hoc inline transient messages remain; toasts render in both
      themes.
- [ ] All dates visible to readers respect the selected locale.
- [ ] `bun run typecheck`, `bun run lint`, `bun test`, and Playwright e2e
      pass.

## Out of Scope

- Search improvements / full-text search, genre/tag/mood browse pages, i18n
  route segments, email/notifications, comment threading, secrets hygiene
  (candidate for a future ops track), replacing the pagespeed tooling.
