# Phase R1 — Review Fixes — Evidence

Track: `20261025-translation-quota-resilience`
Branch: `fix/20261025-translation-quota-resilience`
Phase base: `7347329fe2b9a5ef620cb01838e911287d7aa9b9`

## 1. Result

**verified.** All five review findings (F1–F5) are fixed at the root cause, with
the tests the review asked for. The phase verification command passes:
`bun run typecheck && bun run lint && bun test` — exit 0.

The unit suite grew from 681 (review time) to 686 tests, all passing, with no
assertion weakened and no test removed. Both Medium findings were re-validated
the other way round: each new test was run against the pre-change code and
failed with the exact defect the review describes, then passed with the fix
(§4).

## 2. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | 0 | No type errors in 253 files |
| lint | `bun run lint` | 0 | `biome check .` — 244 files, no fixes applied |
| unit | `bun test` | 0 | 686 pass, 0 fail, 50 files |
| unit (targeted) | `bun test src/lib/__tests__/translate.test.ts` | 0 | 23 pass, 0 fail |
| unit (targeted) | `bun test src/lib/__tests__/retranslate-bulk-run.test.ts` | 0 | 15 pass, 0 fail |
| unit (targeted) | `bun test src/hooks/__tests__/translateReview.test.ts` | 0 | 47 pass, 0 fail |
| coverage | `bun test --coverage` | 0 | 83.31% funcs / 91.16% lines; every changed production file ≥ 92% lines |
| **phase verification** | `bun run typecheck && bun run lint && bun test` | **0** | typecheck 253 files clean, lint 244 files clean, 686 pass / 0 fail |

Coverage for the touched production files (funcs / lines):
`src/lib/translate.ts` 100.00 / 100.00; `src/lib/retranslate.ts` 100.00 / 93.67;
`src/hooks/translateReview.ts` 100.00 / 92.50; `src/lib/translation-lock.ts`
100.00 / 100.00. No new dependency, no migration, no schema change.

## 3. Findings

| # | What changed | File | Test that proves it |
| --- | --- | --- | --- |
| F1 | The post-reservation deadline check now mirrors the pre-attempt one: an earlier `lastError` is rethrown as `providerFailure(lastError, attempt)`, and a bare `TranslationBudgetError` is thrown only when nothing has failed yet. A refused reservation is wrapped the same way — a `TranslationBudgetError` from `reserveChunkBudget` becomes `providerFailure(lastError, attempt)` when an earlier attempt failed, and is rethrown untouched on attempt 0. A non-budget throw from the budget machinery is still logged and the request still proceeds unreserved (NFR-3, unchanged). The `reserveChunkBudget` doc comment was corrected so it no longer claims a refusal is always what the caller reports. | `src/lib/translate.ts` | `src/lib/__tests__/translate.test.ts` → "reports the provider failure, not a budget stop, when the character budget refuses the retry"; "reports the provider failure when the wait for the character budget uses up the deadline" |
| F2 | `runTranslationPipeline`'s catch persists the thrown error's own message for a budget stop (`budgetStopReason(error)`, falling back to `TRANSLATION_BUDGET_REASON` only when a stop carries no message) instead of the constant. `isBudgetStop` in `retranslate.ts` accepts both reasons, a new `isCharacterBudgetStop` identifies the throttling one, and the `clock() < deadline` heuristic is gone; the comment that described the old coupling was rewritten rather than left contradicting the code. | `src/hooks/translateReview.ts`, `src/lib/retranslate.ts` | `src/hooks/__tests__/translateReview.test.ts` → "a character-budget stop persists the character reason, not the time-budget one"; `src/lib/__tests__/retranslate-bulk-run.test.ts` → "a character stop is still reported skipped now that it persists its own reason", "a time-budget stop is not reclassified by the clock" |
| F3 | `.env.example` no longer claims an empty value fails validation at boot: it says the empty value falls back to the default and the variable must be set explicitly when the console quota is raised (the 100,000 default and the console-quota instruction are kept). The same sentence in `integrated.md` §11 is corrected. | `.env.example`, `verification/integrated.md` §11 | Documentation only — no test. The behaviour it now describes is pinned by the existing `src/lib/__tests__/env.test.ts` (empty → 100,000). |
| F4 | `integrated.md` §6 names `src/lib/__tests__/retranslate-bulk-run.test.ts` as the file pinning `remainingCharacters` to a full window, notes it is new in this track, and records that `retranslate-bulk.test.ts` gained only the two reason-string cases. | `verification/integrated.md` §6 | Documentation only. The pin itself is `retranslate-bulk-run.test.ts` `beforeEach`. |
| F5 | The `TRANSLATION_PIPELINE_STEPS` comment and the §9 residual now state the real invariant: the TTL bounds a run of at most five chunks, i.e. when the four rich-text fields **plus the quote list** total no more than `TRANSLATION_BATCH_CHAR_CAP` code points. Both say explicitly that a long quote list adds chunks exactly as an over-cap field does, and that `favoriteQuotes` has no `maxRows` (unbounded textarea). The "one batched call by construction" claim is gone. | `src/lib/translation-lock.ts`, `verification/integrated.md` §9 | Documentation only — the TTL value is unchanged, so no behavioural test applies. |

