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
- **Status:** verified

**Result:** verified
**Checkpoint:** 10f6a1b
**Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-2.md

- [x] **P2.T1: Build the budget module** - covers: FR-2, FR-4
  - [x] **P2.T1.1: Implement Redis-backed rolling window** - a time-bucketed `INCRBY` keyed by character count, expiring at the window boundary. Do not reuse `rate-limit.ts`; it increments by 1 and is a fixed-window counter.
  - [x] **P2.T1.2: Implement the in-process Map fallback** - mirror `translation-lock.ts`'s degradation shape, applied when Redis is absent or errors.
  - [x] **P2.T1.3: Expose `reserveCharacters(n)` and `remainingCharacters()` with an injectable clock** - the clock is what makes the regression test deterministic.
  - [x] **P2.T1.4: Bound the wait** - a request that cannot be reserved is deferred within a bounded time or skipped; it must never wait indefinitely (NFR-2).
- [x] **P2.T2: Make the limit configurable** - covers: FR-3
  - [x] **P2.T2.1: Add a validated env var defaulting to 100000 characters per 100 seconds** - validated through the existing `env.ts` schema, not read ad hoc.
- [x] **P2.T3: Wire the budget into the request path** - covers: FR-2, NFR-1
  - [x] **P2.T3.1: Reserve characters immediately before each provider call**, after cache misses are resolved so cache hits consume nothing.
  - [x] **P2.T3.2: Ensure a budget failure never blocks the review save** - translation remains independent of persistence (NFR-3).
- [x] **P2.T4: Cover the budget with tests** - covers: AC-2, AC-3, AC-4
  - [x] **P2.T4.1: Test that a request exceeding the limit waits for the window to roll, using the injected clock.**
  - [x] **P2.T4.2: Test that changing the env var changes the enforced limit.**
  - [x] **P2.T4.3: Test that enforcement still applies when Redis is unavailable.**
  - [x] **P2.T4.4: Test that cache hits reserve nothing.**

## Phase 3: Quota classification and structured logging

- **Goal:** A quota response costs exactly one provider attempt and is identifiable from its log line alone.
- **Depends on:** Phase 2
- **Covers:** FR-5, FR-8, AC-5, AC-8
- **Touches:** `src/lib/translate.ts`, `src/lib/translation-errors.ts`, `src/lib/__tests__/translate.test.ts`, `src/lib/__tests__/translation-errors.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 48289c5
- **Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-3.md

- [x] **P3.T1: Make quota non-retryable** - covers: FR-5
  - [x] **P3.T1.1: Add an `isRetryable(kind)` predicate to `translation-errors.ts`** - `quota` returns false; `network` and `timeout` keep their existing behaviour.
  - [x] **P3.T1.2: Break out of the retry loop on a non-retryable classification** - the failure is reported after one attempt, not three.
  - [x] **P3.T1.3: Preserve the transient flag for the delayed re-run** - quota stays transient in `TRANSIENT_KINDS` so the existing automatic re-run still fires.
- [x] **P3.T2: Replace the raw error dump with structured fields** - covers: FR-8
  - [x] **P3.T2.1: Build a structured fields object** - `code`, `reason`, `characters`, `texts`, `attempt`, `remainingBudget`.
  - [x] **P3.T2.2: Stop passing the raw error object to the logger** - this is what currently prints `response: Gunzip { _writeState, _readableState, ... }` instead of the error body.
  - [x] **P3.T2.3: Retain the raw detail as a bounded string field** so debugging does not lose information.
- [x] **P3.T3: Cover classification and logging with tests** - covers: AC-5, AC-8
  - [x] **P3.T3.1: Regression test - a mocked `403 userRateLimitExceeded` produces exactly one provider call.** This test must fail before the change (three calls) and pass after.
  - [x] **P3.T3.2: Test that the failure writes `translationStatus: "failed"` carrying the quota message.**
  - [x] **P3.T3.3: Test that the emitted log contains `code`, `reason`, and character count, and contains no `Gunzip` or `_readableState` text.**
  - [x] **P3.T3.4: Test that network and timeout failures still retry.**

## Phase 4: Call-site fixes

- **Goal:** Neither the quote fan-out nor a bulk run can produce an unbounded burst of characters.
- **Depends on:** Phase 2
- **Covers:** FR-6, FR-7, AC-6, AC-7
- **Touches:** `src/hooks/translateReview.ts`, `src/lib/retranslate.ts`, `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/retranslate-bulk.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 96e6a78
- **Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-4.md

