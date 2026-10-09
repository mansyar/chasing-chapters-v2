# PageSpeed Optimization Tracker

> **Goal**: Improve desktop PageSpeed score from **61** to **90+**
>
> **Started**: 2026-01-19
> **Last Updated**: 2026-01-19

---

## 📊 Baseline Metrics (Desktop)

| Metric                         | Current | Target  | Status               |
| ------------------------------ | ------- | ------- | -------------------- |
| **Performance Score**          | 61      | 90+     | 🔴 Needs Work        |
| First Contentful Paint (FCP)   | 0.6s    | < 1.8s  | ✅ Good              |
| Largest Contentful Paint (LCP) | 1.3s    | < 2.5s  | 🟡 Needs Improvement |
| Total Blocking Time (TBT)      | 90ms    | < 200ms | ✅ Good              |
| Cumulative Layout Shift (CLS)  | 1.862   | < 0.1   | 🔴 Poor              |
| Speed Index                    | 5.3s    | < 3.4s  | 🔴 Poor              |

---

## 🎯 Identified Issues

### Critical (Must Fix)

- [ ] **CLS 1.862** - Extremely high layout shift
  - Cause: Dynamic hero content, lazy-loaded carousel, images without dimensions
  - Impact: Major user experience degradation

- [ ] **Speed Index 5.3s** - Visual content loads slowly
  - Cause: Heavy client-side JavaScript, complex animations on initial load
  - Impact: Poor perceived performance

### High Priority

- [ ] **Unused JavaScript (147 KiB)**
  - Files: react-pageflip, motion library, Radix UI components
  - Potential savings: 147 KiB

- [ ] **JavaScript Execution Time (1.5s)**
  - Reduce main thread work

- [ ] **Main Thread Work (6.4s)**
  - Minimize blocking operations

### Medium Priority

- [ ] **Render-blocking Resources (160ms potential savings)**
  - Review CSS and JS loading order

- [ ] **Image Optimization (18 KiB potential savings)**
  - Further optimize images

- [ ] **Legacy JavaScript (24 KiB potential savings)**
  - Modernize JS bundle

---

## 📋 Implementation Plan

### Phase 1: Fix CLS (Priority 1) 🔴

Target: Reduce CLS from 1.862 to < 0.1

| Task | Description                                     | Status  | Impact |
| ---- | ----------------------------------------------- | ------- | ------ |
| 1.1  | Add explicit dimensions to hero image container | ✅ Done | High   |
| 1.2  | Reserve space for FeaturedHero with skeleton    | ✅ Done | High   |
| 1.3  | Add font preload hints in layout                | ✅ Done | Medium |
| 1.4  | Fix GenreMarquee height reservation             | ✅ Done | Medium |
| 1.5  | Add `aspect-ratio` to all card images           | ✅ Done | Medium |

### Phase 2: Improve LCP & Speed Index (Priority 2) ✅

Target: LCP < 1.0s, Speed Index < 3.0s

| Task | Description                                        | Status        | Impact |
| ---- | -------------------------------------------------- | ------------- | ------ |
| 2.1  | Preload LCP image (hero cover image)               | ⚠️ Reverted   | High   |
| 2.2  | Defer carousel loading until after LCP             | ✅ Simplified | High   |
| 2.3  | Reduce motion animations on initial render         | ✅ Done       | Medium |
| 2.4  | Add `loading="eager"` hint to hero image           | ✅ Done       | Medium |
| 2.5  | Defer carousel animation via `requestIdleCallback` | ⚠️ Reverted   | Medium |

> **Note**: Tasks 2.1 and 2.5 caused UX issues (blocking render, empty hero, jarring swap) and were reverted in favor of a simpler loading skeleton approach.

### Phase 3: Reduce JavaScript Bundle (Priority 3) 🟡

Target: Reduce unused JS by 100+ KiB

| Task | Description                                         | Status     | Impact |
| ---- | --------------------------------------------------- | ---------- | ------ |
| 3.1  | Evaluate replacing react-pageflip with CSS solution | ✅ Done    | High   |
| 3.2  | Tree-shake motion library imports                   | ⬜ Pending | Medium |
| 3.3  | Lazy load Sheet/Dialog components                   | ⬜ Pending | Medium |
| 3.4  | Review bundle analyzer output                       | ⬜ Pending | Low    |

