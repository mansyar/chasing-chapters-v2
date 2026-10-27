# Review Reading Experience + TOC — Implementation Plan

> **Branch:** `feat/20261027-reading-experience-toc`
> **Base:** `main` @ `e1b7068a2780cf7fe8f80981bc9b0014b65437be`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Heading extraction + reading-time libs

- **Goal:** Pure extraction and reading-time functions with unit tests green
- **Depends on:** none
- **Covers:** FR-2, FR-5, AC-2, AC-5, AC-8 (logic part)
- **Touches:** `src/lib/toc-extract*`, `src/lib/reading-time*`, `src/lib/__tests__/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

- [x] **P1.T1: TOC extraction lib** — covers: FR-2
  - [x] **P1.T1.1: Slugify + dedupe** — unique stable slugs, emoji/special-char handling, `section-<index>` fallback
  - [x] **P1.T1.2: Lexical H2/H3 walk + fixed-sections merge** — document order, missing sections omitted, <2 entries flag
- [x] **P1.T2: Reading-time lib** — covers: FR-5
  - [x] **P1.T2.1: Word count across Lexical nodes** — body + whatILoved/couldBeBetter/perfectFor + quotes, per locale
  - [x] **P1.T2.2: Formatter + dictionary keys** — 200wpm ceiling, EN/ID strings

**Result:** verified
**Checkpoint:** f2f94f4
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-1.md

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-1.md
-->

## Phase 2: TOC UI + anchors + quote-share

- **Goal:** Review detail shows sticky/mobile TOC with scrollspy, anchors deep-link, quotes shareable
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-3, FR-4, FR-6, AC-1, AC-3, AC-4, AC-6
- **Touches:** `src/components/reviews/TableOfContents*`, `src/components/reviews/QuoteShare*`, `src/app/(public)/[locale]/reviews/[slug]/*`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** verified

- [x] **P2.T1: TableOfContents component** — covers: FR-1
  - [x] **P2.T1.1: Markup + responsive** — sticky aside lg+, collapsible mobile, hide when <2 entries, 44px targets
  - [x] **P2.T1.2: Scrollspy** — IntersectionObserver active link, smooth scroll (instant on reduced-motion), focus-visible
- [x] **P2.T2: Anchor IDs + deep-link + copy-link** — covers: FR-4
- [x] **P2.T3: Quote share buttons** — covers: FR-6

**Result:** verified
**Checkpoint:** 9618847
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-2.md

## Phase 3: i18n parity + e2e + polish

- **Goal:** EN/ID parity proven, e2e covers navigation/anchors/share, a11y/dark-mode clean
- **Depends on:** Phase 2
- **Covers:** FR-7, AC-7, AC-9, AC-10, NFR-1..NFR-5
- **Touches:** `src/lib/i18n/*`, `e2e/*`, `src/app/(public)/[locale]/reviews/[slug]/*`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** verified

- [x] **P3.T1: Dictionary + per-locale integration** — covers: FR-7
- [x] **P3.T2: E2E + a11y polish** — covers: AC-7, AC-10

**Result:** verified
**Checkpoint:** 668848c
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-3.md

## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1–F5 (scrollspy scroll assertion, share stub test, dual-instance note, heading order)
- **Depends on:** Phase 3
- **Covers:** F1 (AC-3), F2 (AC-9, CI run — primary-owned), F3 (AC-6), F4 (FR-1), F5 (NFR-3)
- **Touches:** `e2e/*`, `src/components/reviews/*`, `src/app/(public)/[locale]/reviews/[slug]/*`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** verified

- [x] **R1.T1: Scroll-driven scrollspy e2e test (F1)** — covers: AC-3
- [x] **R1.T2: QuoteShare navigator.share stub unit test (F3)** — covers: AC-6
- [x] **R1.T3: Dual-instance comment (F4)** — accept with code comment, no behavior change
- [x] **R1.T4: Fixed-section headings h2 (F5)** — keep visual classes, verify tests/build green

**Result:** verified
**Checkpoint:** 31a9715
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-R1.md

## Phase R2: CI-Red Fix (IntersectionObserver rootMargin)

- **Goal:** Fix the production-only `IntersectionObserver` crash — `rootMargin: "-6rem ..."` uses `rem`, which the spec restricts to `px`/`%`, so Chrome throws `SyntaxError` during hydration and every review page renders the route error boundary in E2E (26 CI failures). happy-dom never validates the unit, which is why unit tests stayed green.
- **Depends on:** Phase R1
- **Covers:** CI E2E red (review-toc 11/11 + 15 pre-existing review-page failures, all error-boundary renders)
- **Touches:** `src/components/reviews/TableOfContents.tsx`, `src/components/reviews/__tests__/TableOfContents.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build` (subagent) + primary-owned local prod re-run of `e2e/review-toc.spec.ts`
- **Status:** verified
- **Checkpoint:** c407e34

- [x] **R2.T1: px-only rootMargin (root cause)** — replace `-6rem` with `-96px`, keep `-70%`, add a comment stating the px/%-only constraint and why (real browsers throw, jsdom/happy-dom do not validate)
- [x] **R2.T2: rootMargin regression unit test** — assert the scrollspy observer options passed to `IntersectionObserver` use only `px`/`%` margin tokens, so a future unit edit fails fast instead of failing only in CI E2E
- [x] **R2.T3: Deterministic scrollspy in real browsers** — official `test:e2e review-toc` re-run is 9/11: the crash is gone, but `scrolling updates active link` (:52) and `reduced-motion click` (:95) fail because (a) last-one-wins observer selection is nondeterministic after programmatic scrolls, (b) a heading landed at the viewport top/bottom sits inside the rootMargin exclusions so nothing intersects, (c) the observer can clobber the click-set active slug. Fix: nearest-to-viewport-top deterministic selection, click-lock suppressing observer updates briefly after a TOC click, near-bottom-of-page activates the last entry
- [x] **R2.T4: Replace observer band with scroll-position rule** — follow-up e2e is 10/11: only :52 still fails. `scrollIntoViewIfNeeded` lands the last heading at the viewport bottom edge (inside the `-70%` exclusion) while the page is NOT at document bottom (comments/footer follow), so no bottom-detection fires and any band geometry misses it. Any bottom exclusion fails :52 as written; any bottomless band breaks click landings. Replace the `IntersectionObserver` with an rAF-throttled scroll/resize listener whose rule is "last entry whose heading top is at or above the viewport bottom" (last heading that has appeared on screen), keep the click-lock for click authority, drop the now-obsolete rootMargin regression test and cover the new logic per harness ability

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 3
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
