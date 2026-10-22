# E2E Production Harness - Implementation Plan

> **Branch:** `chore/20261022-e2e-production-harness`
> **Base:** `main` @ `9287be692520efb10254aac7b53b4c0620f69689`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

> **Why the pure e2e helpers live under `src/`:** `bunfig.toml` sets
> `[test] root = "./src"`, so `bun test` never collects a test file outside
> `src/` - a unit test under `e2e/` would never run. The shared pure helpers
> (worker count, port, dataset identifiers) therefore live in
> `src/lib/e2e-harness.ts` with their unit test beside them, and the Playwright
> configuration and the global setup import them. The Playwright config keeps
> `testDir: "./e2e"`, so the two runners never see each other's files.

## Phase 1: Production-Build Harness and Bounded Workers

- **Goal:** The e2e suite serves the app from a production build and runs with a bounded worker count.
- **Depends on:** none
- **Covers:** FR-1, FR-2, AC-1, AC-2, NFR-1, NFR-5
- **Touches:** `playwright.config.ts`, `package.json`, `src/lib/e2e-harness.ts` (new), `src/lib/__tests__/e2e-harness.test.ts` (new)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e e2e/feed.spec.ts`
- **Status:** verified

- [x] **P1.T1: Serve the suite from a production build** — covers: FR-1
  - [x] **P1.T1.1: Point the Playwright web server at a production server** — `next start` on a dedicated port (3100, overridable), with `baseURL` matching and no reuse of a foreign server on that port.
  - [x] **P1.T1.2: Build before the suite** — `bun run test:e2e` runs `bun run build` and then `bunx playwright test`; raise the web server start timeout to cover a cold production start, and fail loudly when the build is missing or fails rather than serving stale code.
- [x] **P1.T2: Bound the worker count** — covers: FR-2
  - [x] **P1.T2.1: Resolve the worker count in one place** — `src/lib/e2e-harness.ts` exports `resolveWorkerCount(env)`: 3 by default, `PLAYWRIGHT_WORKERS` override, 1 when `CI` is set; wire it into `playwright.config.ts` (import the module by relative path).
  - [x] **P1.T2.2: Prove the resolution** — `src/lib/__tests__/e2e-harness.test.ts` (a bun unit test) asserts 3 by default, 1 in CI, and the env override.

**Result:** verified
**Checkpoint:** c6ffbdc
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-1.md

## Phase 2: Deterministic Fixture and Green Public Suite

- **Goal:** The public specs run against a known dataset and the whole public suite is green.
- **Depends on:** Phase 1
- **Covers:** FR-3, FR-4, FR-8, AC-3, AC-4, AC-8, NFR-2, NFR-4
- **Touches:** `src/lib/e2e-harness.ts` (extend with the dataset definition), `src/lib/__tests__/e2e-harness.test.ts` (extend with the dataset assertions), `e2e/global-setup.ts` (new), `e2e/homepage.spec.ts`, `e2e/navigation.spec.ts`, `e2e/review-detail.spec.ts`, `e2e/comments.spec.ts`, `e2e/feed.spec.ts`, `e2e/sort.spec.ts`, `playwright.config.ts` (register the global setup - Phase 1's changes are already on the branch), `package.json` (add the `seed:e2e` script and order it **before** the build, so the prerendered pages carry the fixture's data)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run test:e2e`
- **Status:** verified

- [x] **P2.T1: Build the e2e dataset fixture** — covers: FR-3
  - [x] **P2.T1.1: Define the dataset as pure data** — `src/lib/e2e-harness.ts` holds the fixed identifiers (the author/admin with the fixed test-only credential, review slugs, a reading list, a featured review, and reviews in the `translated`, `failed` and `stale` states); the unit test asserts the identifiers are stable across calls.
  - [x] **P2.T1.2: Upsert the dataset** — `e2e/global-setup.ts` writes it through the Payload local API, matching on the fixed identifiers (create or update) and never deleting or altering rows it does not own.
  - [x] **P2.T1.3: Run the fixture before the suite** — register the global setup in `playwright.config.ts`.
