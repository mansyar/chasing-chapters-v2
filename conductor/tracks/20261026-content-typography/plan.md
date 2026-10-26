# Content Typography & Reading Experience — Implementation Plan

> **Branch:** `feat/20261026-content-typography`
> **Base:** `main @ 46a9d32`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Typography foundation

- **Goal:** The typography plugin is active and themed to the site's tokens, and every one of the eight `prose` usages either renders styled text or is deliberately replaced.
- **Depends on:** none
- **Covers:** FR-1, FR-2, AC-1; NFR-2
- **Touches:** `package.json`, `bun.lock`, `src/app/globals.css`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/reviews/[slug]/loading.tsx`, `src/app/(public)/[locale]/about/page.tsx`, `src/components/FeaturedHero.tsx`, `src/components/ModernBookCarousel.tsx`, `src/lib/__tests__/typography-source.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 2d61ce9
- **Evidence:** conductor/tracks/20261026-content-typography/verification/phase-1.md

- [x] **P1.T1: Install and theme the typography plugin** — covers: FR-1, FR-2
  - [x] **P1.T1.1: Add `@tailwindcss/typography` as a build-time dependency**
  - [x] **P1.T1.2: Register it via `@plugin` in `globals.css` and map the prose theme variables onto the site's token set (teal oklch palette, serif body)**
  - [x] **P1.T1.3: Add the dark-mode overrides so links, blockquotes and code hold contrast with `dark:prose-invert` and token-driven colours**
- [x] **P1.T2: Resolve all eight `prose` sites deliberately** — covers: FR-1
  - [x] **P1.T2.1: Keep `prose` on the four review-detail usages and the about page, now that it renders**
  - [x] **P1.T2.2: Replace `prose` with deliberate clamped non-prose classes on the hero excerpt and the carousel excerpt**
  - [x] **P1.T2.3: Replace `prose` on the loading skeleton with the skeleton styling it actually wants**
- [x] **P1.T3: Prove the foundation with a source test** — covers: AC-1
  - [x] **P1.T3.1: Assert the `@plugin "@tailwindcss/typography"` directive exists in `globals.css` and the dependency is in `package.json`, following the `dictionary-source` test pattern**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-1.md
-->

## Phase 2: Structured sections tokenized