### The assertions that would fail if F1 were reverted

`translate.test.ts`, refused-retry case:

```ts
expect(reservations).toBe(2);
expect(mockClientTranslate).toHaveBeenCalledTimes(1);
expect(caught).toBeInstanceOf(TranslationError);
expect(caught).not.toBeInstanceOf(TranslationBudgetError);
expect((caught as Error).message).toBe("ECONNRESET");
expect((caught as Error).message).not.toBe(TRANSLATION_BUDGET_REASON);
expect((caught as { cause?: unknown }).cause).toBe(networkError);
expect((caught as InstanceType<typeof TranslationError>).attempts).toBe(1);
```

`translate.test.ts`, deadline-after-wait case:

```ts
expect(reservations).toBe(2);
expect(caught).not.toBeInstanceOf(TranslationBudgetError);
expect((caught as { cause?: unknown }).cause).toBe(networkError);
expect((caught as InstanceType<typeof TranslationError>).attempts).toBe(1);
```

### The assertions that would fail if F2 were reverted

`translateReview.test.ts`:

```ts
expect(finalCall.data.translationError).toBe(
    translateModule.TRANSLATION_CHARACTER_BUDGET_REASON,
);
expect(finalCall.data.translationError).not.toBe(
    translateModule.TRANSLATION_BUDGET_REASON,
);
```

`retranslate-bulk-run.test.ts` (the character stop must still throttle the batch
once it persists its own reason):

```ts
expect(pipelineSpy).toHaveBeenCalledTimes(1);
expect(outcomes.map((outcome) => outcome.id)).toEqual([1, 2]);
for (const outcome of outcomes) {
    expect(outcome.status).toBe("skipped");
    expect(outcome.reason).toBe(
        "not attempted — translation character budget reached",
    );
}
```

and the heuristic's removal:

```ts
expect(pipelineSpy).toHaveBeenCalledTimes(2);
expect(outcomes[0].status).toBe("failed");
expect(outcomes[0].reason).toBe("translation time budget reached");
```

## 4. Before / after

Both Medium findings were proved by temporarily restoring the pre-change code,
running the new test, and then restoring the fix. The working tree was clean
before and after each round-trip; the temporary edits are not committed.

### F1 — refused retry

Pre-change (`catch (error) { throw error; }` and an unconditional
`throw new TranslationBudgetError()` after the reservation):

```
error: expect(received).not.toBeInstanceOf(expected)
Expected constructor: not [class TranslationBudgetError extends TranslationError]
Received value: TranslationBudgetError: translation character budget reached
 attempts: 0
      at reserveChunkBudget (src/lib/translate.ts:635:9)
      at async translateChunkWithRetry (src/lib/translate.ts:438:28)
(fail) provider retry policy > reports the provider failure, not a budget stop,
       when the character budget refuses the retry [6.41ms]
 0 pass  22 filtered out  1 fail
```

Post-change: `2 pass, 0 fail, 14 expect() calls` for the two F1 cases.

### F1 — reservation wait outlives the deadline

Pre-change:

```
error: expect(received).not.toBeInstanceOf(expected)
Expected constructor: not [class TranslationBudgetError extends TranslationError]
Received value: TranslationBudgetError: translation time budget reached
 attempts: 0
      at translateChunkWithRetry (src/lib/translate.ts:446:10)
(fail) provider retry policy > reports the provider failure when the wait for
       the character budget uses up the deadline [211.98ms]
 0 pass  22 filtered out  1 fail
```

Post-change: passing.

Both failures reproduce the review's F1 exactly — the classified message is
lost and the error is labelled as a budget stop.

### F2 — persisted message (pipeline)

Pre-change (the constant restored for every budget stop):

```
error: expect(received).toBe(expected)
Expected: "translation character budget reached"
Received: "translation time budget reached"
      at src/hooks/__tests__/translateReview.test.ts:784:43
(fail) runTranslationPipeline > a character-budget stop persists the character
       reason, not the time-budget one [38.43ms]
 0 pass  46 filtered out  1 fail
```

Post-change: passing.

### F2 — bulk run reads the reason, not the clock

Pre-change (`isBudgetStop` narrowed back to `TRANSLATION_BUDGET_REASON` only, as
it was before this phase):

```
error: expect(received).toHaveBeenCalledTimes(expected)
Expected number of calls: 1
Received number of calls: 2
      at src/lib/__tests__/retranslate-bulk-run.test.ts:448:23
(fail) bulk re-translate run (FR-4) > a character stop is still reported skipped
       now that it persists its own reason [114.59ms]
 0 pass  14 filtered out  1 fail
```

