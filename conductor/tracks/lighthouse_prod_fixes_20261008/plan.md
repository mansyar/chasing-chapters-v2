# Implementation Plan: Lighthouse Production Fixes

**Track ID:** lighthouse_prod_fixes_20261008
**Branch:** fix/lighthouse-prod-scores
**Spec:** [spec.md](./spec.md)

## Phase 1: Code Fixes (A11y, CSP, CLS) `[checkpoint: df72a7a]`

- [x] Task: Add accessible names to carousel prev/next buttons (`aria-label`s in `src/components/ModernBookCarousel.tsx`) — pure UI change, verified via lint/e2e + axe re-check `[808afd5]`
- [x] Task: Add `https://static.cloudflareinsights.com` to production `script-src` in `next.config.ts` (comment documenting why; dev/test CSP untouched) `[64e7ed9]`
- [x] Task: Diagnose and fix the hero-carousel CLS shift (inspect `FeaturedHero`/`ModernBookCarousel` swap path — reserve height / stable layout across skeleton→carousel→slide transitions) `[df72a7a]`; verify no layout shift in the hero container via Lighthouse or manual trace
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: TTFB Investigation & Mitigation [checkpoint: fea512d]

- [x] Task: Investigate cold root-document TTFB — isolate ISR cache miss vs. container cold start vs. DB/edge latency (curl timing on production + staged local checks); document findings with evidence in the tracker `[5947ead]`
- [x] Task: Implement smallest proven mitigation (candidate: post-deploy warm-up of key ISR pages wired into the deploy workflow or Coolify hook; if the script is logic-bearing → TDD with unit tests first) `[fea512d]`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Verification & Documentation [checkpoint: b7a5842]

- [x] Task: Full local gates (typecheck, lint, bun test, Playwright e2e) — typecheck 160 files clean, lint 67 pre-existing warnings, `bun test` 203 pass / 0 fail, Playwright 33/33 (serial; default parallel run flakes on this machine with `page.goto` 30s timeouts, pre-existing/environmental)
- [x] Task: Record production Lighthouse re-run + TTFB comparison in `docs/pagespeed-optimization.md` Progress History — local pre/post-fix table recorded in `[b7a5842]`; canonical production re-run pending deploy of this branch
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