### Phase 4: Advanced Optimizations (Priority 4) ✅

| Task | Description                                            | Status     | Impact |
| ---- | ------------------------------------------------------ | ---------- | ------ |
| 4.1  | Add `content-visibility: auto` for off-screen sections | ✅ Done    | Medium |
| 4.2  | Implement resource hints (preconnect, prefetch)        | ✅ Done    | Medium |
| 4.3  | Add `will-change` CSS for animated elements            | ✅ Done    | Low    |
| 4.4  | Review and optimize CSS delivery                       | ✅ Done    | Low    |

Phase 4 completion notes (2026-10-08): 4.1 — `[content-visibility:auto]` + `contain-intrinsic-size` applied to below-fold Related Reviews and Comments sections on review detail pages. 4.2 — `preconnect` + `dns-prefetch` added to the public layout head for the Umami analytics origin (only genuine cross-origin resource: media streams same-origin via `/api/media/file/*` and fonts are self-hosted by `next/font`, so no other hints needed). 4.3 — `will-change:transform` added to marquee animated children (transform animations composite); `GradientBackground` intentionally NOT given `will-change` because its `background-position` animation is paint-only (no compositing benefit, would only waste GPU memory). 4.4 — CSS delivery reviewed: Next 16 inlines/loads the single `globals.css` automatically with optimal ordering; no action required.

---

## 📝 Implementation Log

### 2026-01-19: Initial Assessment

- ✅ Analyzed PageSpeed Insights report
- ✅ Identified root causes for CLS and Speed Index issues
- ✅ Created optimization plan
- ✅ Implemented Phase 1 CLS fixes
- ✅ Implemented Phase 2 LCP & Speed Index optimizations
- 📋 Awaiting Phase 3 (JS Bundle Reduction)

### 2026-01-19: Phase 1 Completed

- Fixed CLS by adding `min-height` to hero and marquee
- Reduced animation initial opacity to prevent layout shifts
- Enabled `adjustFontFallback` in Next.js font configs

### 2026-01-19: Phase 2 Completed

**Approach tested and reverted:**

- ❌ `ReactDOM.preload` - blocked hero render
- ❌ `requestIdleCallback` - caused empty hero for 2-3s
- ❌ Static-to-carousel swap - jarring transition

**Final implementation:**

- ✅ Carousel loads via `next/dynamic` with skeleton fallback
- ✅ Unified `HeroSkeletonContent` for consistent loading states
- ✅ `suppressHydrationWarning` fixes theme hydration mismatch
- ✅ `SingleReviewHero` for single review display

### 2026-01-20: Skeleton Consolidation

- Extracted `HeroSkeletonContent` from `HeroSkeleton`
- Both `loading.tsx` and `FeaturedHero.tsx` now use same skeleton
- Follows DRY principles, ensures visual consistency

### 2026-01-20: Phase 3 Completed

- ✅ Implemented `ModernBookCarousel` with CSS Scroll Snap
- ✅ Added `NEXT_PUBLIC_MODERN_CAROUSEL` feature flag
- ✅ Lazy loaded Radix `Sheet` components in `Navbar.tsx`
- ✅ Replaced `motion` library with pure CSS animations in `GradientBackground.tsx`
- ✅ Fixed TypeScript errors in `FeaturedHero` and `HeroSkeleton`
- ✅ Verified with `bun run typecheck` and `bun run lint`

**Results:**

- Significant reduction in initial JS bundle by deferring `react-pageflip` (~50KB) and `motion` (~30KB).
- Deferring Radix components saves another ~25KB from the initial load.
- Modern Carousel provides a high-performance alternative for users who prefer a standard UI.

---

## 🔍 Technical Analysis

### CLS Root Causes

1. **FeaturedHero Component**
   - Uses `h-[calc(100vh-4rem)]` but content loads dynamically
   - Carousel (`RealisticBookCarousel`) loads via `dynamic()` with `ssr: false`
   - `motion` animations cause initial layout shifts

2. **Image Loading**
   - Images use `fill` prop without container aspect-ratio
   - Blur placeholders may not match final dimensions

