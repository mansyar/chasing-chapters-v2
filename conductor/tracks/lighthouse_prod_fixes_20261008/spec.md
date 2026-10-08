# Specification: Lighthouse Production Fixes

**Track ID:** lighthouse_prod_fixes_20261008
**Type:** Fix/Chore hybrid
**Branch:** fix/lighthouse-prod-scores

## Overview

Production Lighthouse 13.4.1 desktop (2026-10-08) scored Performance 71 / Best Practices 92 / Accessibility 94 / SEO 100, surfacing four concrete defects plus an unrecorded production baseline. This track fixes the code-level defects and lands one verified TTFB mitigation.

## Functional Requirements

- **A. A11y — carousel button names:** Prev/next chevron buttons in `ModernBookCarousel.tsx` get accessible names (`aria-label="Previous review"` / `"Next review"`). Fixes axe `button-name` (critical, 2 failing elements).
- **B. CSP — Cloudflare Insights:** Add `https://static.cloudflareinsights.com` to the production `script-src` in `next.config.ts` so the auto-injected RUM beacon is no longer blocked (removes console error + inspector-issues ding). Dev/test CSP untouched.
- **C. CLS — hero carousel shift:** Eliminate the 0.116 layout shift in the `FeaturedHero` container observed on production (the `ssr: false` carousel hydration/swap path). Target CLS < 0.1 on production. No regression of the 5s auto-advance or Phase 4 a11y behavior.
- **D. TTFB — investigate, then minimal fix:** Diagnose the 3.5s root-document TTFB (ISR cache miss on cold fetch vs. Coolify container cold start vs. DB latency), document findings with evidence, and implement the smallest proven mitigation (candidate: post-deploy warm-up of key ISR pages, or revalidate tuning). Do not weaken ISR correctness.

## Non-Functional Requirements

- Record the production Lighthouse baseline row in `docs/pagespeed-optimization.md` (with the PROTOCOL_TIMEOUT caveat noted).
- Unit tests only for logic-bearing code touched; no new dependencies unless required by the TTFB mitigation.
- Typecheck/lint/bun test/Playwright e2e gates stay green; dark mode and mobile unaffected.

## Acceptance Criteria

1. No `button-name` axe failures; production Accessibility ≥ 95.
2. No CSP console errors; production Best Practices ≥ 95.
3. Production CLS < 0.1.
4. TTFB root cause documented with evidence; mitigation deployed and cold-TTFB measurably improved (documented comparison).
5. Production Lighthouse re-run recorded in the tracker.

## Out of Scope

- Image-delivery / legacy-JS optimizations, non-composited animations (gradient, dots), i18n routing, further bundle trimming, CSP nonce/strict-dynamic hardening.
