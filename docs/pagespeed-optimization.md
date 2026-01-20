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
| 3.1  | Evaluate replacing react-pageflip with CSS solution | ⬜ Pending | High   |
| 3.2  | Tree-shake motion library imports                   | ⬜ Pending | Medium |
| 3.3  | Lazy load Sheet/Dialog components                   | ⬜ Pending | Medium |
| 3.4  | Review bundle analyzer output                       | ⬜ Pending | Low    |

### Phase 4: Advanced Optimizations (Priority 4) ⬜

| Task | Description                                            | Status     | Impact |
| ---- | ------------------------------------------------------ | ---------- | ------ |
| 4.1  | Add `content-visibility: auto` for off-screen sections | ⬜ Pending | Medium |
| 4.2  | Implement resource hints (preconnect, prefetch)        | ⬜ Pending | Medium |
| 4.3  | Add `will-change` CSS for animated elements            | ⬜ Pending | Low    |
| 4.4  | Review and optimize CSS delivery                       | ⬜ Pending | Low    |

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
| -          | -     | -    | -    | -    | -     | -           | -        |

---

## 📚 Resources

- [Web Vitals](https://web.dev/vitals/)
- [Optimize CLS](https://web.dev/optimize-cls/)
- [Optimize LCP](https://web.dev/optimize-lcp/)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [Next.js Font Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
