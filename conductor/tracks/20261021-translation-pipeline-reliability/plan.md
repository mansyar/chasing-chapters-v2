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
- **Status:** verified

**Result:** verified
**Checkpoint:** 5a3dab7
**Evidence:** conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-1.md

- [x] **P1.T1: Error classification and actionable messages** — covers: FR-5
  - [x] **P1.T1.1: Create classification module mapping Google API / network / timeout / credential failures to kinds + author-actionable guidance**
  - [x] **P1.T1.2: Wire classification into the pipeline failure path so `translationError` stores actionable message + raw detail**
  - [x] **P1.T1.3: Unit tests for each error class (quota, network, timeout, credentials, unexpected)**
- [x] **P1.T2: Per-review pipeline lock** — covers: FR-6
  - [x] **P1.T2.1: Redis-backed lock (SET NX) with in-memory fallback when Redis is unavailable; second concurrent trigger is a no-op**
  - [x] **P1.T2.2: Unit tests proving exactly one pipeline run under concurrent triggers**
- [x] **P1.T3: Automatic delayed re-run for transient failures** — covers: FR-7
  - [x] **P1.T3.1: Schedule one full pipeline re-run (~minutes) after a transient-classified failure; permanent classes fail immediately**
  - [x] **P1.T3.2: Unit tests: transient → exactly one delayed re-run then failed; permanent → immediate failed**
- [x] **P1.T4: Real stale status and backfill** — covers: FR-8
  - [x] **P1.T4.1: Wire `isStale()` into pipeline status decisions so date-stale reviews transition to `stale` (respecting the existing transition map)**
  - [x] **P1.T4.2: Migration backfilling `translated` reviews whose English is newer than their translation to `stale` (skipping pending/failed/untranslated)**
  - [x] **P1.T4.3: Unit tests for stale transitions and backfill selection logic**

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
- **Status:** verified

**Result:** verified
**Checkpoint:** 16a8a73
**Evidence:** conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-2.md

- [x] **P2.T1: Edit-view live status and completion toast** — covers: FR-1, FR-2
  - [x] **P2.T1.1: Poll the document's translation status while the edit view is open (bounded interval) and reflect transitions without a manual refresh**
  - [x] **P2.T1.2: Toast success/failure when a background pipeline completes**
- [x] **P2.T2: Global attention bell** — covers: FR-3
  - [x] **P2.T2.1: Query/listing of failed, stale, and stuck-pending (>24h) translations honoring writer/admin access rules**
  - [x] **P2.T2.2: Admin-shell indicator with count and linked document list**
- [x] **P2.T3: Phase evidence and verification** — covers: FR-1, FR-2, FR-3
  - [x] **P2.T3.1: Unit-test the attention-list query logic (status filters, threshold, access scoping) and record phase evidence**

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
- **Touches:** `src/collections/Reviews/**` (endpoints/list config), `src/lib/retranslate.ts` (only if shared run logic needs a batch wrapper), `src/app/(payload)/api/**`, `src/components/admin/*`, `src/payload.config.ts` (admin component registration), new tests
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** a319338
**Evidence:** conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-3.md

- [x] **P3.T1: Bulk re-translate endpoint** — covers: FR-4
  - [x] **P3.T1.1: Endpoint that sequentially re-translates each selected failed/stale review, enforcing access rules and reporting per-review outcomes**
- [x] **P3.T2: List-view bulk action UI** — covers: FR-4
  - [x] **P3.T2.1: Bulk action on the reviews list view with per-review outcome feedback**
- [x] **P3.T3: Integrated verification** — covers: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
  - [x] **P3.T3.1: Full gate run (typecheck, lint, tests, production build) and AC sweep across all eight acceptance criteria, recorded as integrated evidence**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-3.md
-->

## Phase R1: Review Fixes (round 1)