3. **Font Loading**
   - Google Fonts (Inter, Playfair Display) load without preload hints
   - `font-display: swap` causes FOUT (Flash of Unstyled Text)

### Speed Index Root Causes

1. **Heavy Client JS**
   - `react-pageflip`: ~50KB gzipped
   - `motion`: ~30KB gzipped
   - Page hydration delays visual completeness

2. **Animation Delays**
   - Hero content has staggered animations (delays up to 0.8s)
   - Background gradient animation runs continuously

---

## 📂 Files to Modify

| File                                       | Changes                          | Phase |
| ------------------------------------------ | -------------------------------- | ----- |
| `src/app/(public)/layout.tsx`              | Add font preload, resource hints | 1, 2  |
| `src/components/FeaturedHero.tsx`          | Add skeleton, fix dimensions     | 1, 2  |
| `src/components/RealisticBookCarousel.tsx` | Defer loading, reduce animations | 2, 3  |
| `src/components/GenreMarquee.tsx`          | Reserve fixed height             | 1     |
| `src/components/ReviewCard.tsx`            | Ensure aspect-ratio on container | 1     |
| `src/components/ReadingListCard.tsx`       | Ensure aspect-ratio on container | 1     |
| `src/components/HeroSkeleton.tsx`          | Improve skeleton accuracy        | 1     |
| `next.config.ts`                           | Review optimization settings     | 3     |

---

## ✅ Verification Checklist

After each phase, verify:

- [ ] Run `bun run build` - Build succeeds
- [ ] Run `bun run lint` - No new lint errors
- [ ] Run `bun run typecheck` - No type errors
- [ ] Test locally with Lighthouse DevTools
- [ ] Re-run PageSpeed Insights on production

---

## 📈 Progress History

| Date       | Score | FCP  | LCP  | TBT  | CLS   | Speed Index | Notes    |
| ---------- | ----- | ---- | ---- | ---- | ----- | ----------- | -------- |
| 2026-01-19 | 61    | 0.6s | 1.3s | 90ms | 1.862 | 5.3s        | Baseline |
| 2026-10-08 | -     | -    | -    | -    | -     | -           | Phase 3 finalized: removed `RealisticBookCarousel` + `react-pageflip` dep + `NEXT_PUBLIC_MODERN_CAROUSEL` flag; only `ModernBookCarousel` (CSS Scroll Snap) remains. Client JS: 110 → 108 chunks, 1,504KB → 1,490KB gzip (−14KB gz / −54KB raw; pageflip was already lazy-loaded, so removal mainly eliminates the dead code path and dependency) |
| 2026-10-08 | 98    | 0.7s | 0.9s | 10ms | 0     | 1.3s        | Performance & Polish track complete (Lighthouse 13.4.1, desktop, local production standalone after the standalone asset-copy fix). Performance 61 → 98, CLS 1.862 → 0, Speed Index 5.3s → 1.3s, LCP 1.3s → 0.9s, TBT 90ms → 10ms. Accessibility 100, Best Practices 96, SEO 100. Caveat: measured on localhost with browser extensions injecting JS — re-run against the production URL for the canonical number. |
| 2026-10-08 | -     | -    | -    | -    | -     | -           | Performance & Polish track complete. Phase 4 done: `content-visibility:auto` on below-fold Related Reviews/Comments, Umami preconnect/dns-prefetch, `will-change:transform` on marquee. Final client JS: 111 chunks / 4,694KB raw / 1,503KB gzip — net flat vs 1,504KB baseline despite adding `sonner` (toast system) + date-fns `id` locale, because the removed pageflip/flag dead code offset them. Remaining wins are render-level (content-visibility, fewer reflows) and Lighthouse/PageSpeed numbers should be captured manually per the Verification Checklist. |
| 2026-10-08 | 71    | -    | -    | -    | 0.116 | -           | **Production Lighthouse 13.4.1 (desktop)**: Performance 71 / Best Practices 92 / Accessibility 94 / SEO 100. Defects: carousel prev/next buttons had no accessible names (axe `button-name`, critical); `static.cloudflareinsights.com` RUM beacon blocked by CSP (console error + inspector-issues ding); 0.116 CLS from the `ssr:false` hero-carousel skeleton→carousel swap; 3.5s cold root-document TTFB. (Run hit `PROTOCOL_TIMEOUT` for some audits; scores above are from the completed pass.) |

