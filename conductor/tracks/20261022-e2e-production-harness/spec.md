# E2E Production Harness - Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

The end-to-end layer currently delivers no signal: `playwright.config.ts` starts
`next dev` and lets Playwright pick its own worker count (50% of the machine's
logical CPUs), so every spec that loads a page times out on `page.goto` - and
fails identically on `main` and on feature branches. The suite also runs against
a database that holds no reviews, no author and no reading lists, so its
data-dependent specs assert nothing. This track replaces the harness with a
production-build harness on a fixed 3-worker cap, adds a dedicated fixture that
guarantees a known dataset, makes the public specs deterministic, and adds
browser coverage for the three admin translation surfaces that currently have
none.

## Problem / Motivation

- The e2e layer is red on `main` (16 failed / 15 passed, every failure a
  `page.goto` timeout while direct requests return HTTP 200). A layer that is
  always red cannot distinguish a regression from noise, so no track may use it
  as evidence.
- The merged translation track recorded the missing admin/DOM harness as its
  only open debt: the status poller, the attention bell and the bulk
  re-translate action are covered by unit tests over pure logic only.
- The workflow's e2e layer applies to user-facing phases. The next planned track
  (site-wide UI localization) is reader-facing, and would inherit this blind
  spot unless the layer is fixed first.
- The seed script only creates genres, tags and mood tags. With no reviews, no
  author and no reading lists, specs like "should display reading lists section
  when lists exist" and "should display featured hero when featured reviews
  exist" cannot fail and cannot pass.

## Goals & Success Metrics

- **Goal:** A reliable e2e layer that runs against a production build on a
  bounded worker count, over a known dataset, and gives the admin translation
  surfaces browser-level coverage.
- **Metric:** `bun run test:e2e` completes with zero failures and no spec
  skipped for missing data, on a developer machine at the 3-worker cap; the
  same command runs in the new CI job.

## Scope

### In Scope

- A Playwright harness that serves a **production build** (`next build` +
  `next start`) instead of an on-demand compiling dev server.
- A **fixed worker cap** (3 by default on a developer machine, overridable via
  `PLAYWRIGHT_WORKERS`, 1 in CI) so the suite never occupies the machine's full
  logical CPU count.
- A **dedicated e2e fixture** that upserts a known dataset: a test
  author/admin with a fixed test-only credential, published reviews with content
  and structured sections, a reading list, a featured review, and reviews in the
  `translated`, `failed` and `stale` translation states.
- **Deterministic public specs**: the conditional specs assert against the
  fixture instead of skipping.
- **Admin DOM specs** for the three translation surfaces: the edit-view status
  poller and its toast, the attention bell, and the bulk re-translate action
  (candidate list, selection, run, per-review outcomes).
- A **test-mode provider stub** so the translation pipeline completes
  deterministically in specs - no external API call, no quota, no credentials,
  no network.
- A **CI job** in `.github/workflows/ci.yml` running the same suite alongside
  the existing required check.
- **Fixing app defects** the suite legitimately exposes, each with a
  regression test.

### Out of Scope

- Making e2e a **required check** - the required check stays
  `Typecheck, Lint, Test, Build`; no branch-protection change.
- A broad admin smoke set (login, list, edit, save) beyond the three
  translation surfaces.
- Rewriting the public suite from scratch - the existing specs keep their
  intent.
- Product features, reader-facing changes, UI localization, or any other
  reader-visible behaviour change.
- Runtime behaviour changes beyond an env-gated test-mode branch and defects
  the suite proves.
