# Deploy Safety - Implementation Plan

> **Branch:** `chore/20261024-deploy-safety`
> **Base:** `main` @ `9846d728a549669e5a6f6748def92cc2594fa68c`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Destructive Migration Markers

- **Goal:** `bun test` fails when a migration's `up` drops a column or table without declaring itself, and all thirteen committed migrations pass with markers added.
- **Depends on:** none
- **Covers:** FR-2, FR-3, NFR-5, AC-2, AC-3, AC-4
- **Touches:** `src/migrations/__tests__/**`, `src/migrations/*.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** done

- [x] **P1.T1: Marker scanner test** - covers: FR-2
  - [x] **P1.T1.1: Split each migration file at `export async function down` so only the `up` body is scanned**
  - [x] **P1.T1.2: Detect `DROP COLUMN`, `DROP TABLE` and `TRUNCATE` in the `up` body**
  - [x] **P1.T1.3: Require a `// destructive:` marker for a flagged file, and assert at least thirteen migration files were inspected so a broken glob cannot pass**
- [x] **P1.T2: Mark the three dropping migrations** - covers: FR-3
  - [x] **P1.T2.1: `20251214_135240` - review body localization**
  - [x] **P1.T2.2: `20261008_131000_commenters_email_hash_fix`**
  - [x] **P1.T2.3: `20261023_193922_localize_taxonomy_and_reading_list_content` - the outage migration; name all ten dropped columns and note the `down()` recovers English only**

**Result:** verified
**Checkpoint:** d1910e0
**Evidence:** conductor/tracks/20261024-deploy-safety/verification/phase-1.md

## Phase 2: Deploy Smoke Check

