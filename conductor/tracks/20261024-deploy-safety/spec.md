# Deploy Safety - Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

Make the deploy pipeline prove its own safety instead of assuming it. Four
guards: CI builds the production image, a destructive migration must declare
itself, the rollout is verified to serve, and the rollback procedure is written
down. Also corrects the false comment that made the 2026-10-24 outage look safe.

## Problem / Motivation

On 2026-10-24 the localization migration (`20261023_193922`) dropped
`genres.name` and eight sibling columns while the image build failed on a
`.dockerignore` gap (`e2e/` excluded, but `src/lib/__tests__/e2e-harness.test.ts`
imports `e2e/global-setup`, so `next build`'s type check died with `TS2307`).
Production served the 2026-10-21 image against a migrated schema for roughly ten
hours, returning `42703` on every query touching genres, tags, mood tags,
reading lists or a review title.

Three things allowed it, and none of them is guarded today:

1. **No gate builds the image.** `bun run build` on a runner has `e2e/` present,
   so the Docker context was never type-checked by anything. Four consecutive
   deploys failed while every CI check stayed green.
2. **`deploy.yml` states a false invariant.** Its migrate job claims migrations
   are "additive and backward-compatible with the currently deployed image", and
   nothing enforces that. Three of thirteen migrations contain `DROP COLUMN` or
   `DROP TABLE` in `up`.
3. **Nothing checks the rollout.** The workflow went green on the Coolify
   webhook, then production returned 500s until a reader reported it.

## Goals & Success Metrics

- **Goal:** a build-breaking or schema-breaking change fails a pull request or a
  deploy run, not production traffic.
- **Metric:** a `.dockerignore`-only regression turns the `Docker Build` check
  red on its PR; a destructive migration without a marker fails `bun test`; a
  rollout that serves 500 fails the deploy run within about eight minutes.

## Scope

### In Scope

- A `Docker Build` job in CI, run in parallel, not part of the required check.
- A destructive-migration marker convention, enforced by a static unit test.
- A post-deploy smoke check that fails the deploy run.
- Serial deploy runs via a queueing concurrency group.
- Corrected deploy-workflow comments and Bun-version alignment.
- A deployment runbook covering `migrate:status` and `migrate:down`.

### Out of Scope

- Automatic `migrate:down` compensation when a build fails. Reverting is a
  human decision, because the localization `down()` restores English content but
  discards the Indonesian rows.
- Rewriting already-applied migrations into an expand/contract shape. The
  corrective work here is detection and procedure, not a schema refactor.
- Changing the Dockerfile's base images, or gating deploys behind manual
  dispatch.
- Application code, routes, or the SQL any migration executes.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | `ci.yml` gains a `Docker Build` job, a sibling of `E2E Tests` and not part of the required check, that builds the production image from the same `Dockerfile` and the same build-argument shape as `deploy.yml`, against a migrated postgres service, without pushing and without reading repository secrets. | must |
| FR-2 | A unit test under `src/migrations/__tests__/` scans every migration's `up` body and fails when it contains `DROP COLUMN`, `DROP TABLE`, or `TRUNCATE` unless the file carries a `// destructive: <justification>` marker. Statements in a `down` body are never flagged. | must |
| FR-3 | The three migrations that drop in `up` (`20251214_135240`, `20261008_131000_commenters_email_hash_fix`, `20261023_193922_localize_taxonomy_and_reading_list_content`) carry markers naming what is dropped and why it cannot be reintroduced. | must |
| FR-4 | A smoke script polls the deployed site after the Coolify webhook and exits non-zero if `/api/genres?limit=1`, `/en`, `/id` or `/sitemap.xml` never returns 200 within its budget, printing each attempt's status for every endpoint. When the reviews API yields a published slug, it also probes `/en/reviews/<slug>`. | must |
| FR-5 | The smoke logic is a pure function with an injectable `fetch` and an injectable sleep, unit-tested without network; the script is a thin IO wrapper around it. | must |
| FR-6 | `deploy.yml` serialises deploys with a `concurrency` group that queues rather than cancels, so two merges minutes apart cannot interleave two migrate jobs. | must |
| FR-7 | The migrate job runs on the same Bun version as CI (`1.4.3`). | should |
| FR-8 | The false "additive and backward-compatible" comment is replaced with the real constraint: migrations must run before the build because prerendering reads the schema, and a destructive migration means the currently deployed image cannot serve during that window. | must |
| FR-9 | `docs/DEPLOYMENT.md` documents the runbook — how to list applied migrations (`payload migrate:status`), how to revert one batch (`payload migrate:down`), what a revert does not restore, and when it is unsafe — and the README's Deployment section links to it. | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | The CI image job uses placeholder environment values only: no repository secrets, no Docker Hub login, no push. |
| NFR-2 | The image job runs in parallel with the existing jobs, so worst-case PR wall clock stays under roughly twelve minutes. |
| NFR-3 | The smoke check is read-only: `GET` only, no credentials, no writes, at most about forty requests including retries. |
| NFR-4 | No runtime or schema change: application code, routes and the SQL every migration executes are untouched. Only pipelines, docs, tests and comments change. |
| NFR-5 | The marker test is offline and deterministic: no database, no network, no clock. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | A pull request whose only change re-adds `e2e` to `.dockerignore` shows a failing `Docker Build` check. | FR-1 |
| AC-2 | A migration with `DROP COLUMN` in `up` and no marker fails `bun test`; adding the marker makes it pass. | FR-2 |
| AC-3 | A migration whose drops appear only in `down` passes without a marker. | FR-2 |
| AC-4 | All thirteen committed migrations pass the marker test. | FR-2, FR-3 |
| AC-5 | Against a served build the smoke script exits 0 and reports 200 for each endpoint; pointed at a base URL returning 500 it exits non-zero and names the failing endpoint. | FR-4 |
| AC-6 | Unit tests drive the pure function with a stub covering eventual success after 500s, exhaustion of the retry budget, and the no-published-review path. | FR-5 |
| AC-7 | Two pushes to `main` in quick succession produce two deploys that run one after the other, neither cancelled mid-run. | FR-6 |
| AC-8 | The migrate job's Bun version matches `ci.yml`. | FR-7 |
| AC-9 | `deploy.yml` contains no claim that migrations are backward-compatible with the deployed image. | FR-8 |
| AC-10 | `docs/DEPLOYMENT.md` exists, the README links to it, and it states what `migrate:down` cannot restore. | FR-9 |

## Edge Cases

- **Fork pull request:** the image job must pass with no secrets, which the
  placeholder values already satisfy because `src/lib/env.ts` only validates
  shape and presence.
- **Reaching postgres from the build container:** the build runs on the runner's
  host network so `localhost:5432` resolves to the service container; the
  alternative (`host.docker.internal`) needs extra host entries on a Linux
  runner.
- **Textual marker matching:** a `DROP` inside a string literal or a comment
  forces a marker. Accepted — the cost is a comment, not a failure.
- **Not flagged:** `DROP NOT NULL`, `DROP CONSTRAINT`, and `DELETE FROM`.
  `20261023_195302` relaxes three columns and is not destructive. Data-destroying
  DML is out of the observed blast radius; recorded here rather than enforced.
- **Empty scan:** the marker test asserts it inspected at least thirteen
  migration files, so a broken glob cannot pass silently.
- **No published reviews:** the detail-route probe is skipped, not failed.
- **Coolify slower than the budget:** the deploy run fails loudly but does not
  undo the deployment, which is the documented human decision.

## Dependencies

- **Tracks:** none. Every predecessor is merged; base is `main` @ `9846d72`.
- **External:** GitHub Actions, Docker Hub, the Coolify webhook, and the
  production site reachable from a runner.

## Open Questions & Assumptions

- **Assumption:** branch protection requires exactly `Typecheck, Lint, Test,
  Build`, so the image job stays a sibling rather than folding into that check.
- **Assumption:** `bun test` collects only under `./src` (`bunfig.toml`
  `root = "./src"`), so the marker test lives at `src/migrations/__tests__/`.
- **Assumption:** the Dockerfile's `oven/bun:1.4.2` base images stay as they
  are; only the workflow's CLI version aligns, so the built artifact is
  unchanged by this track.
- **Assumption:** the deploy job may install Bun without `bun install`, because
  the smoke module imports nothing from `node_modules`.

## References

- Incident: production `42703` on 2026-10-24; hotfix PR #22 (`9846d72`).
- `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `Dockerfile`.
- `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts`.
- `conductor/archive/20261023-bilingual-site-experience/spec.md` (the NFR-5
  reversibility requirement whose `down()` this track relies on).