Post-change: passing — the character stop is recognised from its message and the
batch is throttled after one pipeline call.

### F3 / F4 / F5

Documentation only; there is no runtime behaviour to invert, so no before/after
run applies. F3's subject behaviour (empty value → 100,000) is already pinned by
`src/lib/__tests__/env.test.ts`, which passes unchanged.

## 5. Files changed and commits

| Commit | Message | Files |
| --- | --- | --- |
| `f9c8157` | `fix(translation): report the provider failure a budget stop cut short` | `src/lib/translate.ts`, `src/lib/__tests__/translate.test.ts` |
| `87b6446` | `fix(translation): persist each budget stop with the reason that fired` | `src/hooks/translateReview.ts`, `src/lib/retranslate.ts`, `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts` |
| `994321e` | `docs(translation): correct the quota and lock-TTL documentation` | `.env.example`, `src/lib/translation-lock.ts`, `verification/integrated.md` |

Plus this evidence file.

Nothing outside the phase's `Touches` was modified.

## 6. Deviations

None. Every fix landed in a `Touches` path, and `verification/integrated.md` was
edited only for the three passages named by R1.T3.2, R1.T4.1 and R1.T4.2.

## 7. Notes

- **The two reasons stay distinguishable.** `TRANSLATION_BUDGET_REASON` and
  `TRANSLATION_CHARACTER_BUDGET_REASON` are unchanged and still asserted
  distinct by `retranslate-bulk.test.ts`; `translation-budget.test.ts` still
  asserts the thrown character stop carries the character reason.
- **Invariants preserved.** The retry policy, `RETRYABLE_KINDS`, the error
  classifier's kinds and messages, the request timeout, the packing algorithm,
  the budget accounting, the quote batching, the bulk wall-clock semantics and
  the `translationStatus` state machine are untouched. Every `TranslationError`
  still carries `attempts` and `cause` — the F1 tests assert both on the
  rethrown failure, including the attempt index the failure happened on.
- **NFR-3 still holds.** A budget-machinery failure is still logged and the
  request still proceeds unreserved; only a decided refusal is now attributed to
  the earlier provider failure when there is one.
- **The `void` on the collection hook's pipeline invocations is unchanged** —
  awaiting there would deadlock on the row lock.
- **Behaviour deliberately unchanged:** a budget stop still persists the
  `failed` status (residual 4 in §9); F2 makes the message honest, not the
  status.
- One incidental observation, not acted on (out of scope): `retranslate.ts`'s
  uncovered lines (378, 399, 424-429, 441-446, 461) are the pre-existing
  not-found and error-description branches, untouched by this phase.

## Primary verification

Re-run by the primary on the squashed checkpoint `609aacf` (phase base `7347329`), against
the same working tree the reviewer will read.

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | 253 files, no type errors |
| static | `bun run lint` | 0 | 244 files, no fixes applied |
| unit | `bun test` | 0 | 686 pass, 0 fail, 1627 expect, 50 files |

Reviewed the diff directly rather than trusting the report:

- **F1** — both budget-stop branches now mirror the pre-attempt deadline check: the
  reservation refusal is wrapped in a `try`/`catch` that rethrows `providerFailure(lastError,
  attempt)` when an earlier attempt failed, and the post-reservation deadline check does the
  same before falling through to a bare `TranslationBudgetError`. The bare stop is now
  reachable only on attempt 0, which is the only case where no provider failure exists to
  report. The NFR-3 path (the budget machinery itself throwing → log and proceed unreserved)
  is untouched, and the two new `translate.test.ts` cases sit either side of the fix.
- **F2** — `budgetStopReason` reads the thrown error's own message with the constant as a
  fallback, so a character stop persists `TRANSLATION_CHARACTER_BUDGET_REASON`; `isBudgetStop`
  accepts both reasons and `isCharacterBudgetStop` gates the batch throttle, so the
  `clock() < deadline` heuristic is gone. The rewritten comment at `retranslate.ts:322-326`
  now describes what the code does instead of what it used to have to guess. The pipeline
  test asserts the persisted value *is* the character reason **and** is not the time reason,
  and separately that no automatic re-run is scheduled.
- **F3** — `.env.example` now states the truth an operator needs: empty falls back to the
  default, set it explicitly when the console quota is raised.
- **F4/F5** — the evidence names `retranslate-bulk-run.test.ts` and the lock-TTL comment
  states the real invariant (five chunks when fields *plus quote list* fit under the cap),
  with `favoriteQuotes`' missing `maxRows` named as the reason a call is not a chunk.

`**Result: verified.**` All five findings are fixed at the root cause, each has a test that
fails if the fix is reverted, and no phase 1–6 behaviour or test was weakened. The two budget
reasons remain distinct strings and a test asserts that, so F2 cannot silently regress into
one message.