# Phase 2 Evidence — Neighbour-page revalidation on review changes

- **Track:** 20261027-typography-residuals — Typography residuals
- **Phase:** 2 — Neighbour-page revalidation on review changes
- **Date:** 2026-10-27
- **Branch:** refactor/20261027-typography-residuals
- **Base:** 8df5dc628f94621634451b161486a4efc5bce477
- **Head:** 0be62fc (test commit; impl commit f529e43)
- **Result:** verified

## Summary

`revalidateReviewPages` now reuses the review pages' own neighbour ordering
(`getAdjacentReviews` in `src/lib/review-navigation.ts`: `publishDate`
descending, slug tiebreak, visibility-gated, two bounded `limit: 1` queries)
inside the existing change-condition block, and revalidates each neighbour's
page path in both locales via the existing `revalidatePublicPath` helper.
No-neighbour, no-slug/date, and draft-save cases revalidate nothing extra and
do not throw. The out-of-scope `revalidatePath` tolerance (log, don't throw)
is unchanged and every other failure still rethrows.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 278 files |
| static | `bun run lint` | 0 | Checked 272 files. No fixes applied. |
| unit | `bun test` | 0 | 840 pass, 0 fail, 61 files |
| unit (targeted) | `bun test src/hooks/__tests__/revalidatePages.test.ts` | 0 | 8 pass, 0 fail |

Full phase verification ran as the single briefed command
`bun run typecheck && bun run lint && bun test` (exit 0 throughout).

## Findings

| Task | What changed | Test | Status |
| --- | --- | --- | --- |
| P2.T1 (FR-3, AC-4) | `src/hooks/revalidatePages.ts`: hook now takes `req` and, inside the existing justPublished/wasUnpublished/contentChanged/create block, calls `getAdjacentReviews(req.payload, doc)` (guarded on `req?.payload` so stub-`req` callers skip it) and revalidates each returned neighbour via `revalidatePublicPath` | New test: publish revalidates `/en\|/id/reviews/<neighbour>` for both neighbours and asserts two `limit: 1` payload queries | done |
| P2.T1 (FR-3) | Unpublish path covered by the same block (neighbours' links disappear) | New test: unpublish revalidates both neighbours in both locales | done |
| P2.T2 (FR-3, AC-5) | No code change needed: `getAdjacentReviews` already returns nulls at list ends and for missing slug/date; the `req?.payload` guard makes a payload-less call a safe no-op | New tests: empty neighbour results revalidate nothing extra; slugless/dateless review never calls `find` and keeps the 6-path base set; draft-save update calls neither `find` nor `revalidatePath` | done |
| — | Existing tests untouched (still pass unchanged; the guard keeps their stub `req: {}` a no-neighbour case) | `revalidatePages.test.ts` original 3 tests | done |

Commits: `f529e43` (impl), `0be62fc` (tests).
Files changed: `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts`.

## Evidence paths

- `src/hooks/revalidatePages.ts` (neighbour lookup + revalidation)
- `src/hooks/__tests__/revalidatePages.test.ts` (5 new tests alongside the 3 existing)

## Primary verification

Independently re-ran the phase gate on the final tree:

- `bun run typecheck` → exit 0, no type errors in 278 files.
- `bun run lint` → exit 0, clean over 272 files.
- `bun test` → 840 pass / 0 fail across 61 files (3437 expects; +5 new tests vs Phase 1).

Squash guard: range `8df5dc6..HEAD` contains exactly the three reported
subagent commits — no merge, unreported, or user commits. Squashed into the
phase checkpoint below.

## Deviations

None. No file outside `Touches` was modified.

## Notes

- Neighbour lookup is one un-localed query whose slugs are fanned out to both
  locales, matching how the hook already revalidates the review's own page.
- Neighbour-query failures propagate (only the out-of-scope `revalidatePath`
  invariant is tolerated), so a broken lookup fails loudly rather than
  silently skipping invalidation.