- Browsers other than Chromium.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | The e2e suite runs against a production build: `bun run test:e2e` builds the app (or reuses a current build) and serves it with `next start`. No spec runs against an on-demand compiling dev server. | must |
| FR-2 | The suite executes with a fixed worker cap of 3 by default on a developer machine, overridable with `PLAYWRIGHT_WORKERS`; CI runs with 1 worker. The suite never occupies the machine's full logical CPU count. | must |
| FR-3 | A dedicated e2e fixture creates a known dataset - one test author/admin with a fixed test-only credential, published reviews with content and structured sections, a reading list, a featured review, and reviews in the `translated`, `failed` and `stale` translation states - by idempotent upsert, so it is safe against a populated database and deterministic against an empty one. | must |
| FR-4 | The existing public specs assert against the fixture: a spec no longer skips because lists or featured reviews "exist" - the fixture guarantees the data, so the assertion is unconditional. | must |
| FR-5 | The admin translation surfaces have browser coverage: the edit view polls the translation status and raises a success/failure toast; the attention bell lists the reviews that need attention and links to their document; the bulk re-translate action lists the failed/stale candidates, runs a selection, and reports a per-review outcome. | must |
| FR-6 | Under test, the translation provider is a deterministic stub - the pipeline completes without calling the external translation API, consuming no quota, requiring no credentials, and touching no network. | must |
| FR-7 | A CI job runs the same e2e suite (with the fixture and the schema applied) alongside the existing required `Typecheck, Lint, Test, Build` check; the required check and the branch-protection rule are unchanged. | must |
| FR-8 | A defect the suite legitimately exposes in the app is fixed in this track and covered by a regression test, so the suite is not weakened to stay green. | should |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | The suite does not consume the machine's full CPU: at most 3 browser workers plus one app server, leaving headroom for Postgres, Redis and the app. |
| NFR-2 | The fixture and the test-mode provider stub touch only test environments: no production data is read or written, no real credentials are used, and no GitHub secrets are required. |
| NFR-3 | The existing checks stay green: typecheck 0 errors, lint 0 errors/warnings, all unit tests pass, and the production build succeeds. |
| NFR-4 | The suite is deterministic - the same commit and the same fixture produce the same result; no spec depends on wall-clock timing or on a background server's compile latency. |
| NFR-5 | The harness change stays small and legible: the Playwright configuration and the fixture are the only new moving parts in the repo's test tooling. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | `bun run test:e2e` serves the app from a production build (the Playwright `webServer` starts `next start`, not `next dev`) and the run completes with zero failures. | FR-1 |
| AC-2 | The resolved worker count is 3 locally and 1 in CI, and `PLAYWRIGHT_WORKERS=5 bun run test:e2e` resolves to 5. | FR-2 |
| AC-3 | Running the fixture twice leaves the same row count and the same identifiers; it creates the test author with the fixed test credential plus reviews in the `translated`, `failed` and `stale` states. | FR-3 |
| AC-4 | No public spec reports itself skipped for missing data; the reading-lists, featured-hero and structured-sections assertions execute against the fixture's data. | FR-4 |
| AC-5 | The three admin surfaces have specs that log in, act, and assert the visible outcome (a toast, a bell list, a per-review outcome row). | FR-5 |
| AC-6 | The suite completes with no outbound request to the translation API and no provider credential present; the stubbed pipeline produces a `translated` outcome in the recorded state. | FR-6 |
| AC-7 | `ci.yml` contains an e2e job running the same command, and the existing `Typecheck, Lint, Test, Build` job and its name are unchanged. | FR-7 |
| AC-8 | Any app defect fixed in this track has a regression test that fails before the fix and passes after. | FR-8 |

## Edge Cases

- **Stale build:** the harness must not serve an old `.next` build - the build is
  refreshed, or the run fails loudly rather than testing stale code.
- **Port already in use:** a foreign server on port 3000 must not be silently
  reused; only a production `next start` may be reused, otherwise the run
  fails.
- **Empty database:** the fixture provides everything the specs need; no spec
  depends on rows that pre-exist.
- **Populated database:** the fixture must not delete or alter the developer's
  own reviews, and the specs must still pass.
- **Postgres or Redis unavailable:** the run fails fast with a clear message
  instead of a timeout cascade.
- **Leftover state between runs:** a spec that mutates fixture data (a bulk
  re-translate, a status change) must leave the fixture's expectations intact,
  so a second run is as green as the first.
- **Browser state:** each test gets a clean context, so a previous spec's login
  or locale cannot leak into the next.

## Dependencies

- **Tracks:** none - the translation track (20261021-translation-pipeline-reliability) is merged, and its admin surfaces are the subject of the new specs.
- **External:** PostgreSQL 16 and Redis (already in `docker compose` and the CI workflow), and a Chromium build for Playwright (`bunx playwright install chromium`).

## Open Questions & Assumptions

- **Assumption:** the CI e2e job is added and expected to work, but the track's completion gate is the green local run; if the CI runner cannot execute the job (browser install, service timing), that is recorded as a known gap rather than a blocker.
- **Assumption:** the test-mode provider stub is an env-gated branch in the translation client (for example `TRANSLATION_TEST_MODE=1` selects a deterministic stub), inactive unless the env var is set.
- **Assumption:** the fixture writes to the same database the app uses (the existing `DATABASE_URI`), upserting only its own rows.
- **Question:** should the e2e job also run in the deploy pipeline? Assumed no - the CI job is the single place it runs.
- **Assumption:** the fixed test credential is a throwaway value committed in the repo (for example `e2e-admin@example.test` with a fixed password), safe because the account exists only in test environments.
- **Assumption:** the suite stays Chromium-only; no new browser projects.

## References

- `conductor/archive/20261021-translation-pipeline-reliability/review.md` - the recorded debt (no DOM/admin e2e harness) and the "e2e layer - why this is not a track finding" investigation.
- `playwright.config.ts`, `e2e/*.spec.ts`, `src/scripts/seed.ts` - the harness, the current specs and the current seed.
