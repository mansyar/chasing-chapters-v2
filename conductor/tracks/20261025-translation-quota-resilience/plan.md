# Translation Quota Resilience - Implementation Plan

> **Branch:** `fix/20261025-translation-quota-resilience`
> **Base:** `main` @ `bdc422d`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Character-aware batching

- **Goal:** Provider requests are packed by character count and can never exceed the hard cap, regardless of how many strings are in the batch.
- **Depends on:** none
- **Covers:** FR-1, NFR-6, AC-1
- **Touches:** `src/lib/translate.ts`, `src/lib/__tests__/translate-batch.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 5e5500c
**Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-1.md

- [x] **P1.T1: Replace string-count chunking with character packing** - covers: FR-1
  - [x] **P1.T1.1: Add `TRANSLATION_BATCH_CHAR_TARGET` (5000) and `TRANSLATION_BATCH_CHAR_CAP` (25000) constants** - target is Google's recommendation; cap stays well under the 30K limit.
  - [x] **P1.T1.2: Write a packing function that accumulates code points and closes a batch at the target** - must preserve the existing dedupe and original-order reassembly.
  - [x] **P1.T1.3: Handle a single text longer than the cap** - send it alone in its own request rather than splitting it.
  - [x] **P1.T1.4: Keep `batchSize` as a secondary ceiling** - a batch satisfies both the character target and the existing count limit.
- [x] **P1.T2: Cover the packing behaviour with tests** - covers: AC-1
  - [x] **P1.T2.1: Test that a batch exceeding 5000 code points splits into multiple requests, each under the cap.**
  - [x] **P1.T2.2: Test that a single oversized text is sent alone and still returns its translation.**
  - [x] **P1.T2.3: Test that dedupe and original-order reassembly still hold across multiple packed chunks.**

## Phase 2: Rolling character budget

- **Goal:** A request that would push the rolling 100-second character total past the configured limit does not reach the provider until the window rolls forward.
- **Depends on:** Phase 1
- **Covers:** FR-2, FR-3, FR-4, NFR-1, NFR-2, AC-2, AC-3, AC-4
- **Touches:** `src/lib/translation-budget.ts`, `src/lib/__tests__/translation-budget.test.ts`, `src/lib/env.ts`, `src/lib/translate.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** in_progress

- [ ] **P2.T1: Build the budget module** - covers: FR-2, FR-4
  - [ ] **P2.T1.1: Implement Redis-backed rolling window** - a time-bucketed `INCRBY` keyed by character count, expiring at the window boundary. Do not reuse `rate-limit.ts`; it increments by 1 and is a fixed-window counter.
  - [ ] **P2.T1.2: Implement the in-process Map fallback** - mirror `translation-lock.ts`'s degradation shape, applied when Redis is absent or errors.
  - [ ] **P2.T1.3: Expose `reserveCharacters(n)` and `remainingCharacters()` with an injectable clock** - the clock is what makes the regression test deterministic.
  - [ ] **P2.T1.4: Bound the wait** - a request that cannot be reserved is deferred within a bounded time or skipped; it must never wait indefinitely (NFR-2).
- [ ] **P2.T2: Make the limit configurable** - covers: FR-3
  - [ ] **P2.T2.1: Add a validated env var defaulting to 100000 characters per 100 seconds** - validated through the existing `env.ts` schema, not read ad hoc.
- [ ] **P2.T3: Wire the budget into the request path** - covers: FR-2, NFR-1
  - [ ] **P2.T3.1: Reserve characters immediately before each provider call**, after cache misses are resolved so cache hits consume nothing.
  - [ ] **P2.T3.2: Ensure a budget failure never blocks the review save** - translation remains independent of persistence (NFR-3).
- [ ] **P2.T4: Cover the budget with tests** - covers: AC-2, AC-3, AC-4
  - [ ] **P2.T4.1: Test that a request exceeding the limit waits for the window to roll, using the injected clock.**
  - [ ] **P2.T4.2: Test that changing the env var changes the enforced limit.**
  - [ ] **P2.T4.3: Test that enforcement still applies when Redis is unavailable.**
  - [ ] **P2.T4.4: Test that cache hits reserve nothing.**

## Phase 3: Quota classification and structured logging

- **Goal:** A quota response costs exactly one provider attempt and is identifiable from its log line alone.
- **Depends on:** Phase 2
- **Covers:** FR-5, FR-8, AC-5, AC-8
- **Touches:** `src/lib/translate.ts`, `src/lib/translation-errors.ts`, `src/lib/__tests__/translate.test.ts`, `src/lib/__tests__/translation-errors.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P3.T1: Make quota non-retryable** - covers: FR-5
  - [ ] **P3.T1.1: Add an `isRetryable(kind)` predicate to `translation-errors.ts`** - `quota` returns false; `network` and `timeout` keep their existing behaviour.
  - [ ] **P3.T1.2: Break out of the retry loop on a non-retryable classification** - the failure is reported after one attempt, not three.
  - [ ] **P3.T1.3: Preserve the transient flag for the delayed re-run** - quota stays transient in `TRANSIENT_KINDS` so the existing automatic re-run still fires.
- [ ] **P3.T2: Replace the raw error dump with structured fields** - covers: FR-8
  - [ ] **P3.T2.1: Build a structured fields object** - `code`, `reason`, `characters`, `texts`, `attempt`, `remainingBudget`.
  - [ ] **P3.T2.2: Stop passing the raw error object to the logger** - this is what currently prints `response: Gunzip { _writeState, _readableState, ... }` instead of the error body.
  - [ ] **P3.T2.3: Retain the raw detail as a bounded string field** so debugging does not lose information.
- [ ] **P3.T3: Cover classification and logging with tests** - covers: AC-5, AC-8
  - [ ] **P3.T3.1: Regression test - a mocked `403 userRateLimitExceeded` produces exactly one provider call.** This test must fail before the change (three calls) and pass after.
  - [ ] **P3.T3.2: Test that the failure writes `translationStatus: "failed"` carrying the quota message.**
  - [ ] **P3.T3.3: Test that the emitted log contains `code`, `reason`, and character count, and contains no `Gunzip` or `_readableState` text.**
  - [ ] **P3.T3.4: Test that network and timeout failures still retry.**

## Phase 4: Call-site fixes

- **Goal:** Neither the quote fan-out nor a bulk run can produce an unbounded burst of characters.
- **Depends on:** Phase 2
- **Covers:** FR-6, FR-7, AC-6, AC-7
- **Touches:** `src/hooks/translateReview.ts`, `src/lib/retranslate.ts`, `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/retranslate-bulk.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P4.T1: Translate favorite quotes in one call** - covers: FR-6
  - [ ] **P4.T1.1: Replace the `Promise.all` of per-quote `translateText` calls with a single batched call** - `translateBatch` already accepts an array and returns aligned results.
  - [ ] **P4.T1.2: Preserve page numbers and array order** when mapping translations back onto the quote objects.
  - [ ] **P4.T1.3: Handle an empty or all-blank quote array without issuing a request.**
