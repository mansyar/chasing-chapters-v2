# Phase 4 — Call-site fixes

| | |
| --- | --- |
| Track | `20261025-translation-quota-resilience` |
| Phase | 4 — Call-site fixes |
| Date | 2026-10-25 |
| Branch | `fix/20261025-translation-quota-resilience` |
| Base commit | `6c1ee77` (phase start; depends on Phase 2 checkpoint `10f6a1b`) |
| Head commit | `39b9bb3` |
| Result | `verified` |

Covers FR-6, FR-7, AC-6, AC-7. Goal: neither the favourite-quote fan-out nor a
bulk retranslate run can produce an unbounded burst of characters.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors in 252 files |
| static | `bun run lint` | 0 | `biome check .` — 243 files checked, no fixes applied |
| unit | `bun test` | 0 | 657 pass, 0 fail, 1550 expect() calls, 49 files |
| phase verification | `bun run typecheck && bun run lint && bun test` | 0 | all three layers above, in one command, as written in the brief |
| coverage (targeted) | `bun test --coverage` on the three phase suites | 0 | 67 pass; `translateReview.ts` 91.87% lines / 100% funcs, `retranslate.ts` 92.14% lines / 100% funcs |

The coverage run is supplementary evidence for the 80% gate on new
logic-bearing code; the phase verification command is the gate.

## Acceptance criteria

| ID | Criterion | Proving test | Assertion | Status |
| --- | --- | --- | --- | --- |
| AC-6 | A review with N favourite quotes issues one provider call for the quotes, not N (FR-6) | `src/hooks/__tests__/translateReview.test.ts` → `runTranslationPipeline` › "N favorite quotes produce one provider call, not N" | `expect(mockClientTranslate).toHaveBeenCalledTimes(1)`; the single call's first argument equals the three raw quote strings in order; the saved `favoriteQuotes` equals the three translated entries with `page` `"10"`, `"22"`, `"35"` in the original order | pass |
| AC-7 | A bulk run stops at the character budget and reports the remaining reviews as skipped rather than failing them (FR-7) | `src/lib/__tests__/retranslate-bulk-run.test.ts` → "the character budget stops the loop and reports the remainder as skipped" | outcomes length 3, ids `[1,2,3]`, `pipelineSpy` called once, and every outcome `status: "skipped"` with reason `"not attempted — translation character budget reached"` | pass |

Supporting cases:

