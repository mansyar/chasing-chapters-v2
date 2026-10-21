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
- **Status:** in_progress

- [ ] **P1.T1: Promote lint severities to error** — covers: FR-4, AC-5
  - Flip every `"warn"` value in `biome.json` linter rules to `"error"` (mechanical, no rule additions/removals).
  - Run full lint locally; confirm 0 errors, 0 warnings (baseline holds by construction).
- [ ] **P1.T2: Author `.github/workflows/ci.yml`** — covers: FR-1, FR-2, FR-3, FR-5, NFR-1, NFR-3
  - Trigger: `pull_request` targeting `main`.
  - Single job: checkout → setup-bun `1.4.2` (pinned action version) → `bun install` → `bun run typecheck` → `bun run lint` → `bun test` → `bun run build`.
  - `postgres:16` service container; `DATABASE_URL` wired for the build step (mirror `deploy.yml` env conventions).
  - Concurrency group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
  - No secrets referenced; YAML parses cleanly.

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
- **Status:** pending

- [ ] **P2.T1: Green-path validation** — covers: FR-1, FR-2, NFR-2; AC-1, AC-4
  - Open a scratch draft PR from the track branch (or a scratch branch off it); observe the CI run execute all four steps and go green; record run URL and duration.
- [ ] **P2.T2: Red-path validation (strict lint)** — covers: FR-4, FR-2; AC-2
  - On the scratch branch, commit a deliberate lint violation (e.g. a stray `any`); confirm the lint step fails at error severity and the run goes red; revert the violation commit.
- [ ] **P2.T3: Required check enforcement** — covers: FR-6; AC-3
  - Apply branch protection on `main` via `gh api` requiring the CI check; verify GitHub blocks merge while the scratch PR is red and allows it when green; close the scratch PR.
- [ ] **P2.T4: Final integration check** — covers: NFR-2
  - Confirm a complete CI run duration ≤ 5 minutes; record timings in evidence.

<!--
Review fixes are appended by `conductor-review` as `## Phase R<n>: Review Fixes` when needed.
-->
