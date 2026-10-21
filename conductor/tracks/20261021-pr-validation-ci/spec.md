# PR Validation CI — Specification

> Stable IDs: FR-1..FR-N, NFR-1..NFR-N, AC-1..AC-N are permanent. Never renumber;
> mark removed items **Withdrawn**.

## Overview

Add a GitHub Actions pull-request validation workflow and promote the Biome lint
config to strict (errors), so every PR to `main` is automatically verified by
typecheck, lint, unit tests, and a production build before it can merge. This
closes the enforcement gap behind the project's strict review policy: today the
only gates are local husky hooks (bypassable, per-machine) and `deploy.yml`,
which runs on `main` pushes only.

## Problem / Motivation

The contributor is a single developer following a strict spec-driven review
policy, but nothing server-side enforces it. Concretely:

- `deploy.yml` triggers only on `push` to `main` — during the lint-debt review
  it was confirmed PRs report **zero checks**.
- husky pre-commit runs the verification chain locally, which is machine-bound
  and skippable (`--no-verify`).

If a broken change reaches `main`, the production deploy pipeline builds and
deploys it; the first signal of breakage is a failed production build or a
broken site. The cost of not solving: broken `main` directly risks production.

## Goals & Success Metrics

- **Goal:** every PR to `main` is verified automatically and cannot merge while
  red.
- **Metric:** 100% of PRs to `main` show a passing required CI check before
  merge; CI completes in ≤ 5 minutes.
- **Goal:** the clean lint baseline (0 warnings / 0 errors) is structurally
  enforced, not just achieved.
- **Metric:** Biome reports 0 findings at error severity repo-wide after the
  config change.

## Scope

### In Scope

- New workflow `.github/workflows/ci.yml` triggered on `pull_request`
  targeting `main`.
- Single CI job running: `bun install`, `bun run typecheck`, `bun run lint`,
  `bun test`, `bun run build`.
- Postgres service container for the build job (prerendering queries the DB;
  proven locally by an ECONNREFUSED build failure).
- Promote all `"warn"` severities in `biome.json` to `"error"` (repo baseline
  is currently 0 findings, so this is a no-op today by construction).
- Concurrency group so superseded runs on the same PR are cancelled.
- Bun pinned to `1.4.3` (amended 2026-10-21 — `bun check` requires it; `deploy.yml` stays on `1.4.2`).
- Branch protection on `main` requiring the CI check before merge.

### Out of Scope

- Playwright e2e in CI (deferred; also ties into the recorded "e2e on
  production build" debt — revisit as its own track).
- Coverage reporting/enforcement in CI (the >80% new-code gate is enforced by
  the conductor phase workflow locally; project-wide coverage is 87.7%).
- Any change to `deploy.yml` or the deployment pipeline.
- Dependency automation (Dependabot/Renovate), caching beyond CI defaults.
- Any production application code change.

## Functional Requirements

| ID  | Requirement                                                                                                     | Priority |
| --- | --------------------------------------------------------------------------------------------------------------- | -------- |
| FR-1 | A workflow runs automatically on every pull request targeting `main`, on open and on every push to the PR branch. | must     |
| FR-2 | A single job executes `bun install` → database migrations (`echo y | bun run payload migrate`) → `bun run typecheck` → `bun run lint` → `bun test` → `bun run build`, failing the run if any step exits non-zero. The migrate step is required because prerendering queries the schema on a fresh CI database (amended 2026-10-21, review F4). | must     |
| FR-3 | The build step runs against a `postgres:16` service container with `DATABASE_URL` pointing at it.                | must     |
| FR-4 | All `"warn"` rule severities in `biome.json` are promoted to `"error"`, and the repo lint remains green (0 errors). | must     |
| FR-5 | A concurrency group cancels in-progress runs of the same PR when a new push arrives.                             | should   |
| FR-6 | Branch protection on `main` marks the CI check as required, so GitHub blocks merge while the check fails.         | must     |

## Non-Functional Requirements

| ID   | Requirement                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------- |
| NFR-1 | Bun version pinned to `1.4.3` in ci.yml — amended from `1.4.2` (2026-10-21, review F1): the typecheck script's engine `bun check` exists only from 1.4.3 (CI run 39567563082 proved 1.4.2 lacks it); `deploy.yml` stays on `1.4.2` since it never runs typecheck; action versions pinned by SHA or major tag. |
| NFR-2 | CI run completes in ≤ 5 minutes on a typical PR.                                                      |
| NFR-3 | No repository secrets are required by the workflow.                                                   |
| NFR-4 | Workflow changes only — zero production application code changes.                                    |

## Acceptance Criteria

| ID   | Criterion                                                                                                   | Verifies |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | Opening a PR (or pushing to an open PR branch) triggers a green CI run executing all four verification steps. | FR-1, FR-2 |
| AC-2 | A change that introduces a lint violation fails CI at error severity (strict gate proven, not just assumed).  | FR-4, FR-2 |
| AC-3 | The required check appears on the PR and GitHub blocks merging while it is red.                              | FR-6 |
| AC-4 | A full CI run completes in ≤ 5 minutes.                                                                      | NFR-2 |
| AC-5 | Repo-wide lint after the severity promotion reports 0 errors and 0 warnings (local and CI agree).            | FR-4 |

## Edge Cases

- **Build requires Redis:** assumption — Redis is connected lazily and the
  build does not need it. If the build fails without Redis, add a Redis
  service container in the same phase (verified during implementation).
- **Draft PRs:** workflow runs on drafts too; acceptable (failures are
  informative, not blocking, until marked ready).
- **Rapid pushes:** superseded runs are cancelled via the concurrency group; a
  cancelled run must not be read as a failure signal.
- **Branch protection administration:** the repo owner's own merges are also
  subject to the required check (no admin bypass configured, keeping the gate
  honest).

## Dependencies

- Tracks: none.
- External: GitHub Actions (already in use), `postgres:16` Docker image (used
  locally via docker-compose already).

## Open Questions & Assumptions

- **Assumption:** promoting `warn` → `error` in `biome.json` is the user's
  chosen strictness mechanism (over a CI-only `--error-on-warnings` flag), so
  local husky runs get the same strictness. Confirmed in interview 2026-10-21.
- **Assumption:** the repo is public, so branch protection with required
  status checks is available on the current plan. Confirmed in interview.
- **Question:** should branch protection be applied via `gh api` in a track
  task (scripted, reproducible) or configured manually in repo Settings?
  → Assumption: scripted via `gh api` as the final task, with manual fallback
  documented.

## References

- `conductor/workflow.md` — verification strategy, review policy (strict).
- `.github/workflows/deploy.yml` — existing pipeline conventions (bun
  version, payload drift prompt handling).
- `biome.json` — current rule severities (warn targets for promotion).
- Track `20261021-lint-debt-cleanup` — established the 0-warning baseline and
  recorded the no-PR-checks gap.
