# Phase 3 Verification — Quota classification and structured logging

- **Track:** 20261025-translation-quota-resilience — Translation Quota Resilience
- **Phase:** 3 — Quota classification and structured logging
- **Date:** 2026-10-25
- **Branch:** `fix/20261025-translation-quota-resilience`
- **Base commit:** `5bd2fa83271af5952eff08fed166833c051e92e2`
- **Head commit:** `1116a5c` (code and tests)
- **Result:** verified

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors in 252 files (824.73ms) |
| static | `bun run lint` | 0 | `biome check .` — 243 files checked, no fixes applied (176ms) |
| unit | `bun test` | 0 | 648 pass, 0 fail, 1521 `expect()` calls, 49 files (2.75s) |
| unit (targeted) | `bun test src/lib/__tests__/translate.test.ts src/lib/__tests__/translation-errors.test.ts` | 0 | 53 pass, 0 fail, 127 `expect()` calls |
| unit (coverage) | `bun test --coverage src/lib/__tests__/translation-errors.test.ts src/lib/__tests__/translate.test.ts` | 0 | `translation-errors.ts` — 100% lines, 100% functions; `translate.ts` — 87.74% lines, 83.78% functions |
| phase | `bun run typecheck && bun run lint && bun test` | 0 | All three layers pass |

The phase command was run exactly as written in the brief, as one command.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-5 | A mocked `403 userRateLimitExceeded` produces exactly one provider call and a `failed` status carrying the quota message | `translate.test.ts` → "costs exactly one provider call for a 403 userRateLimitExceeded": the mock is a Google `ApiError` shape (`code: 403`, `errors[0].reason: "userRateLimitExceeded"`, a `Gunzip`-shaped `response`); `mockClientTranslate` is called **once**, the thrown `TranslationError` reports `attempts === 1`, and `classifyTranslationError(caught).kind === "quota"`. "reports the quota failure as a failed status with the actionable message": `createFailedStatus(caught, attempts)` yields `status: "failed"` with `attempts: 1`, and `formatTranslationError(caught)` — the string persisted to `translationError` and read by the admin UI — contains "Translation quota exceeded." and "Wait a few minutes before retrying". The same one-attempt behaviour is asserted for the pre-existing quota test in `translate-batch.test.ts` | pass |
| AC-8 | A quota failure's log line contains `code`, `reason`, and character count, and contains no `Gunzip` or `_readableState` text | `translate.test.ts` → "logs code, reason and character count without dumping the error object": `console.error` is captured and serialized the way the console would; the line contains `403`, `userRateLimitExceeded`, `characters: 10` (two five-code-point strings), `texts: 2` and `attempt: 1`, and contains none of `Gunzip`, `_readableState`, `_writeState`. "keeps the raw detail, bounded" asserts the bounded `detail` field is present, carries the message, and keeps the whole line under 2000 characters | pass |
| FR-5 | A 403 matching the rate-limit pattern is classified as quota and is not retried — a single-attempt failure | `translation-errors.ts` → `RETRYABLE_KINDS = ["network", "timeout", "unexpected"]` and `isRetryable(kind)`; `translate.ts` → the `!isRetryable(classified.kind)` branch in `translateChunkWithRetry` throws `providerFailure(error, attempt + 1)` before any backoff. The classification itself is unchanged (`403` + quota message → `quota`), which the existing `translation-errors.test.ts` cases still assert | pass |
| FR-8 | Failures log `code`, `errors[0].reason`, character count, text count, attempt number and remaining budget as structured fields, without passing the raw error object to the logger | `translate.ts` → `logAttemptFailure` builds one fields object (`kind`, `code`, `reason`, `characters`, `texts`, `attempt`, `remainingBudget`, `retryable`, `detail`) and passes it as the only argument after the message; `summarizeErrorDetail` reduces the raw error to a bounded string. `extractProviderErrorDetails` reads `code` and `errors[0].reason` across the cause chain, covered by three `translation-errors.test.ts` cases | pass |

## Task coverage

