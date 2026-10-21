# Lint Debt Cleanup — Implementation Plan

> **Branch:** `refactor/20261021-lint-debt-cleanup`
> **Base:** `main` @ `d600a92`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Translation Stack Typing (production)

- **Goal:** All 27 `noExplicitAny` warnings in production translation code and
  `src/lib/utils.ts` are eliminated with concrete types; typecheck and all unit
  tests still pass; warning count strictly decreases.
- **Depends on:** none
- **Covers:** FR-1, FR-4 (partial), NFR-1, NFR-2, NFR-3
- **Touches:** `src/lib/translate.ts`, `src/lib/retranslate.ts`,
  `src/lib/utils.ts`, `src/hooks/translateReview.ts`,
  `src/payload-types.ts` (only if regeneration is required)
- **Verification:** `bun run typecheck && bun run lint && bun test` — pass
  criteria: exit 0, zero tests failed, total warnings strictly below the
  67-warning baseline, no new rule introduced beyond the baseline.
- **Status:** verified

- [x] **P1.T1: Type `src/lib/translate.ts` (12 warnings)** — covers: FR-1
  - [x] **P1.T1.1: Replace `any` with Payload generated types / `unknown` + narrowing per spec strategy; remove dead `eslint-disable` lines (FR-4)**
- [x] **P1.T2: Type `src/hooks/translateReview.ts` (9 warnings)** — covers: FR-1
  - [x] **P1.T2.1: Type translation results and API boundary inputs/outputs; remove dead `eslint-disable` lines (FR-4)**
- [x] **P1.T3: Type `src/lib/retranslate.ts` (4 warnings)** — covers: FR-1
  - [x] **P1.T3.1: Replace `any` with concrete types consistent with P1.T1; remove dead `eslint-disable` lines (FR-4)**
- [x] **P1.T4: Type `src/lib/utils.ts` `extractTextFromRichText` (2 warnings)** — covers: FR-1
  - [x] **P1.T4.1: Type the rich-text node shape with the Lexical/Payload generated types**

**Result:** verified
**Checkpoint:** d8ce16c
**Evidence:** conductor/tracks/20261021-lint-debt-cleanup/verification/phase-1.md

## Phase 2: App, Admin, and UI Correctness Fixes

- **Goal:** All 14 warnings outside the translation stack are resolved —
  `noExplicitAny` in pages/components/admin/scripts plus the two correctness
  fixes (hook dependencies, ARIA role support); typecheck and all unit tests
  still pass; warning count strictly decreases.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-3, FR-4 (partial), NFR-1, NFR-2, NFR-3
- **Touches:** `src/app/(public)/reviews/[slug]/page.tsx`,
  `src/app/(public)/reviews/page.tsx`, `src/components/ReviewCard.tsx`,
  `src/components/admin/AnalyticsDashboard.tsx`,
  `src/collections/Reviews/admin/RetranslateButton.tsx`,
  `src/app/(payload)/layout.tsx`, `src/scripts/migrate-emails.ts`,
  `src/components/ModernBookCarousel.tsx`, `src/components/ui/marquee.tsx`
- **Verification:** `bun run typecheck && bun run lint && bun test` — pass
  criteria: exit 0, zero tests failed, total warnings strictly below the
  Phase 1 result, no new rule introduced beyond the baseline.
- **Status:** verified

- [x] **P2.T1: Type reviews pages (6 warnings in 2 files)** — covers: FR-1
  - [x] **P2.T1.1: `src/app/(public)/reviews/[slug]/page.tsx` (5) — Payload doc params via generated types; remove dead `eslint-disable` lines (FR-4)**
  - [x] **P2.T1.2: `src/app/(public)/reviews/page.tsx` (1) — same strategy**
- [x] **P2.T2: Type `ReviewCard.tsx` and `RetranslateButton.tsx` (2 warnings)** — covers: FR-1
  - [x] **P2.T2.1: Component props and Payload doc typing; remove dead `eslint-disable` lines (FR-4)**
- [x] **P2.T3: Type `AnalyticsDashboard.tsx` (3 warnings)** — covers: FR-1
  - [x] **P2.T3.1: Analytics row/aggregate typing; remove dead `eslint-disable` lines (FR-4)**
- [x] **P2.T4: Type `src/app/(payload)/layout.tsx` and `migrate-emails.ts` (2 warnings)** — covers: FR-1
  - [x] **P2.T4.1: Payload admin layout and one-off script typing**
