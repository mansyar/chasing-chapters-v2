# Implementation Plan: Lighthouse Production Fixes

**Track ID:** lighthouse_prod_fixes_20261008
**Branch:** fix/lighthouse-prod-scores
**Spec:** [spec.md](./spec.md)

## Phase 1: Code Fixes (A11y, CSP, CLS)

- [x] Task: Add accessible names to carousel prev/next buttons (`aria-label`s in `src/components/ModernBookCarousel.tsx`) — pure UI change, verified via lint/e2e + axe re-check `[808afd5]`
- [ ] Task: Add `https://static.cloudflareinsights.com` to production `script-src` in `next.config.ts` (comment documenting why; dev/test CSP untouched)
- [ ] Task: Diagnose and fix the hero-carousel CLS shift (inspect `FeaturedHero`/`ModernBookCarousel` swap path — reserve height / stable layout across skeleton→carousel→slide transitions); verify no layout shift in the hero container via Lighthouse or manual trace
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: TTFB Investigation & Mitigation

- [ ] Task: Investigate cold root-document TTFB — isolate ISR cache miss vs. container cold start vs. DB/edge latency (curl timing on production + staged local checks); document findings with evidence in the tracker
- [ ] Task: Implement smallest proven mitigation (candidate: post-deploy warm-up of key ISR pages wired into the deploy workflow or Coolify hook; if the script is logic-bearing → TDD with unit tests first)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Verification & Documentation

- [ ] Task: Full local gates (typecheck, lint, bun test, Playwright e2e)
- [ ] Task: Record production Lighthouse re-run + TTFB comparison in `docs/pagespeed-optimization.md` Progress History
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