| Task | Covered by |
| --- | --- |
| P3.T1.1 | `translation-errors.ts` → `RETRYABLE_KINDS` and `isRetryable(kind)`, with a doc comment stating why `quota` and `credentials` are excluded. `translation-errors.test.ts` → `isRetryable` group: `quota`/`credentials` false; `network`/`timeout`/`unexpected` true |
| P3.T1.2 | `translate.ts` → `translateChunkWithRetry`'s `catch` classifies the failure and, when `!isRetryable(classified.kind)`, throws `providerFailure(error, attempt + 1)` before the backoff. The `providerFailure` path is unchanged, so the error is still a `TranslationError` whose `cause` is the provider error and whose `attempts` is the real count |
| P3.T1.3 | `TRANSIENT_KINDS` is untouched — `quota` is still in it. The comment above `RETRYABLE_KINDS` states the distinction explicitly ("Not retryable in the tight loop" vs "worth retrying later") and names `translateReview.ts`'s delayed re-run as the consumer. `translation-errors.test.ts` → "quota stays transient even though it is not retryable" pins both answers in one test |
| P3.T2.1 | `translate.ts` → `logAttemptFailure` logs `kind`, `code`, `reason`, `characters`, `texts`, `attempt`, `remainingBudget` (plus `retryable` and `detail`). `remainingBudget` comes from `reserveChunkBudget`, which now returns `reservation.remaining` |
| P3.T2.2 | The raw error object is no longer passed to the logger anywhere on the attempt path: `logAttemptFailure` passes the fields object only, and `reserveChunkBudget`'s budget-machinery failure logs `{ detail: summarizeErrorDetail(error) }` instead of `error` |
| P3.T2.3 | `summarizeErrorDetail` keeps the stack (or message for a non-`Error`) truncated at `MAX_LOG_DETAIL_LENGTH = 400` characters with an ellipsis. Test: "keeps the raw detail, bounded" |
| P3.T3.1 | "costs exactly one provider call for a 403 userRateLimitExceeded" — demonstrated failing at 3 calls and passing at 1 call; see Notes |
| P3.T3.2 | "reports the quota failure as a failed status with the actionable message" |
| P3.T3.3 | "logs code, reason and character count without dumping the error object" |
| P3.T3.4 | "still retries a network failure" (2 calls: fail then succeed), "still retries a timeout" (2 calls), "still exhausts every attempt for an unexpected failure" (3 calls, `attempts === 3`) — the non-retryable set did not widen. "does not retry a rejected credential either" pins `credentials` at 1 call |

## Evidence paths

- `src/lib/translation-errors.ts` — `isRetryable`, `RETRYABLE_KINDS`, `extractProviderErrorDetails`, and the comment separating retryability from transience
- `src/lib/translate.ts` — `logAttemptFailure`, `summarizeErrorDetail`, `MAX_LOG_DETAIL_LENGTH`, the non-retryable branch in `translateChunkWithRetry`, and `reserveChunkBudget`'s new return value
- `src/lib/__tests__/translate.test.ts` — provider-mock harness plus the `provider retry policy` group (8 tests)
- `src/lib/__tests__/translation-errors.test.ts` — `isRetryable` (3 tests) and `extractProviderErrorDetails` (3 tests)
- `src/lib/__tests__/translate-batch.test.ts` — the quota test updated from three attempts to one
- Commits: `1116a5c` (implementation and tests), and the commit carrying this file

## Deviations

| File | Reason |
| --- | --- |
| `src/lib/__tests__/translate-batch.test.ts` | Outside the phase's `Touches`, but it contains the assertion that *encodes the defect*: "throws TranslationError after the final retry instead of returning English" asserted `attempts === 3` and `mockClientTranslate` called 3 times for a `new Error("quota exceeded")`. Leaving it unchanged makes the suite fail by construction — it is the pre-change behaviour, written down. The test was updated in place to `attempts === 1` / 1 call with a comment explaining why; nothing else in that file changed (6 lines). Its `TranslationError` / not-a-`TranslationBudgetError` / message assertions are untouched |

No other file outside `Touches` was modified.

## Notes

### Before/after attempt counts for the regression test (P3.T3.1)

The proof that the defect existed is the same test, run against both the
pre-change and post-change code. Both runs used the same command against the
same test file:

```
bun test src/lib/__tests__/translate.test.ts -t "costs exactly one provider call"
```

**Before the change** — `translate.ts`'s non-retryable branch disabled, so the
loop behaved exactly as it did on `5bd2fa8` (every attempt retried):

```
361 | 			caught = error;
362 | 		}
363 |
364 | 		// The regression: before this change the loop burned all three
365 | 		// attempts on an allowance that was already gone.
366 | 		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
                                    ^
error: expect(received).toHaveBeenCalledTimes(expected)

Expected number of calls: 1
Received number of calls: 3

      at <anonymous> (...\src\lib\__tests__\translate.test.ts:366:31)
(fail) provider retry policy > costs exactly one provider call for a 403 userRateLimitExceeded [10.14ms]

 0 pass
 20 filtered out
 1 fail
 1 expect() calls
Ran 1 test across 1 file. [123.00ms]

Exited with code 1
```

