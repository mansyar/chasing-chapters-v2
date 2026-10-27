# Phase R1 — Review Fixes (Round-1 Findings F1–F6) — Evidence

- Track: 20261027-related-reviews — Related Reviews Upgrade
- Phase: R1 (review fixes; no spec behavior change)
- Date: 2026-10-27
- Branch: `feat/20261027-related-reviews` (already checked out; not switched)
- Base: unknown to executor (no shell access; primary records base from run file)
- Head: uncommitted working tree (implementation complete; commit by primary)
- Result: **blocked** — implementation complete, verification + commit left for
  the primary (no shell/git in executor sandbox; expected flow per brief, not a failure)

## Commands

| Layer | Command | Exit | Summary |
|-------|---------|------|---------|
| typecheck | `bun run typecheck` | not run | Blocked: shell unavailable in executor sandbox; primary to run |
| lint | `bun run lint` | not run | Blocked: shell unavailable in executor sandbox; primary to run |
| unit | `bun test` | not run | Blocked: shell unavailable in executor sandbox; primary to run |
| build | `bun run build` | not run | Blocked: shell unavailable in executor sandbox; primary to run |
| e2e | — (not required) | — | No re-run needed: none of the fixes changes rendered output |

## Acceptance (reviewer findings → fix → verification)

| Finding | Fix | Files | Verification |
|---------|-----|-------|--------------|
| F1: `as Media` assertion before narrowing (`RelatedReviewsList.tsx:142`) | Dropped the assertion; narrow `review.coverImage` directly via a `cover` variable guarded by the existing `typeof === "object" && !== null` check. `coverUrl`, `alt`, `placeholder`, and `blurDataURL` all read from the narrowed `cover` (`cover?.alt`, `cover?.blurDataURL`), so no assertion is needed and typechecking holds for `Review.coverImage: number \| Media`. Removed the now-unused `Media` type import. | `src/components/reviews/RelatedReviewsList.tsx` | Primary: `bun run typecheck && bun run lint && bun test && bun run build` |
| F2: hardcoded rail size `3` (`RelatedReviews.tsx:192`) | Import `DEFAULT_RELATED_LIMIT` from `@/lib/related-scoring` and pass it to `mergeRelatedReviews(picks, candidates, DEFAULT_RELATED_LIMIT)`. Rendered output unchanged (limit is still 3). | `src/components/reviews/RelatedReviews.tsx` | Primary: same command set |
| F3: duplicated verbatim `idsOf` helper in both components | Exported one shared `idsOf` from `src/lib/related-scoring.ts` (same signature/body, documented as the single owner of relation-id logic alongside the scorer) and imported it in both `RelatedReviews.tsx` and `RelatedReviewsList.tsx`; deleted both local copies. No test changes (tests pin behavior, not helper location). | `src/lib/related-scoring.ts`, `src/components/reviews/RelatedReviews.tsx`, `src/components/reviews/RelatedReviewsList.tsx` | Primary: same command set |
| F4: affinity `find` uses unsorted `limit: 20` window | Added `sort: "-publishDate"` to the affinity `payload.find` plus a comment stating the 20-newest-window assumption and its alignment with the recency tiebreak in `rankAffinityCandidates`. | `src/components/reviews/RelatedReviews.tsx` | Primary: same command set |
| F5: affinity DB read runs even when eligible picks fill the rail | Compute `eligiblePickCount` / `affinityNeeded = eligiblePickCount < DEFAULT_RELATED_LIMIT` after resolving picks and gate the query on `orConditions.length > 0 && affinityNeeded`. The merge's short-circuit remains the second guard. Saves one bounded read when picks already fill the rail; output unchanged. | `src/components/reviews/RelatedReviews.tsx` | Primary: same command set |
| F6: e2e `ELIGIBLE_OTHERS` slug tiebreak uses `localeCompare` | Mirrored the scorer's codepoint comparison (`a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0`) in `e2e/related-reviews.spec.ts`. Test-only change; no slug tie exists in fixtures today. | `e2e/related-reviews.spec.ts` | Primary: same command set (e2e re-run not required) |

## Evidence paths

- Changed code:
  - `src/components/reviews/RelatedReviewsList.tsx` (F1, F3)
  - `src/components/reviews/RelatedReviews.tsx` (F2, F3, F4, F5)
  - `src/lib/related-scoring.ts` (F3: shared `idsOf` export)
  - `e2e/related-reviews.spec.ts` (F6)
- This report: `conductor/tracks/20261027-related-reviews/verification/phase-R1.md`

## Deviations

- None. All changes stay within the phase `Touches` paths. No files outside
  `Touches` were modified; no generated files or lockfiles touched.

## Notes

- Behavior and rendered output are unchanged by every fix (limit still 3,
  same ordering, same rail HTML); only query efficiency (F5 skip), query
  window alignment (F4 sort), and code health (F1–F3, F6) change.
- Formatting follows the repo's tab-indented Biome style by hand (executor
  could not run `bun run lint`); primary's verification run will confirm.
- Watch item for primary: `RelatedReviews.tsx:189` line
  `const slugs = mergeRelatedReviews(picks, candidates, DEFAULT_RELATED_LIMIT);`
  is ~79–80 columns with its tab indent — confirm `bun run lint` is happy;
  wrap if Biome prefers it.
- Suggested conventional commit (for primary): something like
  `refactor(related-reviews): resolve R1 review findings F1-F6`
  (primary owns commits; nothing committed by executor).

## Primary verification

- Independent verification re-ran all four layers after the subagent handoff
  (subagent sandbox denied shell; all commits primary-owned).
- `bun run typecheck` — exit 0, no errors in 296 files.
- `bun run lint` — exit 0 after one autofix round (`biome check --write`
  formatting on the F6 nested ternary in `e2e/related-reviews.spec.ts`).
  292 files clean. (The R1.T3 watch item was a non-issue — Biome accepted the
  merge line as written.)
- `bun test` — 926 pass / 0 fail across 68 files.
- `bun run build` — exit 0, production build succeeds.
- No e2e re-run: none of F1–F6 changes rendered output (F6 only reformats a
  comparator that orders fixture data identically — no slug ties exist), so
  the 12/12 Phase 3 result stands.
- Guard check: range `80e63bf..HEAD` held only primary-owned commits; squashed
  to a single phase commit.