- **Goal:** Resolve review findings F1 (degenerate staleness predicate), F2 (delayed re-run overwrites newer content), F3 (poller inert in the save-triggered flow), F4 (untested lock helper), F5 (unbounded bulk batch), L1 (bell badge count) and L2/L4 (contract alignment — already applied by the primary in the review commit). L3 is recorded as pre-existing debt, not a fix.
- **Depends on:** Phase 3
- **Covers:** F1, F2, F3, F4, F5, L1, L2, L4
- **Touches:** `src/collections/Reviews.ts` (new `englishUpdatedAt` field — the only deliberate change to the root collection file in this track), `src/hooks/translateReview.ts`, `src/lib/translation-status.ts`, `src/lib/translation-lock.ts` (tests only), `src/lib/retranslate.ts`, `src/components/admin/*`, `src/migrations/*` (new migration + `index.ts`), test files under `src/**/__tests__/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 8646729
**Evidence:** conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R1.md

- [x] **R1.T1: Accurate staleness signal (F1)** — covers: F1, FR-8, AC-8
  - [ ] **R1.T1.1: Add a non-localized `englishUpdatedAt` date field to the Reviews collection, plus a migration that adds the column**
  - [ ] **R1.T1.2: Record `englishUpdatedAt` when the English rich text changes (text change or first publish), independent of the autoTranslate toggle**
  - [ ] **R1.T1.3: Compare `englishUpdatedAt` against `translationUpdatedAt` in the hook's stale branch, in `shouldBackfillToStale`, and in the migration SQL; legacy rows (no `englishUpdatedAt`) are not backfilled and the migration says so**
  - [ ] **R1.T1.4: Tests — a freshly translated review is never stale; an English edit newer than the translation is stale; legacy rows are skipped**
- [x] **R1.T2: The delayed re-run reads fresh content (F2)** — covers: F2, FR-7, AC-7
  - [ ] **R1.T2.1: In the retry, re-read the review (English locale) and skip the retry when it is gone, no longer published, or a newer translation already exists**
  - [ ] **R1.T2.2: Test — a failed run followed by a successful run with changed content keeps the newer translation when the delayed retry fires**
- [x] **R1.T3: The poller reacts to a just-saved document (F3)** — covers: F3, FR-1, FR-2, AC-1, AC-2
  - [ ] **R1.T3.1: Extract a pure `shouldPollTranslationStatus` rule that also polls while the document was modified within a recent window, and use it in the poller**
  - [ ] **R1.T3.2: Tests — the save-triggered case polls; a long-idle document does not**
- [x] **R1.T4: Cover `isTranslationLocked` (F4)** — covers: F4, FR-4, AC-4
  - [ ] **R1.T4.1: Tests — Redis hit, Redis miss, Redis error falling through to the memory map, and the memory-only path**
- [x] **R1.T5: Bound the bulk batch (F5)** — covers: F5, FR-4, AC-4
  - [ ] **R1.T5.1: Stop the sequential loop at a wall-clock budget and report the unattempted ids as skipped with a reason**
  - [ ] **R1.T5.2: Test — the budget stops the loop and every id still reports an outcome**
- [x] **R1.T6: The bell badge shows the real backlog (L1)** — covers: L1, FR-3
  - [ ] **R1.T6.1: Use `totalDocs` from the REST list response for the badge count, keeping the "+" suffix past the limit**
  - [ ] **R1.T6.2: Test the count/limit formatting**
- [x] **R1.T7: Contract alignment (L2, L4)** — covers: L2, L4
  - [x] **R1.T7.1: Amend Phase 3's `Touches` and the FR-4/AC-4/FR-8/AC-8 wording in `spec.md` to match the delivered surface** — applied by the primary in the review commit
  - [x] **R1.T7.2: Tick the delivered sub-task checkboxes** — applied by the primary in the review commit

<!--
Review fixes are appended by `conductor-review` as:

## Phase R2: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase R1
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R2.T1: Resolve <finding ID>** — covers: <finding ID>
-->
