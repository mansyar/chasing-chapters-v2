# Review — 20261027-related-reviews

- Track: Related Reviews Upgrade (`20261027-related-reviews`)
- Branch: `feat/20261027-related-reviews`
- Base: `origin/main`
- Reviewer: conductor-reviewer subagent (read-only; sandbox has no shell — verification layers reported by primary, not re-run by reviewer)

## Summary

The track replaces the unweighted OR-match `RelatedReviews` rail with a
curated-first deterministic rail: author `relatedReviews` picks lead in stored
order, `mergeRelatedReviews` backfills with 3/2/1 genre/tag/mood affinity and
newest-then-slug tiebreaks, capped at 3, hidden when empty. Rows are compact
cover + locale title + rating/date links; placement below the article and
above comments, locale-aware read, and eligibility (`publishedAndVisibleWhere`,
never self) are preserved.

## Round 1 — PASS WITH FINDINGS

Verdict: approve-with-followups. No Critical/High, no style violations.

| ID | Severity | File | Finding |
|----|----------|------|---------|
| F1 | Low | `RelatedReviewsList.tsx:142` | Unjustified `as Media` assertion before narrowing |
| F2 | Low | `RelatedReviews.tsx:192` | Hardcoded `3` duplicates `DEFAULT_RELATED_LIMIT` |
| F3 | Low | `RelatedReviews.tsx:31-43` | `idsOf` helper duplicated verbatim in both components |
| F4 | Low | `RelatedReviews.tsx:148-167` | Unsorted `limit: 20` affinity window can miss true top-3 at scale |
| F5 | Nit | `RelatedReviews.tsx:148` | Affinity read runs even when picks already fill the rail |
| F6 | Nit | `e2e/related-reviews.spec.ts:32-38` | `localeCompare` slug tiebreak vs scorer's codepoint `<` |

Accepted deviations (not findings): AC-2 + empty-state null path unit-pinned
only (seed has no picks / no zero-candidate page — spec-sanctioned fallback);
AC-8 manual structural pass instead of automated axe (`@axe-core/playwright`
not installed; NFR-1 forbids the new dep).

Reported verification at Round 1: typecheck 296 files clean, lint 292 clean,
`bun test` 926 pass / 0 fail, `bun run build` success, official e2e 12/12
green (after one test-only timing fix: auto-retrying `toHaveCount(3)` guard
before `evaluateAll` in the 44px test).

## Fixes (Phase R1, commit `3827606`)

- F1: assertion dropped; `review.coverImage` narrowed directly.
- F2: `DEFAULT_RELATED_LIMIT` imported and passed.
- F3: single `idsOf` export from `src/lib/related-scoring.ts`, imported twice.
- F4: `sort: "-publishDate"` + 20-newest-window comment on the affinity find.
- F5: affinity read gated on eligible picks < limit.
- F6: e2e comparator mirrors the scorer; order unchanged (no slug ties).

Primary verification after R1: typecheck / lint / 926 unit / build all green;
no e2e re-run (no rendered-output change — 12/12 stands).

## Round 2 — PASS (clean)

Re-review of `80e63bf..3827606` confirmed all six fixes in place, no new
issues, verdict **approve** with zero findings. Full FR/NFR/AC coverage table
in the Round-2 report (all covered; AC-2/AC-8 partial per accepted deviations
above).
