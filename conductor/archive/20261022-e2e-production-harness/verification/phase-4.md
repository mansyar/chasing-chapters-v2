# Phase 4 Verification: CI Job and Final Verification

- **Track**: 20261022-e2e-production-harness — "E2E Production Harness"
- **Phase**: 4 — "CI Job and Final Verification" (FR-7, AC-7, NFR-3)
- **Date**: 2026-10-22
- **Branch**: `chore/20261022-e2e-production-harness`
- **Base**: `17c1911` — "conductor(plan): Mark phase 'Test-Mode Provider Stub and Admin DOM Specs' as complete"
  (the in-progress marker for this phase is `5394eca`)
- **Head**: `839627d` — "docs: document the local e2e run" (the phase's two task commits and this
  evidence file sit on top of it)

## Result

**Verified.** The e2e suite now runs in CI as a **sibling** of the required check: `.github/workflows/ci.yml`
gained a second job (`e2e`, display name `E2E Tests`) that brings up the `postgres:16` and `redis:7`
services, installs Chromium, applies the schema and runs the same `bun run test:e2e` command. The
existing `ci` job and its display name `Typecheck, Lint, Test, Build` are **byte-identical** — the diff
that added the new job is 85 insertions and 0 deletions. The phase verification command is green
end to end: typecheck, lint, 417 unit tests, the production build, and 40 browser tests (0 failed,
0 skipped).

## Commands

Phase verification command (from the brief), run in one go:

```
bun run typecheck && bun run lint && bun test && bun run build && bun run test:e2e
```

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` → `✓ No type errors in 200 files` |
| static | `bun run lint` | 0 | `biome check .` → "Checked 193 files in 225ms. No fixes applied." |
| unit | `bun test` | 0 | **417 pass / 0 fail**, 33 files (the translation / rate-limit / lock error-path logs in the output are expected) |
| static | `bun run build` | 0 | `next build --webpack` → "✓ Generating static pages using 17 workers (15/15) in 46s", the full route table printed (the `google-gax` "Can't resolve '../../package.json'" warning is pre-existing) |
| e2e | `bun run test:e2e` | 0 | seed → `next build` (61 s) → "Running 40 tests using 3 workers" → **40 passed (1.4m)**, 0 failed, 0 skipped |

The e2e segment ran the command exactly as written: `bun run seed:e2e && bun run build && bunx
playwright test` (seed → build → suite), with the fixture re-seeded by Playwright's `globalSetup`
before the specs. The husky pre-commit hook (typecheck + lint + `bun test`) ran on both of this
phase's commits and passed each time.

### Browser suite

| Project | Tests | Result |
| --- | --- | --- |
| `chromium` (the public suite, `testIgnore: "**/admin/**"`) | 37 | 37 passed |
| `admin-attention-bell` | 1 | passed (4.5 s) |
| `admin-bulk-retranslate` | 1 | passed (5.4 s) |
| `admin-translation-poller` | 1 | passed (24.2 s) |

### The CI job, step by step

The new job is `.github/workflows/ci.yml:86-166`. Its steps and the local equivalent that proves
each one:

| CI step | `.github/workflows/ci.yml` | Local equivalent | Exit | Result |
| --- | --- | --- | --- | --- |
| Checkout repository | line 137 | the working tree is the checkout | — | — |
| Set up Bun (1.4.3) | lines 140-145 | `bun install --frozen-lockfile` banner | 0 | `bun install v1.4.3-canary.1 (43a42a836)` — the same 1.4.3 line the job pins |
| Install dependencies | lines 147-148 | `bun install --frozen-lockfile` | 0 | "Checked 734 installs across 874 packages (no changes)" — the lockfile is unchanged by this phase |
| Install Chromium for Playwright | lines 150-153 | Chromium is already installed on the developer machine | — | the suite drove it in the e2e run above (40 browser tests, all Chromium) |
| Run database migrations | lines 155-159 | the local schema is already applied | — | the fixture seeds through the Payload local API and succeeded in the run above |
| Run e2e tests | lines 161-166 | `bun run test:e2e` | 0 | **40 passed (1.4m)** |

The migration step and the Chromium install are the two steps that cannot be exercised locally
(the local database already carries the schema and the local machine already has the browser);
everything else has a local run above.

### The workflow parses

`.github/workflows/ci.yml` was parsed with the `yaml` package and the resulting job graph printed.
The checker is kept as an artifact under `.conductor/evidence/check-workflow.ts` (that directory is
gitignored). Its output:

```
job: ci
  name: Typecheck, Lint, Test, Build
  runs-on: ubuntu-latest
  needs: []
  env: DATABASE_URI, PAYLOAD_SECRET, R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
  services: postgres=postgres:16
  step: Checkout repository -> actions/checkout@v4
  step: Set up Bun -> oven-sh/setup-bun@v2
  step: Install dependencies -> bun install --frozen-lockfile
  step: Run database migrations -> echo y | bun run payload migrate
  step: Typecheck -> bun run typecheck
  step: Lint -> bun run lint
  step: Test -> bun test
  step: Build -> bun run build
