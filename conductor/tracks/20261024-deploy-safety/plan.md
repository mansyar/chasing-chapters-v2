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
- **Status:** verified

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
- **Status:** verified

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
- **Touches:** `.github/workflows/deploy.yml`
- **Verification:** `bun run typecheck && bun run lint && bun test` plus `bun -e "const {parse}=await import('yaml');parse(await Bun.file('.github/workflows/deploy.yml').text());console.log('yaml ok')"`
- **Status:** pending

- [ ] **P4.T1: Serialise deploys** - covers: FR-6
- [ ] **P4.T2: Align the migrate job to Bun 1.4.3** - covers: FR-7
- [ ] **P4.T3: Replace the backward-compatibility comment with the real constraint** - covers: FR-8
- [ ] **P4.T4: Verify the rollout** - covers: FR-4
  - [ ] **P4.T4.1: Job after the Coolify webhook that checks out and runs the smoke script**
  - [ ] **P4.T4.2: Base URL from a repository variable with the production default**

## Phase 5: Deployment Runbook

- **Goal:** the recovery procedure exists in the repo, is linked, and says what a revert cannot restore.
- **Depends on:** Phase 4
- **Covers:** FR-9, AC-10
- **Touches:** `docs/DEPLOYMENT.md`, `README.md`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P5.T1: Write `docs/DEPLOYMENT.md`** - covers: FR-9
  - [ ] **P5.T1.1: The deploy order and why migrations precede the build**
  - [ ] **P5.T1.2: `migrate:status` and `migrate:down`, what a revert does not restore, and when it is unsafe**
  - [ ] **P5.T1.3: How a destructive migration is declared and reviewed**
- [ ] **P5.T2: Link the runbook from the README Deployment section** - covers: FR-9

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-1.md
-->
