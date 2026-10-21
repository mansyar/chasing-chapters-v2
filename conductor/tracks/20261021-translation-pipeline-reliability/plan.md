# Translation Pipeline Reliability — Implementation Plan

> **Branch:** `feat/20261021-translation-pipeline-reliability`
> **Base:** `main` @ `6d6e7b9`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Pipeline Hardening

- **Goal:** The translation pipeline is concurrency-safe, classifies failures into author-actionable messages, re-runs once automatically after transient failures, and maintains real stale status (including backfill).
- **Depends on:** none
- **Covers:** FR-5, FR-6, FR-7, FR-8, AC-5, AC-6, AC-7, AC-8
- **Touches:** `src/lib/translation-errors.ts` (new), `src/lib/translation-lock.ts` (new), `src/lib/translate.ts`, `src/lib/translation-status.ts`, `src/hooks/translateReview.ts`, `src/hooks/__tests__/*`, `src/lib/__tests__/*`, `src/migrations/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P1.T1: Error classification and actionable messages** — covers: FR-5
  - [ ] **P1.T1.1: Create classification module mapping Google API / network / timeout / credential failures to kinds + author-actionable guidance**
  - [ ] **P1.T1.2: Wire classification into the pipeline failure path so `translationError` stores actionable message + raw detail**
  - [ ] **P1.T1.3: Unit tests for each error class (quota, network, timeout, credentials, unexpected)**
- [ ] **P1.T2: Per-review pipeline lock** — covers: FR-6
  - [ ] **P1.T2.1: Redis-backed lock (SET NX) with in-memory fallback when Redis is unavailable; second concurrent trigger is a no-op**
  - [ ] **P1.T2.2: Unit tests proving exactly one pipeline run under concurrent triggers**
- [ ] **P1.T3: Automatic delayed re-run for transient failures** — covers: FR-7
  - [ ] **P1.T3.1: Schedule one full pipeline re-run (~minutes) after a transient-classified failure; permanent classes fail immediately**
  - [ ] **P1.T3.2: Unit tests: transient → exactly one delayed re-run then failed; permanent → immediate failed**
- [ ] **P1.T4: Real stale status and backfill** — covers: FR-8
  - [ ] **P1.T4.1: Wire `isStale()` into pipeline status decisions so date-stale reviews transition to `stale` (respecting the existing transition map)**
  - [ ] **P1.T4.2: Migration backfilling `translated` reviews whose English is newer than their translation to `stale` (skipping pending/failed/untranslated)**
  - [ ] **P1.T4.3: Unit tests for stale transitions and backfill selection logic**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-1.md
-->

## Phase 2: Author Feedback Surfaces

- **Goal:** Authors see translation progress live in the edit view (status + toast) and a global indicator listing every translation needing attention.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-3, AC-1, AC-2, AC-3
- **Touches:** `src/collections/Reviews/admin/*`, `src/components/admin/*`, `src/payload.config.ts` (admin component registration), `src/app/(payload)/**` (only if registration requires), new admin-side tests
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P2.T1: Edit-view live status and completion toast** — covers: FR-1, FR-2
  - [ ] **P2.T1.1: Poll the document's translation status while the edit view is open (bounded interval) and reflect transitions without a manual refresh**
  - [ ] **P2.T1.2: Toast success/failure when a background pipeline completes**
- [ ] **P2.T2: Global attention bell** — covers: FR-3
  - [ ] **P2.T2.1: Query/listing of failed, stale, and stuck-pending (>24h) translations honoring writer/admin access rules**
  - [ ] **P2.T2.2: Admin-shell indicator with count and linked document list**
- [ ] **P2.T3: Phase evidence and verification** — covers: FR-1, FR-2, FR-3
  - [ ] **P2.T3.1: Unit-test the attention-list query logic (status filters, threshold, access scoping) and record phase evidence**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-2.md
-->

## Phase 3: Bulk Recovery and Final Verification

- **Goal:** One bulk action recovers any selection of failed/stale reviews, and the whole track passes integrated verification.
- **Depends on:** Phase 2
- **Covers:** FR-4, AC-4
- **Touches:** `src/collections/Reviews/**` (endpoints/list config), `src/lib/retranslate.ts` (only if shared run logic needs a batch wrapper), new tests
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P3.T1: Bulk re-translate endpoint** — covers: FR-4
  - [ ] **P3.T1.1: Endpoint that sequentially re-translates each selected failed/stale review, enforcing access rules and reporting per-review outcomes**
- [ ] **P3.T2: List-view bulk action UI** — covers: FR-4
  - [ ] **P3.T2.1: Bulk action on the reviews list view with per-review outcome feedback**
- [ ] **P3.T3: Integrated verification** — covers: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
  - [ ] **P3.T3.1: Full gate run (typecheck, lint, tests, production build) and AC sweep across all eight acceptance criteria, recorded as integrated evidence**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-3.md
-->

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 3
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