The captured log lines for that run show the three attempts the production
incident logged — `Attempt 1/3`, `Attempt 2/3`, `Attempt 3/3`, each with
`retryable: false` and each decrementing `remainingBudget` by 5
(`99995 → 99990 → 99985`): three requests spent against the exhausted quota.

**After the change:**

```
 1 pass
 20 filtered out
 0 fail
 4 expect() calls
Ran 1 test across 1 file. [108.00ms]
```

One provider call, and one log line (`Attempt 1/3`, `remainingBudget: 99995`).

**The same before/after for the log test.** With the structured log reverted to
the old `logger.error(message, error)` call, "logs code, reason and character
count without dumping the error object" fails with the exact production
symptom, reproduced in the assertion message:

```
Expected to contain: "characters: 10"
Received: "[Translation] Attempt 1/3 failed for batch of 2: Error: User Rate Limit Exceeded
    at quotaApiError (...)
    at translateChunkWithRetry (...\src\lib\translate.ts:449:12) {
  code: 403,
  errors: [ { message: 'User Rate Limit Exceeded', domain: 'usageLimits',
              reason: 'userRateLimitExceeded' } ],
  response: {
    constructor: { name: 'Gunzip' },
    _readableState: { objectMode: false, highWaterMark: 16384 },
    _writeState: { buffer: [], bufferIndex: 0 }
  }
}"
```

That is the incident's log line, including the `Gunzip` / `_readableState` /
`_writeState` dump and the buried `reason`. With the structured log in place the
line carries `code: 403`, `reason: "userRateLimitExceeded"`, `characters: 10`,
`texts: 2`, `attempt: 1`, `remainingBudget`, `retryable: false` and a bounded
`detail`, and none of the stream internals.

### Why `credentials` is also non-retryable

`classifySingleNode` maps `403` without a quota message, and `401`, to
`credentials`. A rejected key, an unauthenticated request or a missing role is a
configuration fact: nothing about waiting two or eight seconds changes it, so a
retry is a guaranteed failure that also delays the operator's fix by the length
of the backoff ladder. `TRANSIENT_KINDS` already excludes `credentials`, so the
delayed re-run was never scheduled for it — making it non-retryable in the tight
loop aligns the two answers rather than changing the recovery story.

`unexpected` deliberately stays retryable. It is the current behaviour for
anything the classifier cannot name, and narrowing it would silently remove
retries from failures nobody has characterised yet — the opposite of this
phase's intent. The classification logic itself is untouched.

### What `attempts` means now

`providerFailure(error, attempt + 1)` records the attempt that actually failed,
so a quota failure reports `attempts: 1` and a network failure that exhausts the
ladder still reports `3`. `translateReview.ts` reads `error.attempts` straight
into `createFailedStatus` and stores it, so the admin UI will show "after 1
attempt" for a quota stop — which is the truth, and the reason the operator can
tell a quota stop from a transient outage by the count alone.

### The stored error shape is unchanged

The one-attempt path throws through `providerFailure`, not a new error class, so
`translationError` is still
`"Translation quota exceeded. … (raw: User Rate Limit Exceeded)"` —
`formatTranslationError` output with the provider message as `raw`. `TranslationBudgetError`
and `TranslationRequestTimeoutError` are untouched, and the deadline tests in
`translate-batch.test.ts` (budget stop vs provider failure at the deadline) pass
unchanged.

### `remainingBudget` on the failure line

`reserveChunkBudget` now returns `reservation.remaining` so the attempt's own
reservation cost is visible against the window. It is `null` when the budget
machinery failed and the request went out unreserved, which is itself the useful
signal — a quota failure with `remainingBudget: null` means the in-process or
Redis accounting could not answer, not that the window was empty.

### Observations carried forward to review (not blocking)

1. **`logAttemptFailure` logs on the last attempt too.** A chunk that exhausts
   the ladder writes one line per attempt (three for a network outage). That is
   the existing volume, now structured; Phase 6's admin bell owns surfacing
   rather than suppressing. Low.
2. **The `detail` field is a stack, not a message.** For a deeply nested
   provider error the 400-character budget is mostly stack frames, so the
   message can be truncated away mid-stack. The structured `code`/`reason`
   fields carry the identification, so this is a diagnostic-tail trade rather
   than a gap. Low.
3. **`translateReview.ts` still logs `classified.raw` as a bare second
   argument** (`logger.error(\`[Translation] Failed for: … (quota)\`, classified.raw)`).
   That is a string, so it does not produce the `Gunzip` dump, but it is the
   pipeline-level line and Phase 5 owns that call site. Noted so review sees it
   against the final diff. Low.