### TTFB investigation (2026-10-08, track `lighthouse_prod_fixes_20261008`)

Question: what caused the 3.5s cold root-document TTFB in the production Lighthouse run — ISR cache miss, container cold start, or DB/edge latency?

Evidence (production `https://chasing-chapters.com`, curl timing):

| Probe | TTFB | Notes |
| ----- | ---- | ----- |
| Homepage, 10 requests @6s spacing | 0.26–1.15s (warm ≈0.27s) | All `x-nextjs-cache: HIT`; first request 1.15s includes fresh TLS handshake |
| `/about` (static baseline) | 0.29s | Network + Cloudflare + proxy floor |
| `/reviews` (dynamic, full SSR + DB per request) | 0.31s / 0.49s / 0.87s | Full server render + DB queries is sub-second → **DB latency ruled out** |
| Homepage after 75s idle (> 60s revalidate window) | 0.30s | Still `HIT`; `Cache-Control: s-maxage=60, stale-while-revalidate=…` → **ISR expiry does not block** (stale-while-revalidate serves instantly) |
| Local standalone server cold boot | First 200 at **26.2s** after process start; first request TTFB **20.5s**; second request still **6.9s** | The Next.js + Payload boot happens on the first request, not before the listener binds |

Conclusion: the 3.5s cold TTFB matches Lighthouse landing in the window right after a container (re)start (deploy), where the first request absorbs the Next.js + Payload boot. It is not an ISR miss (SWR serves stale immediately, and the prerendered page ships with the build) and not DB latency (dynamic full render ≤0.9s TTFB).

Mitigation: self-warming at boot via `src/instrumentation.ts` → `src/lib/warm-up.ts` — once per server start (production, nodejs runtime), poll until the HTTP listener answers (that first poll absorbs the boot cost), then GET `/`, `/reviews`, `/reading-lists`, `/about` to warm ISR caches. Verified locally: after restart, warm-up logs show all four routes ok, and external TTFB is ~0.22s immediately afterwards.

