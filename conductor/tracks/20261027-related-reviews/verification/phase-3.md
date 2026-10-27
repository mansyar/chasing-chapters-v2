# Phase 3 Verification — e2e + polish

- Track: 20261027-related-reviews — Related Reviews Upgrade
- Phase: 3 (e2e + polish)
- Date: 2026-10-27
- Branch: `feat/20261027-related-reviews`
- Base: `main` @ `53ffcbe106a3eecd2af7cf7435ddea4f50226dae` (per plan.md; unchanged by this phase)
- Head: uncommitted — no shell/git in this sandbox, so nothing was committed;
  the primary records the head commit when it commits this phase.
- Result: **blocked** (environmental only — no shell access, so the
  verification commands and the official e2e run could not be executed here;
  implementation is complete and ready for the primary to verify and commit).

## Commands

| Layer | Command | Exit | Summary |
|-------|---------|------|---------|
| static | `bun run typecheck` | not run | No shell in sandbox; primary to run. |
| static | `bun run lint` | not run | No shell in sandbox; primary to run. |
| unit | `bun test` | not run | No shell in sandbox; primary to run. |
| static | `bun run build` | not run | No shell in sandbox; primary to run. |
| e2e | official e2e run (`bun run test:e2e`) | not run | Primary-owned per brief; primary to run. |

Expected outcome when the primary runs them: typecheck/lint/test/build green
(the new file is a Playwright spec outside `bun test` scope and follows the
established `review-toc`/`review-detail` patterns), and the Playwright suite
green including the 11 new `e2e/related-reviews.spec.ts` specs.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|----|-----------|----------|--------|
| AC-1 | Rail renders below article / above comments; hidden when nothing eligible | e2e: *renders three rows…* (count/order), *the rail sits below the article and above the comments* (bounding-top ordering h1 < rail < comment form); unit (unchanged): `RelatedReviewsList` renders nothing for no rows, wrapper returns null | covered (render/placement e2e; empty-state unit — no seeded page yields zero candidates, see notes) |
| AC-2 | An authored, eligible pick renders first, in stored order | Unit-only: Phase 1 `mergeRelatedReviews` pick-priority tests + Phase 2 `toRelatedPick`/wiring tests. No e2e: the fixture seeds no `relatedReviews` picks (see notes) | covered at unit layer per the spec fallback |
| AC-3 | Higher-weighted overlap outranks lower | Phase 1 unit tests (unchanged by this phase) | covered (unit) |
| AC-4 | Score ties order newest-first, then slug | Phase 1 unit tests; the e2e order assertion derives its expectation from the same newest-then-slug rule over the equal-scored fixture | covered (unit + e2e tiebreak in practice) |
| AC-5 | Rows show cover + title + meta; no full cards | e2e: *each row shows cover, title, rating, and publish date — no full cards* (img visible, rating sr-only text, `formatDate` text, zero `[data-slot="card"]`); unit: Phase 2 row-content tests | covered |
| AC-6 | Ineligible pick skipped, slot backfilled, no duplicates | Phase 1/2 unit tests (unchanged by this phase) | covered (unit) |
| AC-7 | `/id` page shows Indonesian titles/description | e2e Indonesian block: translated heading + description, `/id/reviews/` hrefs in rail order, localized title (`Sembilan Jenis Cuaca`) with English fallback, Indonesian dates | covered |
| AC-8 | Keyboard + axe clean, 44px targets | e2e: Tab traversal across rail links + Enter navigation, measured link heights ≥ 44px, manual semantics pass (h2, list/listitem, named links, img alts). No automated axe run — see notes | covered with the axe-method substitution noted |
| AC-9 | Clicking a row navigates to that review | e2e: *clicking a row navigates to that review* (EN click + URL + h1), keyboard-Enter navigation, reduced-motion click-through | covered |

## Evidence paths

