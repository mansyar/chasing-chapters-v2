# Review: Translation Quota Resilience

- **Track:** `20261025-translation-quota-resilience`
- **Type:** `bug`
- **Branch:** `fix/20261025-translation-quota-resilience`
- **Range:** `bdc422de3a0b25eecd167ac685455db345317b78..HEAD`
- **Date:** `2026-10-25T10:40:00Z`
- **Verdict:** `PASS WITH FINDINGS`
- **Gate:** cleared — Phase R1 is verified at `609aacf`; all five findings are fixed

> Round 1 recorded `metadata.review_verdict: "BLOCK"` because `review.strict` is `true`
> and five findings were pending. Round 2 confirms every one is fixed, so the gate is
> cleared and the header verdict — which was always `PASS WITH FINDINGS` on severity —
> now describes the track as it stands.

## Summary

All six phases are implemented as planned and the production defect is genuinely fixed:
character packing bounds each request, a rolling 100-second budget bounds the rate, a
quota response now costs exactly one provider attempt instead of three doomed ones, the
quote fan-out and the bulk run are bounded by the same budget, the lock TTL is derived
from the retry constants, and the attention bell separates failure kinds. Every FR, NFR
and AC has an implementation and a behavioural test, the regression test was demonstrated
failing before the fix (`Received number of calls: 3`) and passing after (`1`), and no
existing test was weakened.

Two Medium findings remain, both in the seam between the budget and error attribution.
**F1** is the substantive one: the post-reservation deadline check throws a
`TranslationBudgetError` unconditionally, so a run that already failed an attempt for a
provider reason and then lost its remaining time to the budget wait is reported as a
budget stop — discarding the classified actionable message and suppressing the automatic
re-run that a transient provider failure deserves. The first deadline check in the same
function does the opposite, which makes the asymmetry a defect rather than a choice. **F2**
persists every budget stop with the *time*-budget message, so a character throttle is
recorded as a wall-clock stop that never expired.