| 2026-10-08 | 71    | 1.0s | 3.0s | 170ms | 0     | 2.7s        | **Lighthouse Production Fixes — production, post-deploy** (PR #5): Performance 71 (unchanged), Accessibility 94 → **100** ✅, Best Practices 92 → **96** ✅, SEO 100, CLS 0.116 → **0** ✅, root-document TTFB 3.5s cold → **230ms** ✅. Performance held at 71 because LCP (3.0s) is an unrelated bottleneck: the hero cover is not discoverable in the initial HTML (`ssr:false` carousel), costing 1041ms of resource load delay. See the post-deploy section below. |
| 2026-10-08 | -     | -    | -    | -    | 0     | -           | **Lighthouse Production Fixes — local, pre-deploy** (track `lighthouse_prod_fixes_20261008`, branch `fix/lighthouse-prod-scores`): carousel prev/next accessible names (`aria-label`), `https://static.cloudflareinsights.com` added to the production `script-src`, and a reserved hero container height that removes the skeleton→carousel layout shift. CLS A/B on a production build (desktop 1350×940, 2 featured reviews, Playwright `layout-shift` observer): **0.0376 pre-fix → 0.0000 post-fix (0 entries)**. Gates: typecheck 160 files clean, lint 67 pre-existing warnings only, `bun test` 203 pass / 0 fail, Playwright 33/33. Production re-run pending deploy. |

### Post-fix verification & pending production re-run (2026-10-08)

Local verification of the three code fixes and the TTFB mitigation (all pre-deploy, branch `fix/lighthouse-prod-scores`):

| Item | Before | After | How measured |
| ---- | ------ | ----- | ------------ |
| Carousel CLS | 0.0376 (1 shift @ t≈3486ms, source = hero container div) | **0.0000** (0 entries) | Playwright `PerformanceObserver('layout-shift')`, production build, 1350×940, carousel mounted with 2 slides |
| Cold TTFB (local boot) | first 200 at 26.2s; first-request TTFB **20.5s** | external TTFB **0.22s** right after boot | standalone restart; warm-up logs `[Warmup] / 36ms, /reviews 1602ms, /reading-lists 867ms, /about 846ms` |
| Typecheck / lint / unit | 158 files / 67 warnings / 194 pass | 160 files / 67 warnings / **203 pass** | `bun run typecheck`, `bun run lint`, `bun test` |
| Playwright e2e | — | **33/33 passed** | `bunx playwright test --workers=1`. Caveat: the default parallel run flakes **on this machine** — failures are all `page.goto` 30s timeouts (never assertion failures) with a different failing set each run, and only against the locally booted server; serial is green. Not introduced by this track. |

**Pending (requires the deploy of this branch):** production Lighthouse 13.4.1 re-run and the post-deploy TTFB comparison. Targets: Accessibility ≥ 95 (no `button-name` failures), Best Practices ≥ 95 (no CSP console errors for the RUM beacon), CLS < 0.1, and a cold TTFB absorbed by the boot warm-up. To complete: re-run Lighthouse against `https://chasing-chapters.com` right after a deploy, confirm the four `[Warmup] ... -> ok` lines in the container log, then add the measured row above this section.

### Post-deploy production re-run (2026-10-08, PR #5 → `main`)

Track `lighthouse_prod_fixes_20261008` shipped in PR #5 (merge commit `fe3a037`). Re-ran Lighthouse against the live URL with the desktop preset, system Chrome, after confirming the new image was actually serving (the CSP header now carries `https://static.cloudflareinsights.com`).

| Metric | 2026-10-08 baseline | Post-deploy | Target | Result |
| ------ | ------------------ | ----------- | ------ | ------ |
| Performance | 71 | **71** | — | unchanged — see below |
| Accessibility | 94 | **100** | ≥ 95 | ✅ |
| Best Practices | 92 | **96** | ≥ 95 | ✅ |
| SEO | 100 | **100** | — | ✅ |
| CLS | 0.116 | **0** | < 0.1 | ✅ |
| Root document TTFB | 3.5s (cold) | **230ms** | cold absorbed | ✅ (warm measurement) |
| LCP | — | 3.0s | — | ❌ now the bottleneck |
| FCP / TBT / Speed Index | — | 1.0s / 170ms / 2.7s | — | — |

Warm production TTFB after rollout: 0.28–0.35s across 5 requests (first hit after the container restart 1.34s, then settled); `x-nextjs-cache: HIT` throughout, so ISR behaviour is unchanged.

**Why Performance did not move.** None of the four defects in this track is the LCP bottleneck. The LCP element is the hero book cover (`img.object-cover`), and its phase breakdown is:

| LCP subpart | Duration |
| ----------- | -------- |
| Time to first byte | 1070ms |
| Resource load delay | **1041ms** |
| Resource load duration | 226ms |
| Element render delay | 358ms |

The decisive fact is in `lcp-discovery-insight`: `requestDiscoverable: false` — the LCP image is **not present in the initial HTML**, so the preload scanner cannot start fetching it until the client bundle mounts the hero (the `ssr:false` carousel path). That is the 1s load delay, and it is the direct cost of keeping the hero out of the server response. The track's own scope explicitly excluded image delivery, so this is the natural next track rather than a regression here: the previous CLS fix reserved the hero's height (CLS 0 confirmed) without touching when the image arrives.

Supporting evidence that image delivery is the remaining cost: the heaviest non-JS request was `/_next/image?url=/api/media/file/atom.jpg&w=640&q=75` at **1198ms** — cover art is served through Payload's local media API (`/api/media/file/...`), not R2, so every optimizer cache miss re-enters the app itself. Pointing the optimizer at R2 (or pre-sizing hero art) is the lever.

Two audit numbers to read with care: `redirects` reported 413ms, but `curl -I https://chasing-chapters.com/` returns `200 OK` with no `Location` header and `num_redirects=0`, so that figure is most likely a headless-Challenge/measurement artifact rather than a real user-facing hop — re-measure from PageSpeed Insights or a headed browser before acting on it.

---

## 📚 Resources

- [Web Vitals](https://web.dev/vitals/)
- [Optimize CLS](https://web.dev/optimize-cls/)
- [Optimize LCP](https://web.dev/optimize-lcp/)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [Next.js Font Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