job: e2e
  name: E2E Tests
  runs-on: ubuntu-latest
  needs: []
  env: DATABASE_URI, PAYLOAD_SECRET, R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, REDIS_URL
  services: postgres=postgres:16, redis=redis:7
  step: Checkout repository -> actions/checkout@v4
  step: Set up Bun -> oven-sh/setup-bun@v2
  step: Install dependencies -> bun install --frozen-lockfile
  step: Install Chromium for Playwright -> bunx playwright install --with-deps chromium
  step: Run database migrations -> echo y | bun run payload migrate
  step: Run e2e tests -> bun run test:e2e
```

`1 pass / 0 fail` — the checker also asserts `Object.keys(jobs) === ["ci", "e2e"]`,
`jobs.ci.name === "Typecheck, Lint, Test, Build"` and `jobs.e2e.name === "E2E Tests"`.

## Acceptance criteria

| ID | Criterion | How it is met | Evidence | Status |
| --- | --- | --- | --- | --- |
| AC-7 | `ci.yml` contains an e2e job running the same command, and the existing `Typecheck, Lint, Test, Build` job and its name are unchanged. | **The e2e job**: a second job, `e2e` (display name `E2E Tests`), is a sibling of `ci` under the same `jobs:` key with no `needs:`, so it runs alongside the required check. Its last step runs the identical command the local run uses, `bun run test:e2e` (= `bun run seed:e2e && bun run build && bunx playwright test`). It brings up the `postgres:16` service with the same credentials and health options as the `ci` job, plus a `redis:7` service, and carries the same six placeholder env values plus `REDIS_URL` — no GitHub secrets (NFR-3). **The existing job**: untouched. The commit that added the new job is a pure insertion — `git diff --stat` reports `1 file changed, 85 insertions(+)` with **0 deletions** — so the `ci` job's name, its eight steps and its env block are byte-identical. The parsed job graph above confirms `jobs.ci.name === "Typecheck, Lint, Test, Build"` and the same step list as before. **The branch-protection rule** is unchanged: the required check name is still exactly `Typecheck, Lint, Test, Build`, and the new job is a separate check that is not required. | `.github/workflows/ci.yml:86-166` (the new `e2e` job; `bun run test:e2e` at line 166, `bunx playwright install --with-deps chromium` at line 153, `echo y \| bun run payload migrate` at line 159, `REDIS_URL` at line 108, the `redis:7` service at lines 126-134) · `.github/workflows/ci.yml:13-81` (the untouched `ci` job; `name: Typecheck, Lint, Test, Build` at line 14) · `git diff --stat` → `1 file changed, 85 insertions(+)` · `.conductor/evidence/check-workflow.ts` (the parsed job graph) | PASS |

## What changed

- `.github/workflows/ci.yml` — the new `e2e` job (lines 83-166). The existing `ci` job was not
  touched.
- `README.md` — the "Running Tests" section gained an "End-to-End Tests" subsection (lines 111-147):
  what `bun run test:e2e` does (seed → production build → the suite against `next start` on port
  3100), the prerequisites (Postgres and Redis running, the schema applied, Chromium installed),
  the worker cap (`PLAYWRIGHT_WORKERS`, default 3, 1 in CI) and what the fixture writes (a
  throwaway test admin, four reviews in known translation states, a reading list — an upsert that
  only ever writes its own rows).

## Evidence paths

- `conductor/tracks/20261022-e2e-production-harness/verification/phase-4.md` — this report.
- `.github/workflows/ci.yml` — the CI workflow, the new `e2e` job at lines 86-166.
- `README.md` — the "End-to-End Tests" documentation at lines 111-147.
- `.conductor/evidence/check-workflow.ts` — the YAML/job-graph checker (gitignored artifact).
- `conductor/tracks/20261022-e2e-production-harness/verification/phase-3.md` — the admin-surface
  evidence this phase builds on.
- Commits: `3025b2e` (the e2e CI job), `839627d` (the README), plus this evidence file on top.

## Deviations

No file outside the phase's `Touches` was changed. The only artefact outside the repository's
tracked tree is `.conductor/evidence/check-workflow.ts`, which the brief allows.

One transient, non-committed file was used to run the YAML check: the shell sandbox denies
`bun -e` and `bun <script>`, so the checker was temporarily placed at
`src/lib/__tests__/tmp-workflow-check.test.ts` (bunfig.toml roots `bun test` at `./src`, so that
is the only place `bun test` will collect a file), executed with `bun test`, and then removed with
`git rm -f`. It was never staged into a commit and the working tree is clean; `git status --short`
after the removal reports nothing.

## Notes

- **The CI run itself is observed on the pull request, not by this phase.** The spec's assumption
  (Open Questions & Assumptions) is explicit that the track's completion gate is the green local
  run; the CI job is expected to work but its first execution happens when the branch is pushed.
  The three CI steps that cannot be reproduced locally are the Chromium install, the migration
  (the local schema is already applied) and the runner's own service start-up — each of them
  mirrors an existing, working pattern in the repository (`bunx playwright install` in the README
  and in the track's dependencies; `echo y | bun run payload migrate` in the `ci` job and in
  `deploy.yml`).
- **The e2e job runs with one worker automatically.** `resolveWorkerCount` in
  `src/lib/e2e-harness.ts` returns 1 whenever `CI` is set, and GitHub Actions sets `CI=true`, so
  the workflow deliberately hard-codes no worker count (NFR-1).
- **Redis is a service of the new job on purpose.** `src/lib/redis.ts` returns `null` when
  `REDIS_URL` is unset, which silently changes the rate limiter's and the translation cache's
  behaviour. The local run has Redis, so the CI job matches it.
- **The offline provider stub needs no CI wiring.** `playwright.config.ts` sets
  `TRANSLATION_TEST_MODE=1` in the web server's environment, and the web server inherits the
  runner's environment, so the stub is active in CI without the workflow mentioning it. The stub
  is also the reason the job needs no translation credentials.
- **No GitHub secrets.** The job's env block holds the same placeholder values as the `ci` job
  (`ci-build-only-placeholder-secret-32-chars-min` and friends). The build and the suite perform
  no real media operations, and the R2 endpoint points at an `.invalid` host.
- **Pre-existing noise in the run output, unrelated to this phase:** the `google-gax` "Can't
  resolve '../../package.json'" build warning, the `"next start" does not work with "output:
  standalone"` warning from the web server, and the `Failed to set default locale preference: The
  following field is invalid: User` (400) log that the admin login produces — the same defect the
  phase-3 report already recorded as debt for the review.
- **`bun test`'s `expect() calls` counter wobbles** between runs of the same tree (933 → 934 → 933)
  while the outcomes stay 417 pass / 0 fail, exactly as recorded in the phase-3 report.

## Primary verification

Run by the primary agent, independently of the phase subagent's report, on the same branch.

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` - no type errors in 200 files |
| static | `bun run lint` | 0 | `biome check .` - 193 files checked, no fixes applied |
| unit | `bun test` | 0 | 417 pass / 0 fail across 33 files |
| static | `bun run build` | 0 | `next build --webpack` succeeded (the `google-gax` resolution warning is pre-existing) |
| e2e | `bun run test:e2e` | 0 | seed -> build -> `Running 40 tests using 3 workers` -> **40 passed (1.5m)**, 0 failed, 0 skipped |