- [x] **P2.T2: Make the public specs deterministic** — covers: FR-4, FR-8
  - [x] **P2.T2.1: Replace the conditional assertions** — "when lists exist", "when featured reviews exist" and "when available" become unconditional assertions against the fixture's data.
  - [x] **P2.T2.2: Fix every remaining failure** — harness-side fixes stay in the harness; a genuine app defect is fixed in the app with a regression test.

**Result:** verified
**Checkpoint:** fff8ab1
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-2.md

## Phase 3: Test-Mode Provider Stub and Admin DOM Specs

- **Goal:** The three admin translation surfaces have browser coverage, and the pipeline completes under test without touching the external provider.
- **Depends on:** Phase 2
- **Covers:** FR-5, FR-6, AC-5, AC-6, NFR-2
- **Touches:** `src/lib/translate.ts`, `src/lib/__tests__/translate-test-mode.test.ts` (new), `e2e/fixtures/admin-session.ts` (new), `e2e/admin/translation-poller.spec.ts` (new), `e2e/admin/attention-bell.spec.ts` (new), `e2e/admin/bulk-retranslate.spec.ts` (new), `playwright.config.ts` (set the test-mode environment for the web server)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **P3.T1: Add the env-gated provider stub** — covers: FR-6
  - [x] **P3.T1.1: Stub the provider under an env flag** — in `src/lib/translate.ts`, a test-mode branch (e.g. `TRANSLATION_TEST_MODE=1`) returns a deterministic translated payload without calling the external API: no credentials, no network, no quota.
  - [x] **P3.T1.2: Run the app under test in test mode** — set the variable in the Playwright web server environment.
  - [x] **P3.T1.3: Prove the flag's reach** — a bun unit test asserts the stub is active only when the variable is set and the normal path is untouched otherwise.
- [x] **P3.T2: Cover the three admin surfaces** — covers: FR-5
  - [x] **P3.T2.1: Provide an authenticated admin session** — `e2e/fixtures/admin-session.ts` logs in at `/admin` with the fixture's author/admin credentials and exposes the authenticated context.
  - [x] **P3.T2.2: Spec the edit view** — open a review, let the poller run, assert the status transitions and the success/failure toast appears.
  - [x] **P3.T2.3: Spec the attention bell** — open the indicator, assert the count and that each listed review links to its document.
  - [x] **P3.T2.4: Spec the bulk re-translate action** — assert the candidate list, select reviews, run, and assert the per-review outcome rows.

**Result:** verified
**Checkpoint:** 0712969
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-3.md

## Phase 4: CI Job and Final Verification

