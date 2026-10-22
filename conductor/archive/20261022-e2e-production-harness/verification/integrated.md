# Integrated Verification: 20261022-e2e-production-harness

- **Track**: 20261022-e2e-production-harness — "E2E Production Harness"
- **Date**: 2026-10-22
- **Branch**: `chore/20261022-e2e-production-harness`
- **Base**: `9287be692520efb10254aac7b53b4c0620f69689` (the merge of the previous track)
- **Head**: `7acef44` — "conductor(plan): Mark phase 'Review Fixes (round 2)' as complete"
- **Result**: **Verified.** Every configured layer is green on the track branch, at the head of the
  two review-fix phases.

## Commands

Run in one pass on the track branch, at the final head:

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors |
| static | `bun run lint` | 0 | `biome check .` — no fixes applied (this command also runs Biome's formatter as a diagnostic, so it covers the format check) |
| unit | `bun test --coverage` | 0 | **436 pass / 0 fail** across 35 files; coverage **85.17% funcs / 88.92% lines** overall (the configured gate is 80% on new code) |
| static | `bun run build` | 0 | `next build --webpack` succeeds — 15/15 static pages in 39.1s (the `google-gax` resolution warning is pre-existing) |
| e2e | `bun run test:e2e` | 0 | create database -> check Redis -> apply schema -> seed -> build -> serve the standalone artifact -> `Running 41 tests using 3 workers` -> **41 passed (2.2m)**, 0 failed, 0 skipped |

`bun run test:e2e` is the whole e2e command: `src/scripts/e2e-run.ts` creates the e2e database,
probes Redis, applies the schema, seeds the fixture, builds the app, and runs Playwright against
the standalone artifact on port 3100.

### Coverage of the logic-bearing files this track added or changed

| File | % Funcs | % Lines |
| --- | --- | --- |
| `src/lib/translate.ts` (the offline test-mode stub) | 100.00 | 100.00 |
| `src/hooks/revalidatePages.ts` (the guarded revalidation) | 100.00 | 100.00 |
| `src/lib/e2e-harness.ts` (the worker, port, database and readiness resolvers, and the fixture dataset) | 92.31 | 97.81 |
| `src/lib/retranslate.ts` (the bulk re-translate runner) | 100.00 | 92.02 |
| `src/components/admin/bulk-retranslate.ts` (the bulk outcome helpers) | 100.00 | 100.00 |

The uncovered lines in `src/lib/e2e-harness.ts` are the defensive branches of the database-URI
parser (an unparsable URI, a URI without a database name). The orchestrators
(`src/scripts/e2e-run.ts`, `src/scripts/e2e-database.ts`, `src/scripts/e2e-redis.ts`) are not
imported by a unit test and so do not appear in the coverage report at all: the e2e run itself is
their test, and it exercises every step of them.

`src/collections/Authors.ts` sits at 82.98% lines and `src/collections/Reviews.ts` at 76.96%: the
uncovered lines are the collections' admin configuration, which the unit suite does not execute. The
two behaviours this track changed in those files are covered elsewhere — the afterLogin hook by
`src/collections/__tests__/Authors.test.ts` (four cases, three of which fail against the pre-fix
code) and the restored `coverImage` requirement by `src/collections/__tests__/Reviews.test.ts`.

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
| AC-1 — the suite is served from a production build and the run is green | pass | `playwright.config.ts` starts the standalone artifact (`.next/standalone/server.js`) on port 3100 and `bun run test:e2e` builds first; 41 passed |
| AC-2 — three workers by default, one in CI, `PLAYWRIGHT_WORKERS` overrides | pass | `resolveWorkerCount` in `src/lib/e2e-harness.ts` + `src/lib/__tests__/e2e-harness.test.ts`; the run log says "Running 41 tests using 3 workers" |
| AC-3 — the fixture is idempotent | pass | two consecutive full runs seeded the same database with the same identifiers; the identifiers are pinned by `src/lib/__tests__/e2e-harness.test.ts`, and the fixture's cover document is repaired in place so the media row count and id stay stable |
| AC-4 — no spec is skipped for missing data | pass | 0 skipped in every run; the data-dependent `test.skip` and the tautological assertion were removed |
| AC-5 — the three admin surfaces assert a visible outcome | pass | the three admin specs plus the locale-preference spec; the assertions are on the bell's label and links, the bulk action's per-review rows and the edit view's status and toast |
| AC-6 — no outbound provider request and no credential present | pass | the e2e section of the run log contains no `Google Cloud`, `Initializing Google`, `quota`, `credentials` or `Translation failed` line; the stub is reached through the explicit `TRANSLATION_TEST_MODE=1` flag |
| AC-7 — CI gains a job and the required check name is unchanged | pass | `.github/workflows/ci.yml` gains the `e2e` job; the workflow diff is 85 insertions and 0 deletions, so the existing job is untouched |
| AC-8 — every app defect the suite proves is fixed with a regression test | pass | the revalidation rollback and the restored `coverImage` requirement have unit regression tests; the admin locale preference has both a unit and a browser regression test |

## Deviations and notes

- **The bulk-action surface is not a Payload list-view bulk action.** Payload 3.90 hardcodes the
  list view's bulk actions and the only injection point is the root `src/collections/Reviews.ts`,
  which the plan puts out of scope for that phase. The action is therefore a component on the
  reviews admin path. The spec's FR-4 and AC-4 were amended to match what shipped.
- **The `media` collection was left alone.** The first delivery added
  `upload.filesRequiredOnCreate: false`; the primary rejected it and had it reverted, because it
  weakens a production invariant, every cover render site is already guarded by `coverImage?.url`
  so it bought nothing, and it was outside the spec's scope.
- **`coverImage` on Reviews is required again.** The review round 1 judged the optional cover a
  product-visible change made for the harness; the fix phase gave the fixture a real cover instead
  and restored the requirement.
- **The suite runs against a database of its own.** `src/lib/e2e-harness.ts` derives the e2e
  database from the ambient `DATABASE_URI` (the name gets an `_e2e` suffix), `src/scripts/e2e-database.ts`
  creates it and never drops it, and the orchestrator refuses to run when the ambient connection
  string and the resolved one disagree. The developer's own reviews, taxonomy and media are never
  read, written or deleted.
- **The schema of the e2e database comes from Payload's development-mode push.** The migration step
  answers Payload's drift prompt automatically; the migrations themselves are applied only when the
  database is new, because drizzle skips the ones it has already recorded. The README states this
  plainly.
- **The storage adapter is selectable.** `STORAGE_ADAPTER` picks `s3` (the default, the production
  path) or `local` (Payload's own disk storage, which the e2e run uses so the fixture's cover needs
  no object storage). The switch is listed in `.env.example` and in the tech stack.
- **Redis is a hard prerequisite of the run.** `src/scripts/e2e-redis.ts` probes it before the first
  step and the run stops with a message that names the variable; without it the app degrades to no
  cache and the rate limit the comment spec depends on would change behaviour.
- **The admin locale preference defect was fixed in a fifth phase.** The Phase 3 and Phase 4
  reports recorded it as debt; FR-8 says a defect the suite legitimately exposes is fixed in this
  track, so Phase 5 fixed it in the app and covered it with a unit and a browser regression test.
- **The `expect() calls` counter in the unit suite wobbles by one** between runs of the same tree
  while the outcomes stay 436 pass / 0 fail. The wobble is pre-existing and outside this track; the
  review could not reproduce it either.
- **The e2e layer now has a signal.** On `main` the suite failed 16 / 31 with every failure a
  `page.goto` timeout, and no track could use it as evidence. It is now green and repeatable, and
  the next reader-facing track inherits a working layer.

## Evidence paths

- `conductor/tracks/20261022-e2e-production-harness/verification/phase-1.md` .. `phase-5.md`,
  `phase-R1.md`, `phase-R2.md` — the per-phase reports, each with the primary's own verification
  section
- `conductor/tracks/20261022-e2e-production-harness/verification/integrated.md` — this file
- `conductor/tracks/20261022-e2e-production-harness/review.md` — the review record (three rounds)
- `conductor/tracks/20261022-e2e-production-harness/pr.md` — the pull request body