- [x] **P4.T1: Translate favorite quotes in one call** - covers: FR-6
  - [x] **P4.T1.1: Replace the `Promise.all` of per-quote `translateText` calls with a single batched call** - `translateBatch` already accepts an array and returns aligned results.
  - [x] **P4.T1.2: Preserve page numbers and array order** when mapping translations back onto the quote objects.
  - [x] **P4.T1.3: Handle an empty or all-blank quote array without issuing a request.**
- [x] **P4.T2: Bound bulk retranslate by the shared budget** - covers: FR-7
  - [x] **P4.T2.1: Thread the character budget through the bulk run** alongside the existing 30-second wall clock.
  - [x] **P4.T2.2: Report remaining reviews as `skipped`** with a distinct reason when the character budget is reached, mirroring the existing budget-stop behaviour.
  - [x] **P4.T2.3: Keep whichever limit is reached first authoritative** - wall clock or characters, no change to the existing time-budget semantics.
- [x] **P4.T3: Cover both call sites with tests** - covers: AC-6, AC-7
  - [x] **P4.T3.1: Test that N quotes produce one provider call, not N.**
  - [x] **P4.T3.2: Test that a bulk run stops at the character budget and reports the remainder as skipped rather than failed.**
  - [x] **P4.T3.3: Test that the wall-clock stop still behaves as before.**

## Phase 5: Pipeline robustness

- **Goal:** A translation run cannot be silently lost, run twice concurrently, or write an illegal status transition.
- **Depends on:** Phase 4
- **Covers:** FR-10, FR-11, FR-12, AC-10, AC-11, AC-12
- **Touches:** `src/hooks/translateReview.ts`, `src/lib/translation-lock.ts`, `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/translation-lock.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** a77c486
- **Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-5.md

- [x] **P5.T1: Capture pipeline failures after the response is sent** - covers: FR-10
  - [x] **P5.T1.1: Attach explicit error capture to the fire-and-forget pipeline invocation** so a throw becomes one classified log entry rather than an unhandled rejection.
  - [x] **P5.T1.2: Do not make the save path await the pipeline** - the review must save regardless of translation outcome (NFR-3).
- [x] **P5.T2: Size the lock TTL to the worst-case run** - covers: FR-11
  - [x] **P5.T2.1: Derive the TTL from the retry policy and request timeout constants** rather than a fixed 10 minutes.
  - [x] **P5.T2.2: Test that the computed TTL exceeds the worst-case duration implied by those constants**, so a slow provider cannot outlive its own lock.
- [x] **P5.T3: Restrict `markTranslationStale` to legal transitions** - covers: FR-12
  - [x] **P5.T3.1: Only write `stale` from `translated`** - writing it from `untranslated` is rejected by the validator and the error is currently swallowed, leaving the review silently untranslated.
  - [x] **P5.T3.2: Leave other statuses unchanged** rather than attempting a write that will be rejected.
- [x] **P5.T4: Cover the robustness fixes with tests** - covers: AC-10, AC-11, AC-12
  - [x] **P5.T4.1: Test that a pipeline throw produces one classified log entry and no unhandled-rejection warning.**
  - [x] **P5.T4.2: Test that `markTranslationStale` on an `untranslated` review leaves its status unchanged and logs no validator error.**
  - [x] **P5.T4.3: Test the TTL derivation against the retry and timeout constants.**

## Phase 6: Admin visibility of quota failures

- **Goal:** The admin attention bell separates quota failures from network, timeout, and unexpected failures.
- **Depends on:** Phase 3
- **Covers:** FR-9, AC-9
- **Touches:** `src/components/admin/translation-attention.ts`, `src/lib/translation-errors.ts`, `src/components/admin/__tests__/translation-attention.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 7032e23
- **Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-6.md