- [ ] **P4.T2: Bound bulk retranslate by the shared budget** - covers: FR-7
  - [ ] **P4.T2.1: Thread the character budget through the bulk run** alongside the existing 30-second wall clock.
  - [ ] **P4.T2.2: Report remaining reviews as `skipped`** with a distinct reason when the character budget is reached, mirroring the existing budget-stop behaviour.
  - [ ] **P4.T2.3: Keep whichever limit is reached first authoritative** - wall clock or characters, no change to the existing time-budget semantics.
- [ ] **P4.T3: Cover both call sites with tests** - covers: AC-6, AC-7
  - [ ] **P4.T3.1: Test that N quotes produce one provider call, not N.**
  - [ ] **P4.T3.2: Test that a bulk run stops at the character budget and reports the remainder as skipped rather than failed.**
  - [ ] **P4.T3.3: Test that the wall-clock stop still behaves as before.**

## Phase 5: Pipeline robustness

- **Goal:** A translation run cannot be silently lost, run twice concurrently, or write an illegal status transition.
- **Depends on:** Phase 4
- **Covers:** FR-10, FR-11, FR-12, AC-10, AC-11, AC-12
- **Touches:** `src/hooks/translateReview.ts`, `src/lib/translation-lock.ts`, `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/translation-lock.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P5.T1: Capture pipeline failures after the response is sent** - covers: FR-10
  - [ ] **P5.T1.1: Attach explicit error capture to the fire-and-forget pipeline invocation** so a throw becomes one classified log entry rather than an unhandled rejection.
  - [ ] **P5.T1.2: Do not make the save path await the pipeline** - the review must save regardless of translation outcome (NFR-3).
- [ ] **P5.T2: Size the lock TTL to the worst-case run** - covers: FR-11
  - [ ] **P5.T2.1: Derive the TTL from the retry policy and request timeout constants** rather than a fixed 10 minutes.
  - [ ] **P5.T2.2: Test that the computed TTL exceeds the worst-case duration implied by those constants**, so a slow provider cannot outlive its own lock.
- [ ] **P5.T3: Restrict `markTranslationStale` to legal transitions** - covers: FR-12
  - [ ] **P5.T3.1: Only write `stale` from `translated`** - writing it from `untranslated` is rejected by the validator and the error is currently swallowed, leaving the review silently untranslated.
  - [ ] **P5.T3.2: Leave other statuses unchanged** rather than attempting a write that will be rejected.
- [ ] **P5.T4: Cover the robustness fixes with tests** - covers: AC-10, AC-11, AC-12
  - [ ] **P5.T4.1: Test that a pipeline throw produces one classified log entry and no unhandled-rejection warning.**
  - [ ] **P5.T4.2: Test that `markTranslationStale` on an `untranslated` review leaves its status unchanged and logs no validator error.**
  - [ ] **P5.T4.3: Test the TTL derivation against the retry and timeout constants.**

## Phase 6: Admin visibility of quota failures

- **Goal:** The admin attention bell separates quota failures from network, timeout, and unexpected failures.
- **Depends on:** Phase 3
- **Covers:** FR-9, AC-9
- **Touches:** `src/components/admin/translation-attention.ts`, `src/lib/translation-errors.ts`, `src/components/admin/__tests__/translation-attention.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P6.T1: Classify stored failures by kind in the attention data** - covers: FR-9
  - [ ] **P6.T1.1: Derive the kind from the persisted `translationError` using the existing classifier**, rather than adding a new stored field.
  - [ ] **P6.T1.2: Expose a per-kind breakdown** alongside the existing total count.
- [ ] **P6.T2: Surface the breakdown in the bell** - covers: FR-9
  - [ ] **P6.T2.1: Show quota failures as a distinct line** so an operator can tell "Google is throttling" from "credentials are wrong" without reading logs.
  - [ ] **P6.T2.2: Keep the existing `N+` cap behaviour** for counts beyond the display limit.
- [ ] **P6.T3: Cover the breakdown with tests** - covers: AC-9
  - [ ] **P6.T3.1: Test that quota failures are separated from network, timeout, and unexpected failures.**
  - [ ] **P6.T3.2: Test that an unclassifiable stored message falls back to `unexpected` rather than throwing.**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-1.md
-->

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 6
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** - covers: <finding ID>
-->