Three Low findings: `.env.example` documents the opposite of the behaviour the post-phase
fix introduced (the one operational knob the spec's open questions call out), the
integrated evidence names the wrong test file for a hardening, and the lock-TTL
justification understates its own trigger.

`review.strict` is `true` and `review.issues.enabled` is `false`, so all five are fixed in
Phase R1 rather than deferred.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 681 pass, 0 fail, 1598 expect, 50 files (2.31s) |
| coverage | `bun test --coverage` | pass | All files 83.31% funcs / 91.16% lines; every changed production file ≥80% |
| lint | `bun run lint` | pass | 244 files, no fixes applied |
| typecheck | `bun run typecheck` | pass | 253 files, no type errors |
| build | `bun run build` | pass | standalone output emitted; requires the e2e database, documented in `verification/integrated.md` §4 |
| e2e | `bun run test:e2e` | pass | 112 passed, 0 failed, 0 flaky (1.6m) |

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | `src/lib/translate.ts:238-243,540-579` | `translate-batch.test.ts` character-packing cases | covered |
| FR-2 | `src/lib/translate.ts:425-437,599-626`; `translation-budget.ts:240-302` | `translation-budget.test.ts` defer/refuse cases | covered |
| FR-3 | `src/lib/env.ts:52-59`; `translation-budget.ts:89-91` | `env.test.ts` (5 cases); "changes the enforced limit" | covered |
| FR-4 | `src/lib/translation-budget.ts:135-228` | `translation-budget.test.ts` fallback cases | covered |
| FR-5 | `translation-errors.ts:68-77`; `translate.ts:484-492` | `translate.test.ts` "costs exactly one provider call for a 403 userRateLimitExceeded" | covered |
| FR-6 | `src/hooks/translateReview.ts:577-591` | `translateReview.test.ts` "N favorite quotes produce one provider call, not N" | covered |
| FR-7 | `src/lib/retranslate.ts:240-291,301-343` | `retranslate-bulk-run.test.ts` character-stop cases | covered |
| FR-8 | `src/lib/translate.ts:345-390,476-483` | `translate.test.ts` structured-log cases | covered |
| FR-9 | `translation-attention.ts:197-247`; `TranslationAttentionBell.tsx:95-101,177-189` | `translation-attention.test.ts` (36 cases) | covered |
| FR-10 | `src/hooks/translateReview.ts:232-244,747-767` | `translateReview.test.ts` unhandledRejection case | covered |
| FR-11 | `src/lib/translation-lock.ts:43-87` | `translation-lock.test.ts` TTL cases | covered |
| FR-12 | `src/hooks/translateReview.ts:693-727` | `translateReview.test.ts` mark-stale cases | covered |
| NFR-1 | `translation-budget.ts:115-122,166-204` | single-`eval` assertion | covered |
| NFR-2 | `translation-budget.ts:282-300`; `translate.ts:606-613` | bound/refuse cases | covered |
| NFR-3 | `translate.ts:614-620`; `retranslate.ts:301-309` | failing-budget-read case | covered |
| NFR-4 | injected clock/sleep throughout | no real sleeps in the suite | partial — the spec's "existing tests unchanged" clause conflicts with the deliberate `attempts === 3` → `1` correction (see Out of scope) |
| NFR-5 | no `src/migrations/` change | diff inspection | covered |
| NFR-6 | `translate.ts:667-687` | "reserves nothing for cache hits" | covered |
| AC-1..AC-12 | per plan phases | per phase evidence tables | covered |

## Findings

### Critical

- none

### High

- none

### Medium

- **F1 — A provider failure can be re-labelled a budget stop on the deadline path**
  - **File:** `src/lib/translate.ts:434-437` (and `:622-624` for the refusal path)
  - **What:** The post-reservation deadline check throws `new TranslationBudgetError()`
    unconditionally. The first deadline check at `:414-423` does the opposite — it
    rethrows `providerFailure(lastError, attempt)` because "that provider failure is the
    real cause of the stop and is reported as such". The comment at
    `src/hooks/translateReview.ts:389-392` states the invariant the post-reservation
    branch breaks: the deadline must never turn a provider failure into a budget stop.
    The refusal path has the same shape: `reserveChunkBudget` throws
    `TranslationBudgetError` at `:623` regardless of `lastError`.
  - **Why:** On a deadline-bearing run (manual retranslate, bulk retranslate) a retryable
    network failure followed by a full window is persisted as `TRANSLATION_BUDGET_REASON`,
    the classified actionable message is discarded, and because `budgetStop` is true at
    `translateReview.ts:429` the automatic delayed re-run is suppressed for a failure that
    deserved one. The operator reads "translation time budget reached" for a request whose
    30-second clock never expired.
  - **Fix:** Mirror the first check: `if (lastError !== undefined) throw
    providerFailure(lastError, attempt); throw new TranslationBudgetError();`. Wrap
    `reserveChunkBudget` so a refusal is rethrown as `providerFailure(lastError, attempt)`
    when `lastError` is set, and as the budget stop only on attempt 0.
  - **Requirement:** none (correctness of the error contract)
  - **Test gap:** `translate.test.ts` — `deadline` set, attempt 1 rejects `ECONNRESET`,
    attempt 2 refused by the budget; assert the thrown error is a `TranslationError`
    whose `cause` is the network error and whose message is not the budget reason.
  - **Resolution:** **fixed** at `609aacf`. Both budget-stop exits now mirror the
    pre-attempt check; a bare `TranslationBudgetError` is reachable only on attempt 0.
    `translate.test.ts:511-558` and `:560-608` pin it, both demonstrated failing against
    the pre-change code with `Received value: TranslationBudgetError: translation character
    budget reached`. The NFR-3 path is untouched.

- **F2 — A character-budget stop persists the time-budget message**
  - **File:** `src/hooks/translateReview.ts:412-414`
  - **What:** Every `TranslationBudgetError` is persisted with `TRANSLATION_BUDGET_REASON`
    ("translation time budget reached"), including the character-budget stop thrown at
    `src/lib/translate.ts:623` with `TRANSLATION_CHARACTER_BUDGET_REASON`. The two limits
    are kept distinct everywhere else — `retranslate.ts:115-116` adds a separate reason and
    a test asserts the two differ — but the stored message collapses them.
  - **Why:** The stored `translationError` is what the admin reads and what the attention
    bell classifies, so a character throttle is recorded as a time-budget stop. The spec's
    edge case for "budget smaller than one text" requires failing "with a clear quota
    message"; the persisted message names a limit that never fired and sends an operator
    chasing a wall clock that did not expire. It also forces `retranslate.ts:322-326` to
    recover the distinction with a clock heuristic instead of reading it.
  - **Fix:** Persist the thrown error's own message for a budget stop instead of the
    constant, and widen `isBudgetStop` at `retranslate.ts:322-326` to accept both reasons —
    then the `clock() < deadline` heuristic at `:285` can be dropped.
  - **Requirement:** spec Edge cases — "budget smaller than one text" must fail with a
    clear quota message
  - **Test gap:** assert the persisted `translationError` for a character-budget stop in
    `translateReview.test.ts` (only the status is asserted today), and add a
    `retranslate-bulk-run.test.ts` case proving the character stop is still reported
    `skipped` after the message changes.
  - **Resolution:** **fixed** at `609aacf`. `budgetStopReason` persists the thrown error's
    own message; `isBudgetStop` accepts both reasons, `isCharacterBudgetStop` gates the
    batch throttle, and the clock heuristic is gone. Pinned by
    `translateReview.test.ts:760-794` and two `retranslate-bulk-run.test.ts` cases.

### Low

- **F3 — `.env.example` documents the opposite of the new behaviour**
  - **File:** `.env.example:36-40`
  - **What:** The comment says "An empty value fails validation at boot", which is the
    behaviour commit `68a0fd0` removed: `env.ts:52-59` now preprocesses `""` to
    `undefined` so it falls back to 100,000, and `env.test.ts` pins that.
    `verification/integrated.md` §11 repeats the same wrong warning.
  - **Why:** This is the one knob the spec's Open Questions call out as the operational
    risk. After raising the console quota to 10,000,000, an operator who leaves the
    variable empty because the docs say boot will fail instead gets silent 100,000 pacing
    — 100× too conservative, the exact failure mode the comment exists to prevent.
  - **Fix:** Replace the last sentence with "An empty value falls back to the default; set
    it explicitly when the console quota is raised." and correct the same sentence in
    `verification/integrated.md` §11.
  - **Requirement:** FR-3
  - **Test gap:** none
  - **Resolution:** **fixed** at `609aacf`. Both copies now match `env.ts` and the
    behaviour `env.test.ts` pins.

- **F4 — The integrated evidence names the wrong test file**
  - **File:** `conductor/tracks/20261025-translation-quota-resilience/verification/integrated.md:165-168`
  - **What:** §6 says `src/lib/__tests__/retranslate-bulk.test.ts` "now pins
    `remainingCharacters` to a full window in `beforeEach`". That pin is in
    `retranslate-bulk-run.test.ts:147-154`; `retranslate-bulk.test.ts` gained only the two
    reason-string cases.
  - **Why:** The evidence table is the record a reviewer trusts. A wrong file name sends the
    next reader to a file that does not contain the hardening, and it obscures that
    `retranslate-bulk-run.test.ts` is new in this track rather than an existing file whose
    assertions were touched.
  - **Fix:** Correct the file name and note the file is new.
  - **Requirement:** none
  - **Test gap:** none
  - **Resolution:** **fixed** at `609aacf`.

- **F5 — The lock-TTL justification understates its own trigger**
  - **File:** `src/lib/translation-lock.ts:34-41`
  - **What:** The comment justifies counting the quote step as one chunk with "the favorite
    quotes are one batched call by construction", conflating one `translateBatch` *call*
    with one provider *chunk*. `translateBatch` packs a chunk per
    `TRANSLATION_BATCH_CHAR_TARGET` (5,000), and `favoriteQuotes` has no `maxRows` with an
    unbounded textarea per quote (`Reviews.ts:181-195`), so a quote list totalling more
    than 25,000 code points issues several chunks from that single call. The recorded
    residual in `integrated.md` §9 states the trigger as "a field over
    `TRANSLATION_BATCH_CHAR_CAP`", which misses this case.
  - **Why:** The residual is honest about direction and severity, but the stated trigger is
    narrower than the real one. A review whose *quote list* is long can outlive the
    33-minute TTL while every individual field is well under the cap, so a future reader
    checking only field lengths would conclude the bound holds when it does not.
  - **Fix:** Reword the comment and the residual to the actual invariant, stated against the
    packer's *target* rather than its cap: the TTL bounds a run of at most five requests
    only when each of the four rich-text fields and the quote list packs into a single
    request, i.e. each totals no more than `TRANSLATION_BATCH_CHAR_TARGET` (5,000) code
    points. A field or quote list above the target adds requests in proportion.
  - **Requirement:** FR-11
  - **Test gap:** none
  - **Resolution:** **fixed at the second attempt.** Round 1's fix rewrote the comment to
    the right *idea* with the wrong *number* — it used `TRANSLATION_BATCH_CHAR_CAP`
    (25,000), which is only the ceiling for a single oversized text sent alone, while
    `packTranslationRequests` closes a request at `TRANSLATION_BATCH_CHAR_TARGET` (5,000)
    (`translate.ts:576-593`). Round 2's delta re-review caught it as **N1**; both the
    comment and `integrated.md` §9 now state the target, and the residual names the
    consequence — a 20,000-code-point field issues four requests on its own while staying
    under the cap.

## Overrides

- none

## Plan compliance

Every phase has a `Result`, a `Checkpoint` and an `Evidence` path, and every task marked
`[x]` is implemented — spot-checked against the diff, not taken from the evidence files.
No task was silently dropped. The final diff stays within the union of the phases'
`Touches` plus two reported deviations, both accepted:

- `src/components/admin/TranslationAttentionBell.tsx` (Phase 6) — outside `Touches`, needed
  because the pure logic cannot render itself. Verified minimal: two imports, one derived
  const, one conditional block; poll, fetch, `where`, `totalDocs` badge,
  `formatAttentionBadgeLabel` and the item list unchanged, inline styles preserved.
- `MAX_ATTEMPTS` exported from `translate.ts` (Phase 5) — needed to derive the TTL without
  restating `3`. Verified no import cycle: `translation-lock` → `translate` →
  `translation-budget` → `{env, redis}` → `{env, logger}`, none of which import back.

One commit outside the phase loop: `68a0fd0` (`env.ts` empty-string preprocess plus
`env.test.ts`) was made during documentation sync to close a Medium observation from Phase
2's primary verification. It is in scope for FR-3 and is covered by its own tests.

## Out of scope

- **NFR-4's "existing tests unchanged" clause contradicts the fix.** AC-5 requires one
  provider attempt for a quota response, and `translate-batch.test.ts` asserted three. The
  spec cannot have both. The correction is right and is recorded; the spec clause is the
  thing that is wrong, and rewriting a spec after approval is not this track's business.
- The five residual risks in `verification/integrated.md` §9 stand as recorded, each
  needing a decision the spec deliberately left out of scope: the TTL bound is not
  absolute (Medium), the attention breakdown describes a page not a backlog (Low),
  `unexpected` is still retryable (Low), a budget stop persists `failed` (Low), and a
  33-minute lock has no staleness signal (Low). F2 improves the fourth of these by making
  the stored message honest; it does not change the status.
- No e2e assertion on the breakdown text. The admin e2e infrastructure exists
  (`e2e/admin/attention-bell.spec.ts` asserts the bell's label, count and row links, and
  all three still pass with Phase 6's block rendered) but no fixture review carries a
  specific persisted quota error, so the breakdown is pinned at the unit layer. A fixture
  change is a follow-up, not a defect.

## Debt

`review.issues.enabled` is `false` for this project, so nothing is filed. All five findings
are fixed in Phase R1 under strict mode; no deferrals.

## Doc sync

`pending`

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS WITH FINDINGS (gate: BLOCK) | 0 | 0 | 2 | 3 | 0 |
| 2 | PASS WITH FINDINGS (gate: cleared) | 0 | 0 | 0 | 0 | 5 |

Round 2 also raised **N1** (Low) against round 1's own F5 fix — a wrong constant in the
rewritten comment — which was corrected before the round-2 verdict was recorded. That is
the delta re-review doing its job: F5's fix had the right reasoning and the wrong number,
and only reading the packer confirmed which.
