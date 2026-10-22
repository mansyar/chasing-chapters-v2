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
- **Status:** pending

- [ ] **P4.T1: Add the e2e CI job** — covers: FR-7
  - [ ] **P4.T1.1: Wire the job** — in `.github/workflows/ci.yml`, a new job installs Chromium, starts the postgres and redis services, applies the schema, builds the app, and runs the same `bun run test:e2e` command. The existing `Typecheck, Lint, Test, Build` job and its name stay unchanged.
  - [ ] **P4.T1.2: Verify the workflow file** — the YAML parses, the job's steps are correct, and the required check name is untouched.
- [ ] **P4.T2: Document and close out** — covers: FR-7
  - [ ] **P4.T2.1: Document how to run the suite** — `README.md` gains the local e2e steps (services, build, credentials, worker cap).
  - [ ] **P4.T2.2: Run the full gate** — typecheck, lint, unit tests, production build and the e2e suite, recorded as the phase evidence.

<!--
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261022-e2e-production-harness/verification/phase-4.md
-->
