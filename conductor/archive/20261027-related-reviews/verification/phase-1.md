# Phase 1 — Scoring + Merge Lib: Phase Report

- Track: 20261027-related-reviews — Related Reviews Upgrade
- Phase: 1 (Scoring + merge lib)
- Date: 2026-10-27
- Branch: `feat/20261027-related-reviews`
- Base: `9f69c182c637ed4dc8630b83beecafd940df397a`
- Head: unknown — `git` / shell unavailable in this execution environment,
  so the head SHA could not be read and task commits could not be created.
- Result: **blocked** (implementation + tests complete; verification and
  commits require the primary agent — see Blockers)

## Summary

Implemented the deterministic, pure, framework-free scoring + merge lib:

- `src/lib/related-scoring.ts` — weighted affinity scoring (3/2/1),
  deterministic ranking (score desc, newest `publishDate`, slug asc), and
  picks-first merge with a default limit of 3.
- `src/lib/__tests__/related-scoring.test.ts` — 17 unit tests covering
  weight ordering, tiebreaks, pick priority/stored order, skip-and-backfill,
  dedupe, limits, and empty inputs.

Tests were written before the implementation (TDD, Red-Green): the test file
was created first, then the lib. The Red/Green executions could not be run
here (no shell), so the primary must run the verification command before
accepting the phase.

## Commands

| Layer | Command | Exit | Summary |
|-------|---------|------|---------|
| static | `bun run typecheck` | not run | Shell permission-denied in this environment |
| static | `bun run lint` | not run | Shell permission-denied in this environment |
| unit | `bun test` | not run | Shell permission-denied in this environment |

Full phase verification command (to be run by the primary, exactly as written
in the brief):

```bash
bun run typecheck && bun run lint && bun test
```

## Acceptance Criteria

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| AC-2 | Authored, eligible pick renders first, in stored order | `mergeRelatedReviews` leads with eligible picks in stored order; test "leads with eligible picks in stored order, then backfills with affinity" | pending verification |
| AC-3 | Higher-weighted overlap outranks lower | `scoreAffinityOverlap` 3/2/1; tests "orders genre overlap above tag overlap above mood overlap" + "lets a higher total outrank a single high-weight overlap" | pending verification |
| AC-4 | Score ties order newest-first, then slug | `rankAffinityCandidates` comparator; tests "breaks score ties by newest publishDate first", "breaks date ties by slug ascending", "sorts candidates without a usable publishDate last on ties" | pending verification |
| AC-6 | Ineligible pick skipped, slot backfilled, no duplicates | `mergeRelatedReviews` eligible-filter + `seen` dedupe; tests "skips ineligible picks and backfills their slots", "shows a pick that duplicates an affinity candidate once, in pick position", "dedupes repeated picks" | pending verification |

FR-2/FR-3/FR-5 mapping: picks-first + stored order (FR-2), 3/2/1 scoring
with deterministic tiebreaks (FR-3), `eligible` flags per pick/candidate and
no self/query logic in the lib — eligibility stays in the Phase 2 query layer
(FR-5). Limit semantics: default 3, picks beyond the limit dropped before
affinity is ranked, empty inputs → `[]`.

## Evidence Paths

- `src/lib/related-scoring.ts` (new)
- `src/lib/__tests__/related-scoring.test.ts` (new)
- This report:
  `conductor/tracks/20261027-related-reviews/verification/phase-1.md`

## Deviations

None. All changes are within the phase `Touches` paths
(`src/lib/related-scoring.ts`, `src/lib/__tests__/related-scoring.test.ts`)
plus this evidence file.

## Design Notes

- Single `AffinityCandidate` type carries overlap counts, `slug`,
  `publishDate`, and `eligible`; `rankAffinityCandidates` filters ineligible,
  scores, and sorts; `mergeRelatedReviews` takes picks in stored order plus
  raw candidates and ranks internally only when slots remain (so a full pick
  list costs no scoring work).
- Missing/unparsable `publishDate` maps to `-Infinity` (sorts last on ties).
  The recency tiebreak uses explicit `>`/`!==` comparison, never subtraction:
  `-Infinity - -Infinity` is `NaN`, which `Array.sort` treats as equal and
  would inherit nondeterministic query order instead of reaching the slug
  tiebreak. Pinned by the "without a usable publishDate" test asserting the
  exact order `["dated", "bad-date", "no-date"]`.
- Slug comparison uses `<`/`>` (byte order), not `localeCompare`, for
  environment-independent determinism.

## Primary verification (primary agent, 2026-10-27)

Subagent status `blocked` was environmental only (no shell/git in its
sandbox). The primary ran verification on the track branch:

| Layer | Command | Exit | Summary |
|-------|---------|------|---------|
| static | `bun run typecheck` | 0 | No type errors in 293 files |
| static | `bun run lint` | 0 | 289 files clean (after 2 Biome autofixes, see deviations) |
| unit | `bun test` (full suite) | 0 | 903 pass, 0 fail, 67 files (20 new related-scoring tests) |

Acceptance criteria: AC-2, AC-3, AC-4, AC-6 all **verified** — unit evidence
in `src/lib/__tests__/related-scoring.test.ts`, all green.

Deviations (primary, within phase scope):
- `bunx biome check --write` on `src/lib/__tests__/related-scoring.test.ts`
  (import sort) — phase test file.
- `bunx biome check --write` on
  `conductor/tracks/20261027-related-reviews/metadata.json` (single-line →
  multi-line formatting) — pre-existing scaffold style, content unchanged.

Phase result: **verified**. Squashed as checkpoint below.

## Blockers (for the primary agent)

1. Verification could not run here: `default.shell` returns
   `Permission denied: shell`. Please run
   `bun run typecheck && bun run lint && bun test` on the track branch.
2. Commits could not be created here (no shell/git access). Suggested
   task-level commits once verification passes:
   - `feat(related): add affinity scoring with weighted overlap` (P1.T1)
   - `feat(related): add picks-first merge logic` (P1.T2)
   - tests live alongside each (`test(related): ...` or combined), plus this
     evidence file.