- AC-6 edge (spec: "empty quotes array or all-blank quotes → no provider call
  for that field"): "an all-blank favorite-quote list issues no provider call"
  and "an empty favorite-quote list issues no provider call" — both assert
  `expect(mockClientTranslate).not.toHaveBeenCalled()` and that the saved list
  is preserved (blank entries untouched, `[]` stays `[]`).
- AC-7 boundary (spec: "bulk run where the wall clock expires before the
  character budget → reported as skipped with the existing budget reason,
  unchanged"): "the wall clock wins when it expires before the character budget"
  asserts the time-budget reason is still exactly
  `"not attempted — batch time budget reached"`.
- AC-7 non-regression: "a real failure is still reported as failed when
  characters remain" asserts a quota failure stays `failed` when the budget is
  healthy, and "a failing character-budget read does not stop the batch" covers
  NFR-3 (a budget read that throws is ignored).

## Task coverage

| Task | Sub-task | Implementation | Test | Status |
| --- | --- | --- | --- | --- |
| P4.T1 | T1.1 — replace the `Promise.all` of per-quote `translateText` with a single `translateBatch` call | `src/hooks/translateReview.ts`: `translateText` dropped from the import; new private `translateFavoriteQuotes(quotes, options)` calls `translateBatch(quotes.map((item) => item.quote), "id", options)`; the quote block in `runTranslationPipeline` now `await translateFavoriteQuotes(doc.favoriteQuotes, translationOptions())` | "N favorite quotes produce one provider call, not N" | done |
| P4.T1 | T1.2 — preserve page numbers and array order when mapping back | `translateFavoriteQuotes` maps `quotes.map((item, index) => ({ quote: translations[index], page: item.page }))` — positional, since `translateBatch` returns results aligned to input | same test asserts the saved array order and every `page` value | done |
| P4.T1 | T1.3 — an empty or all-blank quote array issues no request | `translateBatch` returns `[]` for empty input and passes blanks through without a request; the guard is `doc.favoriteQuotes ? … : null` | "an all-blank favorite-quote list issues no provider call", "an empty favorite-quote list issues no provider call" | done |
| P4.T2 | T2.1 — thread the character budget through the bulk run alongside the 30-second wall clock | `src/lib/retranslate.ts`: `BulkRetranslateOptions.remainingCharacters` (defaults to `remainingCharacters` from `./translation-budget`); `retranslateReviews` consults it before each review and once more after an attempt | "the character budget stops the loop…", "a failing character-budget read does not stop the batch" | done |
| P4.T2 | T2.2 — the review that hit the budget and every remaining review report `skipped` with a distinct reason; no further attempts | New `BULK_RETRANSLATE_CHARACTER_BUDGET_REASON = "not attempted — translation character budget reached"`; `asThrottledOutcome` reclassifies the budget-stop outcome; `charactersExhausted` short-circuits the rest of the loop | "the character budget stops the loop…" (asserts one pipeline call for three ids and three `skipped` outcomes) | done |
| P4.T2 | T2.3 — whichever limit is reached first is authoritative; time-budget semantics and `BULK_RETRANSLATE_BUDGET_REASON` unchanged | The wall-clock check runs first in the loop and still pushes `BULK_RETRANSLATE_BUDGET_REASON`; the character check only fires when `clock() < deadline` | "the wall clock wins when it expires before the character budget"; "the wall-clock budget stops the loop and every id still reports an outcome" (pre-existing, unchanged); "keeps the time-budget message unchanged" | done |
| P4.T3 | T3.1 — N quotes produce one provider call, not N | — | "N favorite quotes produce one provider call, not N" | done |
| P4.T3 | T3.2 — a bulk run stops at the character budget and reports the remainder as `skipped`, not `failed` | — | "the character budget stops the loop and reports the remainder as skipped" | done |
| P4.T3 | T3.3 — the wall-clock stop still behaves exactly as before | — | "the wall clock wins when it expires before the character budget" plus the untouched pre-existing wall-clock tests | done |

## Evidence paths and commits

| Commit | Subject |
| --- | --- |
| `5e2d424` | `fix(translate): translate favourite quotes in one batched call` |
| `237252d` | `fix(retranslate): stop a bulk run at the character budget` |
| `39b9bb3` | `test(translate): cover the batched quote call` |

Files changed: `src/hooks/translateReview.ts`, `src/lib/retranslate.ts`,
`src/hooks/__tests__/translateReview.test.ts`,
`src/lib/__tests__/retranslate-bulk-run.test.ts`,
`src/lib/__tests__/retranslate-bulk.test.ts`.

## Deviations

None. Every change is inside the phase `Touches`.

## Notes

### Observation for review — persisted status on a character-budget stop

`runTranslationPipeline` catches `TranslationBudgetError` and persists
`translationStatus: "failed"` with `TRANSLATION_BUDGET_REASON` — the same value
for a deadline stop and a character-budget stop. Per the brief's scope boundary
this was **not** changed: the `translationStatus` state machine is out of scope.

The consequence, recorded here so review sees it rather than discovering it: a
review that stops on the character budget is reported `skipped` by the bulk run
but is persisted as `failed` in the database. Two follow-on effects:

1. The review stays eligible for a later bulk retranslate (`failed` and `stale`
   are the retranslatable statuses), so the throttle is self-healing — a
   subsequent run picks it up once the window has rolled forward.
2. The admin UI shows a review as failed after a pure throttle. Phase 6's
   attention bell distinguishes quota failures; a budget stop will present as an
   `unexpected`-classified failure there unless a later phase reworks it.

The bulk run tells the two stops apart without changing the pipeline: the wall
clock is checked first, so a budget stop recorded while the batch still had time
left can only be the character budget (`isBudgetStop` + `clock() < deadline`).
No new persisted field, no status-machine change.

### Judgement calls

- **Why `translateBatch` rather than N `translateText` calls.** `translateBatch`
  already packs by character count, resolves the cache once for the whole set
  and passes blanks through; the fan-out re-derived all of that per quote. Using
  it is also what makes "one provider call" true rather than "one call per quote
  that happens to be cache-cold".
- **The blank-list guard is not a separate branch.** An early return for an
  all-blank list would be dead code: `translateBatch` already returns the blanks
  unchanged through its no-texts path. The behaviour is tested instead of
  asserted in a comment.
- **Post-attempt reclassification is gated on the clock, not on a second budget
  read.** A second `remainingCharacters()` call after every review would double
  the Redis round trips on the hot path (NFR-1) and would misclassify a window
  that another process drained concurrently. The clock gate is exact: the
  pipeline's only other stop is the deadline this batch handed it.
- **A review that spent the last characters and still translated keeps its
  outcome.** Only a `failed` outcome whose reason is exactly the bare budget
  reason is reclassified; a real provider failure stores the classified message
  with raw detail appended, so the comparison cannot collide with it.
- **`remainingCharacters` is injectable rather than module-mocked in every
  test.** The default stays production-real, and the bulk suite pins a full
  window in `beforeEach` so its existing cases test the loop rather than ambient
  Redis state (the suite previously reached a live Redis through the default).
- **`mockClientTranslate` had to become `mock<TranslateMock>(echoTranslate)`.**
  The annotated form widens the value to the bare function type and loses
  `.mock`, which the new call-count assertions need.
- **No e2e.** No user-facing flow changed: the bulk endpoint and the pipeline
  behave as before, and the visible differences are one fewer provider request
  and a different outcome label. The unit layer covers both call sites.

## Primary verification

The primary re-ran all three layers on the squashed checkpoint `96e6a78`:

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 252 files (548ms) |
| static | `bun run lint` | 0 | 243 files checked, no fixes applied |
| unit | `bun test` | 0 | 657 pass, 0 fail, 1551 expect() calls, 49 files (2.90s) |

The primary read both diffs directly and confirmed the contract independently:

- **Quotes:** `Promise.all` over per-quote `translateText` is gone; `translateText` is no longer imported by the hook. `translateFavoriteQuotes` issues one `translateBatch` call and maps results back positionally, so page numbers and order survive. The AC-6 test asserts `toHaveBeenCalledTimes(1)` with all three strings in order in the first call's argument.
- **Bulk:** `retranslateReviews` checks the wall clock first (its reason and semantics unchanged), then the character budget; once spent, the review that hit it and every later one report `BULK_RETRANSLATE_CHARACTER_BUDGET_REASON` and no further attempt is made. `isBudgetStop` only matches a failed outcome whose reason is exactly `TRANSLATION_BUDGET_REASON`, and only while the batch clock still has time left - which is sound, because the pipeline's only other stop is the deadline this batch handed it.
- One outcome per selected review, in input order, is preserved: the existing assertion on outcome count still passes.

**Result: verified.** AC-6 and AC-7 are satisfied by direct test evidence; FR-6 and FR-7 by the code above. The scope boundary was respected - `translationStatus` persistence on a budget stop is untouched, and the mismatch is recorded as an observation below rather than silently changed.

### Non-blocking observations carried forward to review

1. **The DB and the report disagree on a throttled review.** `runTranslationPipeline` persists `translationStatus: "failed"` with `TRANSLATION_BUDGET_REASON` when the character budget refuses a reservation, while the bulk run now reports that same review as `skipped`. The throttle still self-heals (`failed` is bulk-retranslatable) and the status machine is out of scope, but an operator reading the bell will see a failure for what was self-inflicted throttling. Phase 6's classifier will label it `unexpected`. Medium - worth a follow-up track rather than a silent acceptance.
2. **One extra budget read per review in the bulk loop.** `isCharacterBudgetExhausted` costs a Redis round trip (or an in-process read) per review. This is O(1) per review and matches NFR-1, but it is a new read on a path that previously did none. Low.
3. **`remainingCharacters` reaching a live Redis in tests.** The subagent reported that the bulk suite's default had begun hitting a real Redis and pinned it in `beforeEach`. Worth noting that the default is a live call, so any future bulk test that forgets the stub will silently depend on Redis. Low.