- **Goal:** The suite runs in CI alongside the existing required check, and the track is verified end to end.
- **Depends on:** Phase 3
- **Covers:** FR-7, AC-7, NFR-3
- **Touches:** `.github/workflows/ci.yml`, `README.md`, `e2e/` (only if the CI runner needs a runner-specific adjustment)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build && bun run test:e2e`
- **Status:** verified

- [x] **P4.T1: Add the e2e CI job** — covers: FR-7
  - [x] **P4.T1.1: Wire the job** — in `.github/workflows/ci.yml`, a new job installs Chromium, starts the postgres and redis services, applies the schema, builds the app, and runs the same `bun run test:e2e` command. The existing `Typecheck, Lint, Test, Build` job and its name stay unchanged.
  - [x] **P4.T1.2: Verify the workflow file** — the YAML parses, the job's steps are correct, and the required check name is untouched.
- [x] **P4.T2: Document and close out** — covers: FR-7
  - [x] **P4.T2.1: Document how to run the suite** — `README.md` gains the local e2e steps (services, build, credentials, worker cap).
  - [x] **P4.T2.2: Run the full gate** — typecheck, lint, unit tests, production build and the e2e suite, recorded as the phase evidence.

**Result:** verified
**Checkpoint:** 4dd1ee3
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-4.md

## Phase 5: Fix the Admin Locale Preference Defect

- **Goal:** The admin's locale preference is actually stored. The defect the suite surfaced is fixed in the app and covered by a regression test, so the suite proves the fix instead of logging a failure on every login.
- **Depends on:** Phase 3
- **Covers:** FR-8, AC-8
- **Touches:** `src/collections/Authors.ts`, `src/collections/__tests__/Authors.test.ts` (new), `e2e/admin/locale-preference.spec.ts` (new), `e2e/fixtures/admin-session.ts`, `playwright.config.ts` (register the new admin spec's project)
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **P5.T1: Fix the preference write** - covers: FR-8
  - [x] **P5.T1.1: Pass the authenticated user to the Local API call** - in `src/collections/Authors.ts`, the `setDefaultLocalePreference` afterLogin hook writes the `payload-preferences` document through the Local API without a user context. Payload's own `beforeValidate` hook on that field overwrites the submitted value from `req.user` and returns `null` when there is none, so the required field fails validation with "This field is required." (400) and the preference is never stored. Pass the authenticated user to the Local API call so `req.user` is set, and let Payload's hook fill the field. The shipped fix also passes the login's `req`: without it the write deadlocks against the login transaction, because the preferences collection stores its owner in `payload_preferences_rels` with a foreign key to the author, so the insert waits for the lock the login holds while the login waits for the insert. Passing `req` makes the write join the login's transaction.
  - [x] **P5.T1.2: Leave the read side alone** - the hook's `find` already runs with a request that carries the user and returns 0 documents correctly; only the create path is broken.
- [x] **P5.T2: Cover the fix** - covers: AC-8
  - [x] **P5.T2.1: Add the unit regression test** - a bun unit test asserts the afterLogin hook creates the preference with the authenticated user. The assertion fails against the pre-fix code, which omits it.
  - [x] **P5.T2.2: Add the browser regression test** - an admin spec logs in and asserts the preference is readable afterwards (`GET /api/payload-preferences/locale` returns the stored value), so the fix is proven end to end through the real login path.

**Result:** verified
**Checkpoint:** 4e726eb
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-5.md

## Phase R1: Review Fixes (round 1)

- **Goal:** The harness no longer depends on the state of the developer's database, the production authoring contract is intact, and every finding the review raised is closed. The e2e run gets its own database, so the fixture owns the whole dataset and every count and window is exact; the cover image stays required, with the e2e run storing media on local disk instead of object storage.
- **Depends on:** Phase 5
- **Covers:** FR-1, FR-3, FR-4, FR-5, FR-8, AC-1, AC-3, AC-4, AC-5, AC-8, NFR-2, NFR-4
- **Touches:** `src/lib/e2e-harness.ts` (+ `src/lib/__tests__/e2e-harness.test.ts`), `src/scripts/e2e-run.ts` (new), `src/scripts/e2e-database.ts` (new), `src/lib/env.ts`, `src/payload.config.ts`, `src/collections/Reviews.ts`, `src/collections/__tests__/Reviews.test.ts`, `src/collections/Authors.ts`, `src/collections/__tests__/Authors.test.ts`, `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts`, `src/payload-types.ts` (regenerated), `e2e/global-setup.ts`, `e2e/admin/bulk-retranslate.spec.ts`, `e2e/fixtures/admin-session.ts`, `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`, `README.md`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **R1.T1: Give the e2e run its own database** - covers: FR-3, FR-4, AC-3, AC-4
  - [x] **R1.T1.1: Resolve the e2e database URI** - a pure helper in `src/lib/e2e-harness.ts` derives the e2e database name from `DATABASE_URI` (the same server, a database named `<name>_e2e`), with a unit test for the derivation, a missing URI and a URI that already points at the e2e database.
  - [x] **R1.T1.2: Create the e2e database** - a script creates it when it does not exist, using Bun's built-in Postgres client against the maintenance database. It is idempotent and never drops anything.
  - [x] **R1.T1.3: Orchestrate the whole run against the e2e database** - one script resolves the e2e URI and the storage adapter, creates the database, applies the schema, seeds the fixture, builds the app and runs Playwright, each step in a child process that inherits the resolved environment.
  - [x] **R1.T1.4: Point the web server at the e2e database** - the Playwright web server's environment carries the resolved e2e URI and the local storage adapter, so the app under test reads the same database the fixture wrote.
  - [x] **R1.T1.5: Wire the scripts** - `package.json` routes `test:e2e` (and its UI and headed variants) through the orchestrator, and the CI e2e job drops its separate migration step because the orchestrator applies the schema.
- [x] **R1.T2: Restore the cover requirement and store e2e media on local disk** - covers: FR-3, AC-8
  - [x] **R1.T2.1: Make the storage adapter selectable** - the S3 plugin is registered only when the adapter is `s3`; with the adapter set to `local` the upload collection falls back to Payload's own disk storage. The default stays `s3`, so production and local development are unchanged.
  - [x] **R1.T2.2: Give the fixture a real cover** - the fixture uploads a small generated image through the local API and attaches it, and `coverImage` on Reviews is required again.
  - [x] **R1.T2.3: Update the affected tests and types** - the generated types are regenerated and the collection test asserts the cover is required.
- [x] **R1.T3: Drop the unnecessary cast in the preference write** - covers: FR-8
  - [x] **R1.T3.1: Submit the owner in the data** - the preference write carries the owner in its data again, so the generated type is satisfied without an assertion, and the assertion is removed.
- [x] **R1.T4: Narrow the revalidation guard** - covers: FR-3
  - [x] **R1.T4.1: Rethrow what is not the out-of-scope invariant** - the guard swallows only the static-generation-store error that occurs outside a request scope and rethrows anything else, with a test for both branches.
- [x] **R1.T5: Give the translated fixture reviews Indonesian content** - covers: FR-3, NFR-4
  - [x] **R1.T5.1: Seed the Indonesian locale** - the two reviews the fixture declares as translated carry their Indonesian content, and a unit test asserts that a review declared translated always carries it.
- [x] **R1.T6: Select the fixture's own candidates in the bulk spec** - covers: FR-5, AC-5
  - [x] **R1.T6.1: Tick the fixture's rows** - the bulk action spec ticks the two fixture reviews individually instead of selecting everything, so it proves the selection is per review.
- [x] **R1.T7: Serve the production artifact, or record the divergence** - covers: FR-1, AC-1
  - [x] **R1.T7.1: Try the standalone server** - the web server runs the standalone build the Docker image runs, with the static assets copied. If it cannot be made to work within the phase's budget, keep `next start` and record the divergence in the evidence for the primary to amend the spec.

**Result:** verified
**Checkpoint:** 3c46191
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-R1.md

## Phase R2: Review Fixes (round 2)

- **Goal:** The five remaining findings of review round 2 are closed: the fixture repairs its cover instead of duplicating it, the documentation tells the truth about the e2e database, the environment template lists the new storage switch, and the harness fails fast when Redis is unreachable.
- **Depends on:** Phase R1
- **Covers:** FR-3, FR-8, NFR-2, AC-3
- **Touches:** `e2e/global-setup.ts`, `src/scripts/e2e-run.ts`, `src/scripts/e2e-redis.ts` (new), `src/lib/e2e-harness.ts` (+ `src/lib/__tests__/e2e-harness.test.ts`), `README.md`, `.env.example`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** in_progress

- [ ] **R2.T1: Repair the fixture's cover instead of duplicating it** - covers: FR-3, AC-3
  - [ ] **R2.T1.1: Update the media document in place** - when the fixture's media document exists but its file is missing on disk, the fixture updates that document with the file instead of creating a second one, so the media row count and id stay stable across runs.
  - [ ] **R2.T1.2: Cover the repair path** - a test asserts that seeding twice with the file removed in between leaves the media row count and the id unchanged.
- [ ] **R2.T2: Tell the truth about the e2e database** - covers: FR-3
  - [ ] **R2.T2.1: Correct the README** - the e2e database paragraph states that the schema is rebuilt from the migrations on every run, so whatever the database held is discarded, while nothing outside it is read or written.
- [ ] **R2.T3: List the storage switch in the environment template** - covers: FR-8
  - [ ] **R2.T3.1: Add `STORAGE_ADAPTER` to `.env.example`** - the template names the two adapters and says which one is the default.
- [ ] **R2.T4: Fail fast when Redis is unreachable** - covers: NFR-2
  - [ ] **R2.T4.1: Add a Redis readiness probe** - the orchestrator pings Redis before it seeds, and exits with a clear message when Redis is not reachable, instead of letting the run continue with the app silently degraded to no cache.
  - [ ] **R2.T4.2: Cover the probe** - a unit test asserts the message the probe produces when Redis is unreachable.

<!--
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-R2.md
-->