- **Goal:** The three structured sections use design tokens and hold contrast in dark mode, with no hardcoded palette colours left in them.
- **Depends on:** Phase 1
- **Covers:** FR-3, AC-2
- **Touches:** `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/lib/__tests__/typography-source.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** f240322
- **Evidence:** conductor/tracks/20261026-content-typography/verification/phase-2.md

- [x] **P2.T1: Re-tokenize the three structured sections** — covers: FR-3
  - [x] **P2.T1.1: Replace the hardcoded green, orange and blue class strings with token-driven classes derived from `globals.css`**
  - [x] **P2.T1.2: Verify the same classes hold contrast in dark mode, not just light**
- [x] **P2.T2: Prove the sections are tokenized** — covers: AC-2
  - [x] **P2.T2.1: Extend the source test to assert no hardcoded palette colour classes remain in the structured-section blocks**

- [x] **P2.T3: Make the mood badge colour-safe** - covers: FR-3
  - [x] **P2.T3.1: Replace the hex-append alpha trick with color-mix() so the badge renders correctly for any colour format**
  - [x] **P2.T3.2: Extend the source test to cover the badge fix or record why the badge is not source-testable**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-2.md
-->

## Phase 3: Shared StarRating

- **Goal:** One read-only `StarRating` component replaces all four inline renderers and announces the rating to screen readers.
- **Depends on:** Phase 1
- **Covers:** FR-4, AC-3
- **Touches:** `src/components/reviews/StarRating.tsx`, `src/components/reviews/__tests__/StarRating.test.ts`, `src/components/FeaturedHero.tsx`, `src/components/ModernBookCarousel.tsx`, `src/components/ReviewCard.tsx`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** in_progress

- [ ] **P3.T1: Build the component** — covers: FR-4
  - [ ] **P3.T1.1: A read-only server component with size variants matching the four current renderings**
  - [ ] **P3.T1.2: Announce "Rated N out of 5" via a screen-reader-only label; no `"use client"` directive**
  - [ ] **P3.T1.3: Handle the extremes — 5 and 1 — rendering full and empty correctly in every size**
- [ ] **P3.T2: Replace the four call sites and cover the component** — covers: AC-3
  - [ ] **P3.T2.1: Component tests for sizes, full/empty rendering and the accessible label**
  - [ ] **P3.T2.2: Swap `FeaturedHero`, `ModernBookCarousel`, `ReviewCard` and the review detail page onto the component, matching each site's previous visual size**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-3.md
-->

## Phase 4: Breadcrumbs and prev/next

- **Goal:** Visible breadcrumbs on both detail pages and prev/next navigation on review detail, correct at the boundaries and suppressed on previews.
- **Depends on:** Phase 3
- **Covers:** FR-5, FR-6, FR-9, AC-4, AC-5
- **Touches:** `src/components/reviews/Breadcrumbs.tsx`, `src/components/reviews/__tests__/Breadcrumbs.test.ts`, `src/lib/review-navigation.ts`, `src/lib/__tests__/review-navigation.test.ts`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx`, `src/lib/i18n/dictionary.ts`, `src/lib/i18n/__tests__/dictionary.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** pending

- [ ] **P4.T1: Build the Breadcrumbs component** — covers: FR-5
  - [ ] **P4.T1.1: A server component rendering Home / section / title, reusing `breadcrumbHome`, `navReviews` and `navReadingLists`**
  - [ ] **P4.T1.2: Keep the rendered trail consistent with the existing `BreadcrumbList` JSON-LD on both pages**
  - [ ] **P4.T1.3: Render on review detail and reading-list detail, styled to match each page**
- [ ] **P4.T2: Add prev/next navigation** — covers: FR-6
  - [ ] **P4.T2.1: A `review-navigation` helper returning the adjacent published reviews ordered by `publishDate` with the slug-ascending tiebreak, using `publishedAndVisibleWhere`**
  - [ ] **P4.T2.2: Render the navigation on review detail with localized labels**
  - [ ] **P4.T2.3: Absent links at both boundaries — no wrap-around, no disabled state**
  - [ ] **P4.T2.4: Suppress breadcrumbs and prev/next on draft previews**
- [ ] **P4.T3: Cover the behaviour and the dictionaries** — covers: FR-9, AC-5
  - [ ] **P4.T3.1: Helper tests for ordering, the tiebreak and the boundaries**
  - [ ] **P4.T3.2: Add the prev/next dictionary keys to both `en` and `id`**
  - [ ] **P4.T3.3: Breadcrumbs tests for hrefs, labels and preview suppression**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-4.md
-->

## Phase 5: Card consolidation

- **Goal:** Two card components with one visual language; the inline reading-lists variant and the exports it orphans are gone.
- **Depends on:** Phase 3
- **Covers:** FR-7, FR-8, AC-6
- **Touches:** `src/components/ReviewCard.tsx`, `src/components/ReadingListCard.tsx`, `src/app/(public)/[locale]/reading-lists/page.tsx`, `src/components/ui/card.tsx`, `src/components/__tests__/` card tests if any exist
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** pending

- [ ] **P5.T1: Consolidate the card renderings** — covers: FR-7
  - [ ] **P5.T1.1: Give `ReviewCard` and `ReadingListCard` one shared base card structure**
  - [ ] **P5.T1.2: Replace the inline variant on the reading-lists index with `ReadingListCard`**
  - [ ] **P5.T1.3: Keep each surface's existing visual outcome — consolidation changes the code, not the rendered look**
- [ ] **P5.T2: Remove what the consolidation orphans** — covers: FR-8
  - [ ] **P5.T2.1: Delete exports of `card.tsx` (and anything else) left with zero importers by this track's changes — nothing beyond what this track orphans**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-5.md
-->

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings
- **Depends on:** Phase 5
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