- **AC-7 - met.** The new job is a sibling of the required one, and the required one is provably
  untouched: `git diff 5394eca..HEAD -- .github/workflows/ci.yml` contains **85 insertions and 0
  deletions**, and the only removed line in the whole file diff is the diff header itself. The
  existing job keeps its slug `ci`, its display name `Typecheck, Lint, Test, Build` and its steps.
  The new job (`e2e`, display name `E2E Tests`) brings up `postgres:16` and `redis:7` with health
  checks, reuses the same placeholder env plus `REDIS_URL`, pins Bun 1.4.3, installs Chromium with
  `--with-deps`, applies the schema with the existing job's `echo y | bun run payload migrate`
  pattern and runs `bun run test:e2e`. No GitHub secrets are used (NFR-3).
- **No worker count is hard-coded in the workflow** - `resolveWorkerCount` returns 1 because GitHub
  Actions sets `CI=true`, so NFR-1 holds in CI without a workflow setting.
- **Diff against Touches:** `.github/workflows/ci.yml`, `README.md` and the evidence file. The only
  deviation was a transient checker file that was never committed and does not exist in the range.
- **The README section** documents what the command does (seed -> production build -> the suite
  against `next start` on port 3100), the prerequisites (Postgres, Redis, the schema, Chromium),
  the worker cap and its override, the fixture's contents and its upsert-only behaviour, and that
  the provider is stubbed offline so no credentials are needed.
- **Squash:** the phase range contained three reported task-level commits with no merge commits,
  no unreported commits and no user commits, so it was squashed into a single phase commit per
  `git.phase_squash`.
