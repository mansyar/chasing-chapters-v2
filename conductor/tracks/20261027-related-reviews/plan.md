# Related Reviews Upgrade — Implementation Plan

> **Branch:** `feat/20261027-related-reviews`
> **Base:** `main` @ `53ffcbe106a3eecd2af7cf7435ddea4f50226dae`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Scoring + merge lib

- **Goal:** deterministic picks-first/affinity-backfill ranking, unit-pinned.
- **Depends on:** none
- **Covers:** FR-2, FR-3, FR-5, AC-2, AC-3, AC-4, AC-6
- **Touches:** `src/lib/related-scoring.ts`, `src/lib/__tests__/related-scoring.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

- [x] **P1.T1: Affinity scoring** — 3/shared genre + 2/shared tag + 1/shared mood; ties break newest `publishDate`, then slug — covers: FR-3
- [x] **P1.T2: Merge logic** — eligible picks in stored order first; affinity backfill to 3; dedupe; skip ineligible (unpublished, scheduled-future, self) — covers: FR-2, FR-5
- [x] **P1.T3: Unit tests** — weight ordering, tiebreaks, pick priority, skip-and-backfill, empty → none — covers: AC-2, AC-3, AC-4, AC-6

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** c399bf7
**Evidence:** conductor/tracks/20261027-related-reviews/verification/phase-1.md
-->

## Phase 2: Component upgrade

- **Goal:** rail renders picks-first + backfill as compact rows; placement, eligibility, locale behavior preserved.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-4, FR-5, FR-6, AC-1, AC-5, AC-7, NFR-1, NFR-2
- **Touches:** `src/components/reviews/RelatedReviews.tsx`, `src/components/reviews/__tests__/RelatedReviews.test.tsx`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/lib/i18n/dictionary*.ts` (only if new strings needed)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** verified

- [x] **P2.T1: Data wiring** — populate author picks, run Phase 1 merge over affinity candidates — covers: FR-2, FR-5
- [x] **P2.T2: Compact row cards** — cover + locale title + meta (rating + date), links; retire `ReviewCard` grid — covers: FR-4
- [x] **P2.T3: Component tests** — order, empty-state null, locale strings, eligibility guards — covers: AC-1, AC-5, AC-7

<!--
**Result:** verified
**Checkpoint:** bcdf72a
**Evidence:** conductor/tracks/20261027-related-reviews/verification/phase-2.md
-->

## Phase 3: e2e + polish

- **Goal:** e2e proves the rail end-to-end on EN + ID, axe-clean.
- **Depends on:** Phase 2
- **Covers:** AC-1, AC-2 (seed permitting, else unit-only per spec), AC-5, AC-7, AC-8, AC-9
- **Touches:** `e2e/related-reviews.spec.ts`, e2e seed if `relatedReviews` fixtures needed
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`, plus the primary-owned official e2e run
- **Status:** pending

- [ ] **P3.T1: e2e spec** — render/count/order, click-through, ID locale, zero-match hidden — covers: AC-1, AC-5, AC-7, AC-9
- [ ] **P3.T2: a11y + mobile** — keyboard traversal, 44px targets, axe clean, small-viewport layout — covers: AC-8