- `e2e/related-reviews.spec.ts` (new; the only code change this phase)
- Phase 1 evidence: `conductor/tracks/20261027-related-reviews/verification/phase-1.md`
- Phase 2 evidence: `conductor/tracks/20261027-related-reviews/verification/phase-2.md`

## Deviations

None — the only file written is `e2e/related-reviews.spec.ts`, which is
inside the phase's `Touches`. No seed or harness file was modified (deliberate;
see notes).

## Notes

1. **AC-2 is unit-only, per the spec fallback.** Outcome of the seed check:
   `E2E_FIXTURE_REVIEWS` carries no `relatedReviews` field and
   `e2e/global-setup.ts` upserts reviews in a single pass with uniform
   taxonomy (every review gets all genres/tags/moodTags). Expressing an
   authored pick would require a `relatedReviews` addition to the
   `E2EFixtureReview` type plus a two-pass slug→id link in the seed — surgery
   on the shared harness for a field no other suite touches. Picks-first is
   already pinned by Phase 1 merge tests and Phase 2 flag/wiring tests, so no
   seed change was made and the e2e asserts the affinity backfill order
   instead (equal scores → newest-first: Salt 04-11, Cartographer 03-28,
   Nine Kinds 03-21; scheduled Slow Orbit and self excluded).
2. **Empty-state-hidden is likewise unit-pinned.** Uniform fixture taxonomy
   means every seeded page has eligible candidates, so no seeded URL exercises
   the null path; `RelatedReviewsList` rendering nothing for `[]` plus the
   wrapper's `return null` guards (Phase 2 tests) remain the coverage.
3. **Axe substitution for AC-8.** `@axe-core/playwright` is not installed and
   `NFR-1` forbids new dependencies, and no established axe pattern exists in
   this repo (the a11y suites use rendered-contrast measurement, keyboard
   walks, and semantic assertions — followed here). The spec's semantics test
   mirrors the axe rules the rail could break (heading, list, link-name,
   image-alt). If the primary wants a real axe pass, that is a dependency
   decision for a follow-up, not this phase.
4. **Cap-at-3 note.** The fixture yields exactly 3 eligible others, so e2e
   proves render-of-3 rather than the cap itself; the cap stays pinned by the
   Phase 1 merge unit tests.
5. **For the primary's verification run:** the new spec imports pure helpers
   already used by other specs (`formatDate`, `getDictionary`,
   `formatMessage`, e2e-harness constants); no new fixtures or routes needed.
   Suggested: `bun run test:e2e -- related-reviews` for a focused pass, then
   the full suite to confirm `review-detail` stays green.

## Primary verification

- Independent verification re-ran all four layers after the subagent handoff
  (subagent sandbox denied shell; all commits primary-owned).
- `bun run typecheck` — exit 0, no errors in 296 files.
- `bun run lint` — exit 0 after one autofix round (`biome check --write`
  import-sort/format on `e2e/related-reviews.spec.ts`; repeat offense of the
  same pre-existing lint pattern, test-only). 292 files clean.
- `bun test` — 926 pass / 0 fail across 68 files.
- `bun run build` — exit 0, production build succeeds.
- Official e2e (first run): 11/12 — single failure was a test-timing issue
  in "every rail link meets the 44px touch target": `evaluateAll` takes an
  immediate snapshot with no auto-retry, and ran before the streamed rail
  section arrived (0 links found; every other test proved the rail renders
  3 rows). Fixed test-only with an auto-retrying `toHaveCount(3)` guard
  before measuring (one fix round, no app-code change).
- Official e2e (re-run): 12/12 green, including order, exclusion, click-through,
  reduced-motion, keyboard, 44px targets, and mobile overflow tests.
- Guard check: range `fe894ba..HEAD` held only primary-owned commits; squashed
  to a single phase commit. AC-2 (authored picks) and the empty-state null
  path remain unit-pinned per the spec-file rationale (seed has no picks and
  no zero-candidate page); AC-8 axe remains a documented manual pass
  (`@axe-core/playwright` not installed; NFR-1 forbids the new dep).