- **Goal:** a pure, unit-tested function reports whether a deployed site is serving, and a thin script turns that into an exit code.
- **Depends on:** none
- **Covers:** FR-4, FR-5, NFR-3, AC-5, AC-6
- **Touches:** `src/lib/deploy-smoke.ts`, `src/lib/__tests__/deploy-smoke.test.ts`, `src/scripts/deploy-smoke.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** done

- [x] **P2.T1: Pure smoke module** - covers: FR-5
  - [x] **P2.T1.1: Poll the fixed endpoint set with injectable `fetch` and sleep, returning a per-endpoint report**
  - [x] **P2.T1.2: Discover one published review slug from the reviews API and probe its locale detail route; skip cleanly when there is none**
- [x] **P2.T2: Unit tests** - covers: FR-5
  - [x] **P2.T2.1: Succeeds after a run of 500s**
  - [x] **P2.T2.2: Fails when the retry budget is exhausted, naming the endpoint**
  - [x] **P2.T2.3: Passes with no published review**
- [x] **P2.T3: Script wrapper** - covers: FR-4
  - [x] **P2.T3.1: Read the base URL from `process.argv`, print per-attempt status, exit non-zero on failure**

**Result:** verified
**Checkpoint:** f00fad9
**Evidence:** conductor/tracks/20261024-deploy-safety/verification/phase-2.md

## Phase 3: CI Image Build

- **Goal:** a pull request whose image cannot build turns a check red.
- **Depends on:** none
- **Covers:** FR-1, NFR-1, NFR-2, AC-1
- **Touches:** `.github/workflows/ci.yml`
- **Verification:** `bun run typecheck && bun run lint && bun test` plus `bun -e "const {parse}=await import('yaml');parse(await Bun.file('.github/workflows/ci.yml').text());console.log('yaml ok')"`; the authoritative check is the `Docker Build` job on the pushed branch
- **Status:** done

- [x] **P3.T1: Add the `Docker Build` job** - covers: FR-1
  - [x] **P3.T1.1: Postgres service, host network for the build, and the same build-argument shape as `deploy.yml` with placeholder values**
  - [x] **P3.T1.2: `push: false`, no registry login, no repository secrets, parallel to the existing jobs**

**Result:** verified
**Checkpoint:** bd93bb6
**Evidence:** conductor/tracks/20261024-deploy-safety/verification/phase-3.md

## Phase 4: Deploy Workflow Hardening

- **Goal:** deploys cannot interleave, the false safety claim is gone, and a rollout that serves 500 fails the run.
- **Depends on:** Phase 2
- **Covers:** FR-4, FR-6, FR-7, FR-8, AC-7, AC-8, AC-9
- **Touches:** `.github/workflows/deploy.yml`, `src/lib/deploy-smoke.ts`, `src/scripts/deploy-smoke.ts`, `src/lib/__tests__/deploy-smoke.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test` plus `bun -e "const {parse}=await import('yaml');parse(await Bun.file('.github/workflows/deploy.yml').text());console.log('yaml ok')"`
- **Status:** done

- [x] **P4.T1: Serialise deploys** - covers: FR-6
- [x] **P4.T2: Align the migrate job to Bun 1.4.3** - covers: FR-7
- [x] **P4.T3: Replace the backward-compatibility comment with the real constraint** - covers: FR-8
- [x] **P4.T4: Verify the rollout** - covers: FR-4
  - [x] **P4.T4.1: Job after the Coolify webhook that checks out and runs the smoke script**
  - [x] **P4.T4.2: Base URL from a repository variable with the production default**
  - [x] **P4.T4.3: Make the retry budget configurable, keeping the deploy job inside NFR-3's request ceiling**

**Result:** verified
**Checkpoint:** 46ab895
**Evidence:** conductor/tracks/20261024-deploy-safety/verification/phase-4.md

## Phase 5: Deployment Runbook

- **Goal:** the recovery procedure exists in the repo, is linked, and says what a revert cannot restore.
- **Depends on:** Phase 4
- **Covers:** FR-9, AC-10
- **Touches:** `docs/DEPLOYMENT.md`, `README.md`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** done

- [x] **P5.T1: Write `docs/DEPLOYMENT.md`** - covers: FR-9
  - [x] **P5.T1.1: The deploy order and why migrations precede the build**
  - [x] **P5.T1.2: `migrate:status` and `migrate:down`, what a revert does not restore, and when it is unsafe**
  - [x] **P5.T1.3: How a destructive migration is declared and reviewed**
- [x] **P5.T2: Link the runbook from the README Deployment section** - covers: FR-9
## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1-F8, so the runbook stops overstating what `verify` can catch and the marker scan stops passing silently.
- **Depends on:** Phase 5
- **Covers:** F1, F2, F3, F4, F5, F6, F7, F8
- **Touches:** `docs/DEPLOYMENT.md`, `.github/workflows/deploy.yml`, `src/migrations/__tests__/destructive-markers.test.ts`, `src/lib/deploy-smoke.ts`, `src/lib/__tests__/deploy-smoke.test.ts`, `src/scripts/deploy-smoke.ts`, `.opencode/agents/conductor-phase.md`, `conductor/tracks/20261024-deploy-safety/spec.md`
- **Verification:** `bun run typecheck && bun run lint && bun test`, plus `bun test --coverage` to evidence the 80% new-code gate
- **Status:** done

- [x] **R1.T1: Stop the runbook claiming `verify` would have caught 2026-10-24** - covers: F1
- [x] **R1.T2: Make the marker scan fail closed on layout** - covers: F2
- [x] **R1.T3: Guard `RENAME COLUMN`, and state what stays unguarded** - covers: F3
- [x] **R1.T4: Test the script's argument parsing and exit code** - covers: F4
- [x] **R1.T5: Restore least privilege in the phase allow-list** - covers: F5
- [x] **R1.T6: Guard `main()` behind `import.meta.main`** - covers: F6
- [x] **R1.T7: Correct the retry-budget arithmetic in the workflow comment** - covers: F7
- [x] **R1.T8: Make a zero attempt budget a report, not a throw** - covers: F8
**Result:** verified
**Checkpoint:** f7f7bae
**Evidence:** conductor/tracks/20261024-deploy-safety/verification/phase-r1.md