- [x] **P2.T5: Fix `ModernBookCarousel` exhaustive dependencies (1 warning)** — covers: FR-2
  - [x] **P2.T5.1: Apply the `scrollTo` dependency correction manually — Biome's unsafe auto-fix is explicitly prohibited (spec Edge Cases)**
- [x] **P2.T6: Fix `marquee.tsx` ARIA role support (1 warning)** — covers: FR-3
  - [x] **P2.T6.1: Move `aria-label` to a role that supports it or add a supported role — no visual/UX change intended**

**Result:** verified
**Checkpoint:** 852cdba
**Evidence:** conductor/tracks/20261021-lint-debt-cleanup/verification/phase-2.md

## Phase 3: Test Typing, Sweep, and Final Verification

- **Goal:** All 25 `noExplicitAny` warnings in test files are eliminated, any
  remaining dead `eslint-disable` comments are swept, and the full acceptance
  gate passes including the final Playwright e2e run.
- **Depends on:** Phase 2
- **Covers:** FR-1, FR-4, AC-1, AC-2, AC-3, AC-4, AC-5
- **Touches:** `src/hooks/__tests__/translateReview.test.ts`,
  `src/lib/__tests__/retranslate.test.ts`,
  `src/lib/__tests__/translate.test.ts`,
  `src/hooks/__tests__/formatSlug.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test` followed by
  `bun run test:e2e` — pass criteria: exit 0 on all, `bunx biome check .
  --reporter=summary` reports 0 warnings (AC-1), all 236 unit tests pass, e2e
  suite passes, and `: any` grep over touched files returns nothing outside
  strings/comments (AC-5).
- **Status:** verified

- [x] **P3.T1: Type `src/hooks/__tests__/translateReview.test.ts` (13 warnings)** — covers: FR-1, NFR-3
  - [x] **P3.T1.1: Retype mocks with concrete shapes; flag (do not adjust) any test whose observations would change (spec Edge Cases)**
- [x] **P3.T2: Type remaining test files (12 warnings across 3 files)** — covers: FR-1
  - [x] **P3.T2.1: `src/lib/__tests__/retranslate.test.ts` (10), `src/lib/__tests__/translate.test.ts` (1), `src/hooks/__tests__/formatSlug.test.ts` (1)**
- [x] **P3.T3: Sweep leftover dead `eslint-disable` comments** — covers: FR-4
  - [x] **P3.T3.1: `grep` the touched files for ESLint-style disable directives and remove every line whose warning is resolved**
- [x] **P3.T4: Final full verification** — covers: AC-1, AC-2, AC-3, AC-4, AC-5
  - [x] **P3.T4.1: Run the Phase 3 verification commands and record zero-warning proof in the phase evidence file**
- [x] **P3.T5: Fix pre-existing e2e comment flake (scope amendment)** — covers: FR-5, AC-6
  - [x] **P3.T5.1: Make comment-submission tests deterministic under full-suite parallelism (serialize the comment describe block or equivalent minimal, test-only change); no production-code changes**

**Result:** verified
**Checkpoint:** 81cb66b
**Evidence:** conductor/tracks/20261021-lint-debt-cleanup/verification/phase-3.md

## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1, F2, F3, F4 from review round 1.
- **Depends on:** Phase 3
- **Covers:** F1, F2, F3, F4
- **Touches:** `src/app/(public)/reviews/[slug]/page.tsx`, `src/hooks/__tests__/translateReview.test.ts`, `conductor/tracks/20261021-lint-debt-cleanup/{spec.md,plan.md,verification/*.md}`
- **Verification:** `bun run typecheck && bun run lint && bun test`, plus one repeated full e2e run in CI-equivalent mode recorded in `verification/integrated.md`
- **Status:** pending

- [ ] **R1.T1: Resolve F3 — replace unjustified `as Author` cast with sibling narrowing pattern** — covers: F3
- [ ] **R1.T2: Resolve F4 — make mock `reviewContent` optional with undefined-guard at assertion site (or justify cast); document choice** — covers: F4
- [ ] **R1.T3: Resolve F1 + F2 (primary-executed) — amend AC-6 wording to CI-equivalent mode, record repeated green e2e run, add squash notes to phase evidence files, add `e2e/comments.spec.ts` to Phase 3 Touches** — covers: F1, F2

<!--
Review fixes are appended by `conductor-review` (original template note retained for reference; Phase R1 above is the live fix phase).
-->