- [x] **P6.T1: Classify stored failures by kind in the attention data** - covers: FR-9
  - [x] **P6.T1.1: Derive the kind from the persisted `translationError` using the existing classifier**, rather than adding a new stored field.
  - [x] **P6.T1.2: Expose a per-kind breakdown** alongside the existing total count.
- [x] **P6.T2: Surface the breakdown in the bell** - covers: FR-9
  - [x] **P6.T2.1: Show quota failures as a distinct line** so an operator can tell "Google is throttling" from "credentials are wrong" without reading logs.
  - [x] **P6.T2.2: Keep the existing `N+` cap behaviour** for counts beyond the display limit.
- [x] **P6.T3: Cover the breakdown with tests** - covers: AC-9
  - [x] **P6.T3.1: Test that quota failures are separated from network, timeout, and unexpected failures.**
  - [x] **P6.T3.2: Test that an unclassifiable stored message falls back to `unexpected` rather than throwing.**

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

## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1, F2, F3, F4 and F5 from `review.md`.
- **Depends on:** Phase 6
- **Covers:** F1, F2, F3, F4, F5
- **Touches:** `src/lib/translate.ts`, `src/lib/retranslate.ts`, `src/hooks/translateReview.ts`, `src/lib/translation-lock.ts`, `.env.example`, `src/lib/__tests__/translate.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`, `src/hooks/__tests__/translateReview.test.ts`, `conductor/tracks/20261025-translation-quota-resilience/verification/integrated.md`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 609aacf
- **Evidence:** conductor/tracks/20261025-translation-quota-resilience/verification/phase-R1.md

- [x] **R1.T1: Never re-label a provider failure as a budget stop** - covers: F1
  - [x] **R1.T1.1:** Mirror the first deadline check in the post-reservation branch: when `lastError` is set, throw `providerFailure(lastError, attempt)` instead of an unconditional `TranslationBudgetError`.
  - [x] **R1.T1.2:** When `reserveChunkBudget` refuses a reservation, rethrow as `providerFailure(lastError, attempt)` if an earlier attempt failed, and as the budget stop only on attempt 0.
  - [x] **R1.T1.3:** Test it: `deadline` set, attempt 1 rejects with `ECONNRESET`, attempt 2 refused by the budget; assert a `TranslationError` whose cause is the network error and whose message is not the budget reason.

- [x] **R1.T2: Persist the message of the budget stop that actually fired** - covers: F2
  - [x] **R1.T2.1:** Store the thrown error's own message for a budget stop instead of the `TRANSLATION_BUDGET_REASON` constant, so a character stop is not recorded as a time-budget stop.
  - [x] **R1.T2.2:** Widen `isBudgetStop` in `retranslate.ts` to accept both reasons, and drop the `clock() < deadline` heuristic that was recovering the distinction.
  - [x] **R1.T2.3:** Assert the persisted `translationError` for a character-budget stop in `translateReview.test.ts`, and prove the bulk run still reports it `skipped` after the message changes.

- [x] **R1.T3: Correct the operator-facing documentation** - covers: F3
  - [x] **R1.T3.1:** Fix the `.env.example` sentence to state that an empty value falls back to the default, and that the variable must be set explicitly when the console quota is raised.
  - [x] **R1.T3.2:** Correct the same sentence in `verification/integrated.md` §11.

- [x] **R1.T4: Correct two evidence defects** - covers: F4, F5
  - [x] **R1.T4.1:** Name `retranslate-bulk-run.test.ts` (not `retranslate-bulk.test.ts`) in `integrated.md` §6 and note the file is new in this track.
  - [x] **R1.T4.2:** Reword the `TRANSLATION_PIPELINE_STEPS` comment and the `integrated.md` §9 residual to the real invariant: the TTL bounds a run of at most five chunks, i.e. when the four rich-text fields plus the quote list total no more than `TRANSLATION_BATCH_CHAR_CAP` code points.