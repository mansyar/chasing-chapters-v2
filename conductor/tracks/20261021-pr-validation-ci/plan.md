# Plan — PR Validation CI

**Branch:** `chore/20261021-pr-validation-ci`
**Base:** `main` @ `d15278f`

> Phases progress through `pending → in_progress → verified → failed → blocked`.
> Only the primary Conductor agent edits this file.

## Phase 1: Strict lint config and CI workflow authoring

- **Goal:** Promote all Biome `"warn"` severities to `"error"` and author `.github/workflows/ci.yml` so the full verification gate (typecheck, strict lint, unit tests, production build with Postgres) runs on every PR to `main`.
- **Depends on:** —
- **Covers:** FR-1, FR-2, FR-3, FR-4, FR-5; NFR-1, NFR-2, NFR-3; AC-5
- **Touches:** `biome.json`, `.github/workflows/ci.yml`
- **Verification:** `bun run typecheck && bun run lint && bun test` — lint must report 0 errors and 0 warnings at the new severities; YAML validity confirmed
- **Status:** verified

- [x] **P1.T1: Promote lint severities to error** — covers: FR-4, AC-5
  - Flip every `"warn"` value in `biome.json` linter rules to `"error"` (mechanical, no rule additions/removals).
  - Run full lint locally; confirm 0 errors, 0 warnings (baseline holds by construction).
- [x] **P1.T2: Author `.github/workflows/ci.yml`** — covers: FR-1, FR-2, FR-3, FR-5, NFR-1, NFR-3
  - Trigger: `pull_request` targeting `main`.
  - Single job: checkout → setup-bun `1.4.2` (pinned action version) → `bun install` → `bun run typecheck` → `bun run lint` → `bun test` → `bun run build`.
  - `postgres:16` service container; `DATABASE_URL` wired for the build step (mirror `deploy.yml` env conventions).
  - Concurrency group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
  - No secrets referenced; YAML parses cleanly.

**Result:** verified
**Checkpoint:** 7d5de2b
**Evidence:** conductor/tracks/20261021-pr-validation-ci/verification/phase-1.md

<!--
After phase acceptance the primary agent appends under the phase:
**Result:** verified / **Checkpoint:** <short-sha> / **Evidence:** conductor/tracks/<track-id>/verification/phase-<n>.md
-->

## Phase 2: Live CI validation and branch protection

- **Goal:** Prove the gate end-to-end on real PRs (green run, strict-lint red run, merge blocking) and make the check required on `main`.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-6; NFR-2; AC-1, AC-2, AC-3, AC-4
- **Touches:** `.github/workflows/ci.yml` (fixes only if validation exposes defects), `conductor/tracks/<track-id>/verification/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`; live CI run URLs recorded as evidence in `verification/phase-2.md`
- **Status:** verified

- [x] **P2.T1: Green-path validation** — covers: FR-1, FR-2, NFR-2; AC-1, AC-4
  - Open a scratch draft PR from the track branch (or a scratch branch off it); observe the CI run execute all four steps and go green; record run URL and duration.
- [x] **P2.T2: Red-path validation (strict lint)** — covers: FR-4, FR-2; AC-2
  - On the scratch branch, commit a deliberate lint violation (e.g. a stray `any`); confirm the lint step fails at error severity and the run goes red; revert the violation commit.
- [x] **P2.T3: Required check enforcement** — covers: FR-6; AC-3
  - Apply branch protection on `main` via `gh api` requiring the CI check; verify GitHub blocks merge while the scratch PR is red and allows it when green; close the scratch PR.
- [x] **P2.T4: Final integration check** — covers: NFR-2
  - Confirm a complete CI run duration ≤ 5 minutes; record timings in evidence.

**Result:** verified
**Checkpoint:** 18af5a4
**Evidence:** conductor/tracks/20261021-pr-validation-ci/verification/phase-2.md

## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1–F5 from round 1 (BLOCK): restore the validated CI configuration to the committed file, enforce the spec's no-admin-bypass edge case, reconcile spec and evidence with the shipped artifact.
- **Depends on:** Phase 2
- **Covers:** F1, F2, F3, F4, F5
- **Touches:** `.github/workflows/ci.yml`, `conductor/tracks/20261021-pr-validation-ci/spec.md`, `conductor/tracks/20261021-pr-validation-ci/verification/*`, branch protection via `gh api`
- **Verification:** `bun run typecheck && bun run lint && bun test`; live CI run from a branch containing the committed ci.yml must be green (migrate + test + build steps green without a .env); protection re-applied with `enforce_admins: true`
- **Status:** verified

- [x] **R1.T1: Restore validated CI config (F1, F2)** — covers: FR-2, NFR-1, AC-1
  - Pin `bun-version: 1.4.3` with the justification comment (run 39567563082 proved 1.4.2 lacks `bun check`).
  - Move the placeholder env block to job level (migrate + test + build all need env.ts module-load validation); remove the Build-step env block.
  - Spec: amend NFR-1 to `1.4.3` (with note).
- [x] **R1.T2: enforce_admins true (F3)** — covers: FR-6, AC-3
  - Re-apply branch protection with `enforce_admins: true` via `gh api`; verify config reads back correctly.
- [x] **R1.T3: Spec FR-2 step list (F4)** — covers: FR-2
  - Add the "Run database migrations" step to FR-2's enumerated list.
- [x] **R1.T4: Re-run live CI from committed config + evidence reconciliation (F5)** — covers: AC-1
  - Scratch branch at fixed HEAD → draft PR → observe green run (migrate/test/build without .env) → close; update phase-2.md and write phase-R1.md referencing the committed-config run.

**Result:** verified
**Checkpoint:** fa919c3
**Evidence:** conductor/tracks/20261021-pr-validation-ci/verification/phase-R1.md

<!--
Review fixes are appended by `conductor-review` as `## Phase R<n>: Review Fixes` when needed.
-->
