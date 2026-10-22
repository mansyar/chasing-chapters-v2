# Integrated Verification: 20261022-e2e-production-harness

- **Track**: 20261022-e2e-production-harness — "E2E Production Harness"
- **Date**: 2026-10-22
- **Branch**: `chore/20261022-e2e-production-harness`
- **Base**: `9287be692520efb10254aac7b53b4c0620f69689` (the merge of the previous track)
- **Head**: `b48f219` — "chore(opencode): let the reviewer run the e2e suite"
- **Result**: **Verified.** Every configured layer is green on the track branch.

## Commands

Run in one pass on the track branch, at the final head:

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors |
| static | `bun run lint` | 0 | `biome check .` — no fixes applied (this command also runs Biome's formatter as a diagnostic, so it covers the format check) |
| unit | `bun test --coverage` | 0 | **421 pass / 0 fail** across 34 files; coverage **86.87% funcs / 91.69% lines** overall (the configured gate is 80% on new code) |
| static | `bun run build` | 0 | `next build --webpack` succeeds (the `google-gax` resolution warning is pre-existing) |
| e2e | `bun run test:e2e` | 0 | seed -> build -> `Running 41 tests using 3 workers` -> **41 passed (1.6m)**, 0 failed, 0 skipped |

`bun run test:e2e` is the whole e2e command: it seeds the fixture, builds the app and runs
Playwright against `next start` on port 3100.

### Coverage of the logic-bearing files this track added or changed

| File | % Funcs | % Lines |
| --- | --- | --- |
| `src/lib/e2e-harness.ts` (the worker/port resolvers and the fixture dataset) | 100.00 | 100.00 |
| `src/lib/translate.ts` (the offline test-mode stub) | 100.00 | 100.00 |
| `src/hooks/revalidatePages.ts` (the guarded revalidation) | 100.00 | 100.00 |

`src/collections/Authors.ts` sits at 82.22% lines and `src/collections/Reviews.ts` at 76.90%: the
uncovered lines are the collections' admin configuration, which the unit suite does not execute. The
two behaviours this track changed in those files are covered elsewhere — the afterLogin hook by
`src/collections/__tests__/Authors.test.ts` (four cases, three of which fail against the pre-fix
code) and the optional `coverImage` by `src/collections/__tests__/Reviews.test.ts`.

### Browser suite

| Project | Tests | Result |
| --- | --- | --- |
| `chromium` (the public suite) | 37 | 37 passed |
| `admin-attention-bell` | 1 | passed |
| `admin-bulk-retranslate` | 1 | passed |
| `admin-translation-poller` | 1 | passed |
| `admin-locale-preference` | 1 | passed |

## Acceptance criteria

| AC | Status | Evidence |
| --- | --- | --- |
| AC-1 — the suite is served from a production build and the run is green | pass | `playwright.config.ts` starts `bun --bun next start` on port 3100 and `bun run test:e2e` builds first; 41 passed |
| AC-2 — three workers by default, one in CI, `PLAYWRIGHT_WORKERS` overrides | pass | `resolveWorkerCount` in `src/lib/e2e-harness.ts` + `src/lib/__tests__/e2e-harness.test.ts`; the run log says "Running 41 tests using 3 workers" |
| AC-3 — the fixture is idempotent | pass | two consecutive full runs seeded the same database with the same identifiers; the identifiers are pinned by `src/lib/__tests__/e2e-harness.test.ts` |
| AC-4 — no spec is skipped for missing data | pass | 0 skipped in every run; the data-dependent `test.skip` and the tautological assertion were removed |
| AC-5 — the three admin surfaces assert a visible outcome | pass | the three admin specs plus the locale-preference spec; the assertions are on the bell's label and links, the bulk action's per-review rows and the edit view's status and toast |
| AC-6 — no outbound provider request and no credential present | pass | the e2e section of the run log contains no `Google Cloud`, `Initializing Google`, `quota`, `credentials` or `Translation failed` line; the stub is reached through the explicit `TRANSLATION_TEST_MODE=1` flag |
| AC-7 — CI gains a job and the required check name is unchanged | pass | `.github/workflows/ci.yml` gains the `e2e` job; the workflow diff is 85 insertions and 0 deletions, so the existing job is untouched |
| AC-8 — every app defect the suite proves is fixed with a regression test | pass | the revalidation rollback and the optional `coverImage` have unit regression tests; the admin locale preference has both a unit and a browser regression test |

## Deviations and notes

- **The bulk-action surface is not a Payload list-view bulk action.** Payload 3.90 hardcodes the
  list view's bulk actions and the only injection point is the root `src/collections/Reviews.ts`,
  which the plan puts out of scope for that phase. The action is therefore a component on the
  reviews admin path. The spec's FR-4 and AC-4 were amended to match what shipped.
- **The `media` collection was left alone.** The first delivery added
  `upload.filesRequiredOnCreate: false`; the primary rejected it and had it reverted, because it
  weakens a production invariant, every cover render site is already guarded by `coverImage?.url`
  so it bought nothing, and it was outside the spec's scope.
- **`coverImage` on Reviews is now optional.** With the file-less media record rejected, the fixture
  needed a coverless review. This is a product-visible change to the authoring contract, made for
  the harness; the reviewer was asked to judge it explicitly.
- **The admin locale preference defect was fixed in a fifth phase.** The Phase 3 and Phase 4
  reports recorded it as debt; FR-8 says a defect the suite legitimately exposes is fixed in this
  track, so Phase 5 fixed it in the app and covered it with a unit and a browser regression test.
- **The `expect() calls` counter in the unit suite wobbles by one** between runs of the same tree
  (933 / 934 / 933) while the outcomes stay 421 pass / 0 fail. The wobble is pre-existing and
  outside this track; it is flagged for the reviewer.
- **The e2e layer now has a signal.** On `main` the suite failed 16 / 31 with every failure a
  `page.goto` timeout, and no track could use it as evidence. It is now green and repeatable, and
  the next reader-facing track inherits a working layer.

## Evidence paths

- `conductor/tracks/20261022-e2e-production-harness/verification/phase-1.md` .. `phase-5.md` — the
  per-phase reports, each with the primary's own verification section
- `conductor/tracks/20261022-e2e-production-harness/verification/integrated.md` — this file
- `conductor/tracks/20261022-e2e-production-harness/review.md` — the review record
- `conductor/tracks/20261022-e2e-production-harness/pr.md` — the pull request body
