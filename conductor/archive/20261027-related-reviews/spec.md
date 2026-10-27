# Related Reviews Upgrade — Specification

## Overview

Upgrade the existing `RelatedReviews` rail (shipped in #32, untested) from
unweighted OR-matching to a curated-first, deterministically scored rail with
compact cards and full test coverage.

## Problem / Motivation

- Candidate order today is whatever the database returns for an unweighted
  genre/tag/mood OR — no relevance signal, untestable by construction.
- The CMS `relatedReviews` field lets authors hand-pick recommendations, but
  the component ignores it — authorial intent is silently dropped.
- The full-`ReviewCard` grid duplicates the browse grids visually and is heavy
  for a 3-item rail.
- Zero coverage: no unit tests, no e2e assertions — regressions would ship
  silently.

## Goals & Success Metrics

- Deterministic, unit-pinned relevance ordering; author picks honored.
- Rail covered at unit + e2e layers; `review-detail` suite stays green.

## Scope — In

- Weighted affinity scoring lib (3/2/1, newest-then-slug tiebreak) + merge
  logic (picks first, affinity backfill to 3, dedupe).
- Compact row cards (cover + locale title + meta) replacing the `ReviewCard`
  grid.
- Wiring author picks through (page query populates `relatedReviews`).
- Unit + component + e2e coverage; dictionary additions only if needed.

## Scope — Out

- Genre/tag archive pages, search results page (separate tracks).
- Click tracking/analytics; CMS field removal (the field stays — now used).
- Placement, eligibility, locale-read, heading copy (already correct —
  regression-pinned only).

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Rail renders max 3 recommendations below the article, above comments; renders nothing when zero eligible candidates exist (existing behavior, regression-pinned). |
| FR-2 | Author-picked reviews (`relatedReviews`, stored order) lead the rail; ineligible picks (unpublished, scheduled-future, self) are skipped. |
| FR-3 | Affinity backfill scores candidates 3/shared genre + 2/shared tag + 1/shared mood; ties break by newest `publishDate`, then slug; fills remaining slots to 3, excluding self, picks, and ineligible reviews. |
| FR-4 | Cards are compact rows: cover thumbnail, locale title (EN fallback), meta line (star rating + publish date) linking to the review. |
| FR-5 | Eligibility unchanged: `publishedAndVisibleWhere` candidates only, never the current review. |
| FR-6 | Locale display unchanged: locale-aware read, EN fallback, existing dictionary heading. |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | No new dependencies; server component; ISR-safe (bounded: one picks read + one affinity query). |
| NFR-2 | Accessibility: h2 retained, list semantics, 44px touch targets, native link keyboard behavior, axe-clean. |
| NFR-3 | Coverage: unit tests for scoring/merge/dedupe; e2e for render, order, locale, empty-state, click-through. |

## Acceptance Criteria

| ID | Criterion (maps to) |
|----|---------------------|
| AC-1 | Rail renders below article / above comments; hidden when nothing eligible (FR-1; unit + e2e). |
| AC-2 | An authored, eligible pick renders first, in stored order (FR-2; unit + e2e if seed allows). |
| AC-3 | Higher-weighted overlap outranks lower (unit: genre-beats-tags-beats-moods fixtures) (FR-3). |
| AC-4 | Score ties order newest-first, then slug (unit) (FR-3). |
| AC-5 | Rows show cover + title + meta; no full cards (FR-4; e2e). |
| AC-6 | Ineligible pick skipped, slot backfilled, no duplicates (FR-2, FR-3, FR-5; unit). |
| AC-7 | `/id` page shows Indonesian titles/description (FR-6; e2e). |
| AC-8 | Keyboard + axe clean, 44px targets (NFR-2; e2e). |
| AC-9 | Clicking a row navigates to that review (e2e). |

## Edge Cases

- Picks > 3: first 3 stored picks win; affinity never runs.
- No picks + no taxonomy overlap → rail hidden (existing null path).
- Pick duplicates an affinity candidate → shown once, in pick position.
- Pick of self → excluded (CMS filter + runtime guard).
- Untranslated pick title → EN fallback.

## Dependencies

- None new. Builds on `publishedAndVisibleWhere`, typed dictionaries,
  `StarRating`, existing fixtures (seed may need `relatedReviews` set for
  AC-2 e2e — handled in Phase 3).

## Open Questions & Assumptions

- Pick order = CMS stored order (assumed; Payload preserves hasMany order).
- Weights 3/2/1 per interview answers; recorded here as the contract.
- If fixtures can't cover AC-2 without seed surgery, AC-2 falls back to
  unit-only with the reason recorded.

## References

- `src/components/reviews/RelatedReviews.tsx`
- `src/collections/Reviews.ts:431` (`relatedReviews` field)
- `src/app/(public)/[locale]/reviews/[slug]/page.tsx:629-638` (rail placement)
- `docs/PRD.md` §5.2 (related reviews recommendations)
