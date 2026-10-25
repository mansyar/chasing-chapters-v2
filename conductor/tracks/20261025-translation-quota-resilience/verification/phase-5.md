# Phase 5 verification — Pipeline robustness

| | |
|---|---|
| **Track** | `20261025-translation-quota-resilience` |
| **Phase** | 5 — Pipeline robustness |
| **Date** | 2026-10-25 |
| **Branch** | `fix/20261025-translation-quota-resilience` |
| **Base** | `96dc39d` (plan commit for this phase; Phase 4 verified at `96e6a78`) |
| **Head** | `9449b99` |
| **Result** | **verified** |

## 1. Result

`verified`. All three layers exit 0, all three acceptance criteria have a test
that fails without the change, and the TTL is now derived rather than stated.

## 2. Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Static | `bun run typecheck` | 0 | `bun check` — no type errors in 252 files |
| Static | `bun run lint` | 0 | `biome check .` — 243 files, no fixes applied |
| Unit | `bun test` | 0 | 663 pass, 0 fail, 1566 assertions, 49 files |

The phase verification command was run exactly as written:

```
bun run typecheck && bun run lint && bun test
```

## 3. Acceptance criteria

| AC | Criterion | Test | What it asserts |
|---|---|---|---|
| **AC-10** | A pipeline run that throws after the response is sent produces one classified log entry and no unhandled-rejection warning. | `translateReview.test.ts` → `a pipeline throw after the response is sent produces one classified log entry and no unhandled rejection` | Forces the one throw that escapes `runTranslationPipeline`'s own `catch` — a rejecting `releaseTranslationLock` in its `finally`. Asserts `process.on("unhandledRejection")` recorded **nothing**, `logger.error` was called **exactly once**, the message names the classifier's kind (`(unexpected)`), and the second argument is the structured object `{ kind, transient, detail }` — not the raw error. |
| **AC-11** | The computed lock TTL is greater than the worst-case run duration derived from the retry and timeout constants. | `translation-lock.test.ts` → `the TTL exceeds one step's worst case derived from the retry and timeout constants`, `the TTL covers every step of one run, not one step`, `the TTL is no longer the fixed 10 minutes it used to be` | Recomputes the worst case **from the imported constants** (`MAX_ATTEMPTS`, `RETRY_DELAYS_MS`, `TRANSLATION_REQUEST_TIMEOUT_MS`, `TRANSLATION_BUDGET_WINDOW_MS`), not from the module's own derived constant, then asserts the TTL is strictly greater than one step, equal to `TRANSLATION_PIPELINE_STEPS ×` one step, and greater than the old 10 minutes. |
| **AC-12** | Calling `markTranslationStale` on an `untranslated` review leaves its status unchanged and logs no validator error. | `translateReview.test.ts` → `mark-stale on an untranslated review leaves the status unchanged and logs no error` | Runs the real hook with `autoTranslate: false`, `translationStatus: "untranslated"` and changed English text — the exact path that used to attempt the illegal write. Asserts `payload.update` was **never called** (nothing attempted that the validator would reject) and `logger.error` was never called. |

Two supporting tests keep the change honest rather than merely passing:

- `mark-stale on a translated review still writes stale` — restricting the
  write must not remove the feature. Asserts exactly one update, to `stale`.
- `the TTL exceeds …` is paired with a literal `expect(worstCaseStepMs).toBe(400_000)`,
  so the arithmetic below is pinned, not just an inequality that could drift.

## 4. Task coverage

| Task | Satisfied by |
|---|---|
| **P5.T1.1** — classify a fire-and-forget throw into one log entry | `src/hooks/translateReview.ts`: `capturePipelineFailure(label, run)` — `void run.catch(...)` → `classifyTranslationError` → `logger.error` with `{ kind, transient, detail }`. Wired to all three pipelines in `translateReview` (`"Translation pipeline"`, `"Format sync"`, `"Stale marking"`) and to the delayed re-run in `scheduleTranslationRetry` (`"Automatic re-run"`), which was a fourth `void` on the same surface. |
| **P5.T1.2** — do not await in the save path | `translateReview` still returns `doc` without awaiting; `capturePipelineFailure` attaches a handler and returns `void`. The existing `the hook resolves while the write it triggered is still pending` test still passes, and the deadlock comment is retained and extended. |
| **P5.T2.1** — derive the TTL from the imported constants | `src/lib/translation-lock.ts`: `TRANSLATION_WORST_CASE_STEP_MS` and `TRANSLATION_LOCK_TTL_MS`, computed from `MAX_ATTEMPTS`, `RETRY_DELAYS_MS`, `TRANSLATION_REQUEST_TIMEOUT_MS` and `TRANSLATION_BUDGET_WINDOW_MS`. No retry-policy literal is restated in the lock module. |
| **P5.T2.2** — test that the TTL exceeds the worst case | `src/lib/__tests__/translation-lock.test.ts`, `describe("translation-lock TTL derivation")`, three tests (see AC-11). |
| **P5.T3.1** — only write `stale` from `translated` | `markTranslationStale` takes `currentStatus` and returns early unless it is `translated`. |
| **P5.T3.2** — leave other statuses unchanged, no read, no `error` log | The early return happens before any `payload.update`; the status comes from the caller (`doc.translationStatus`, which `decideTranslationAction` already read), so there is no re-read. The skip is logged at `debug`, not `error`. |
| **P5.T4.1** | `a pipeline throw after the response is sent produces one classified log entry and no unhandled rejection` (AC-10). |
| **P5.T4.2** | `mark-stale on an untranslated review leaves the status unchanged and logs no error` (AC-12), plus `mark-stale on a translated review still writes stale`. |
| **P5.T4.3** | The three `translation-lock TTL derivation` tests (AC-11). |

## 5. The TTL derivation

### 5.1 Constants, and where each comes from

| Constant | Value | Source | Role in the derivation |
|---|---|---|---|
| `MAX_ATTEMPTS` | `3` | `src/lib/translate.ts` (exported this phase) | attempts per chunk, so the per-attempt terms repeat three times |
| `TRANSLATION_BUDGET_WINDOW_MS` | `100 * 1000` = **100,000 ms** | `src/lib/translation-budget.ts` | the bounded wait for the quota window before each attempt |
| `TRANSLATION_REQUEST_TIMEOUT_MS` | `30 * 1000` = **30,000 ms** | `src/lib/translate.ts` | one provider request |
| `RETRY_DELAYS_MS` | `[2000, 8000, 30000]` | `src/lib/translate.ts` | backoff **between** attempts |
| `TRANSLATION_PIPELINE_STEPS` | `5` | `src/lib/translation-lock.ts` (stated, justified in §5.3) | how many chunks a run translates in sequence |

### 5.2 Per-attempt and per-chunk

The quota-wait term is `TRANSLATION_BUDGET_WINDOW_MS` exactly, because
`reserveCharacters` bounds a reservation's wait by `maxWaitMs`, which defaults to
one full window. On the hook's own path — `runTranslationPipeline(payload, doc)`
with no options — `buildTranslationOptions` returns `undefined`, so there is no
deadline, so `maxWaitMs` is the full 100,000 ms and `timeoutMs` is the full
30,000 ms. No deadline clamping applies, which is what makes 400 s an exact
bound rather than a worst-of-both estimate.

```
per attempt   = 100,000 ms (budget window wait) + 30,000 ms (request timeout)
              = 130,000 ms

attempts      = 3  →  3 × 130,000                       = 390,000 ms
backoff       = RETRY_DELAYS_MS.slice(0, MAX_ATTEMPTS-1)
              = 2,000 + 8,000                            =  10,000 ms
              (the 30,000 entry is never slept: the loop
               backs off only while attempt < MAX_ATTEMPTS-1,
               so three attempts carry two backoffs)

per chunk     = 390,000 + 10,000                         = 400,000 ms
              = 400 s
```

### 5.3 How the chunk count enters

`TRANSLATION_PIPELINE_STEPS = 5`: `runTranslationPipeline` translates
`reviewContent`, `whatILoved`, `whatCouldBeBetter`, `perfectFor` and then the
favourite quotes — five sequential `translateBatch` calls. They are sequential
(each `await`ed in turn), so the run's worst case is a **multiple** of one
chunk's, not one chunk's. A per-chunk bound would understate the run fivefold.

One step is assumed to be **one** provider chunk, i.e. one request of at most
`TRANSLATION_BATCH_CHAR_CAP` = 25,000 code points. That is the packer's
per-request ceiling, and the favourite quotes are one batched call by
construction (Phase 4). The count is a single named constant rather than a
factor buried in the TTL expression, so the assumption is one auditable number.

**Where the bound stops holding, stated plainly:** the rich-text fields carry no
maximum length. A review whose single field exceeds 25,000 code points issues
further chunks in that step and outlives this bound. No finite TTL can bound
that case without a maximum field length, and adding one is a product decision
outside this phase. The bound covers the shape every real review has (four
fields each within the cap, plus one quote list).

### 5.4 The resulting number

```
run worst case = 5 × 400,000 ms                          = 2,000,000 ms
                                                         = 2,000 s
                                                         = 33 min 20 s

old TTL        = 10 × 60 × 1,000 ms                      =   600,000 ms
                                                         =   600 s
                                                         = 10 min

new TTL        = TRANSLATION_PIPELINE_STEPS × TRANSLATION_WORST_CASE_STEP_MS
               = 2,000,000 ms

headroom       = 2,000,000 / 600,000                     = 3.33× the old value
```

| | Old | New |
|---|---|---|
| TTL | 600,000 ms (10 min) | **2,000,000 ms (33 min 20 s)** |
| Run worst case it must exceed | 2,000,000 ms | 2,000,000 ms |
| Covers a run? | **No — short by 1,400,000 ms (23 min 20 s)** | Yes, with the equality the derivation intends |

That gap is the defect: before this phase a run at its worst case outlived its
own lock by more than three times the lock's lifetime, and a second run could
acquire the lock and start on the same review.

## 6. Evidence paths and commits

| Item | Path / SHA |
|---|---|
| This report | `conductor/tracks/20261025-translation-quota-resilience/verification/phase-5.md` |
| TTL derivation | `ad49bad` — `fix(translate): derive the translation lock TTL from the retry policy` |
| Failure capture + stale transitions | `9449b99` — `fix(translate): capture pipeline failures and restrict stale marking` |
| Base | `96dc39d` |
| Head | `9449b99` |

Files changed:

- `src/lib/translation-lock.ts`
- `src/lib/__tests__/translation-lock.test.ts`
- `src/hooks/translateReview.ts`
- `src/hooks/__tests__/translateReview.test.ts`
- `src/lib/translate.ts` (deviation — see §7)

## 7. Deviations

| File | Reason |
|---|---|
| `src/lib/translate.ts` | Outside `Touches`. `MAX_ATTEMPTS` was module-private, so the TTL could not be derived from it — restating `3` in `translation-lock.ts` is exactly the drift FR-11 forbids. The change is one word (`const` → `export const`) plus a two-line comment. No behaviour change; every Phase 1–4 test passes unchanged. |

## 8. Notes

### The TTL tradeoff, and which way it errs

**It errs long, deliberately.** The two failure modes are not symmetric:

- **Too short** — a run outlives its lock, a second run acquires it and
  translates the same review concurrently. Two writers race on the Indonesian
  locale and the `translationStatus` column; the loser can overwrite the winner's
  content with older English-derived text, and the status can land on `failed`
  after a successful write. That is data corruption and it is silent.
- **Too long** — a crashed run leaves its lock set, and retranslation of that
  one review is refused until the TTL expires. The pipeline logs
  `Pipeline already running for review N; duplicate trigger ignored`, the admin
  sees it in the log, and the bulk retranslate action reports the review as
  skipped rather than failing it. Nothing is corrupted; a retry is delayed.

So the cost of erring long is a bounded, visible delay on one review, and the
cost of erring short is invisible corruption. The TTL is therefore set at the
worst case exactly — no safety multiplier on top, because the worst case is
already the pessimistic reading of every constant (three full window waits, three
full timeouts, both backoffs). Adding a multiplier would only lengthen the
crashed-lock delay for no additional protection.

**No renewal heartbeat.** A heartbeat would let the TTL be short *and* safe, but
it is a second background loop, a second failure surface, and a second thing to
get wrong on process death — more machinery than FR-11 asks for. The brief
excludes it explicitly, and the derived TTL already removes the defect.

### Judgement calls

- **The delayed re-run's `void` was captured too.** `scheduleTranslationRetry`
  called `void runDelayedTranslationRetry(...)` inside a `setTimeout`, which is
  the same unhandled-rejection surface — and a *less* observable one, since it
  fires minutes later with nothing on the stack pointing at the save that caused
  it. T1.1 names three invocations; this is the fourth on the identical surface,
  and leaving it uncaptured would have left FR-10 half-done. One extra argument,
  no behaviour change.
- **`logger.debug` for the skipped stale marking.** The ordinary case of a review
  that was never translated is not a problem to report — it is the correct
  outcome. `debug` keeps it out of production logs (the logger's floor there is
  `warn`) while still being visible in development. Nothing at `error` level, as
  T3.2 requires.
- **`markTranslationStale`'s signature changed** from `(payload, docId)` to
  `(payload, docId, currentStatus)`. It has one caller, in the same file. T3.2
  says "do not add a read: the caller already has `doc.translationStatus`", which
  requires passing it; an optional parameter would have made the illegal write
  the default and defeated FR-12.
- **The capture handler is a module function, not an inline `.catch` per call
  site.** Four call sites with identical classification and field shape is the
  duplication FR-8's logging style exists to prevent; a helper also makes "one
  log entry" testable as a property of the mechanism rather than of each site.
- **Test placement.** All three new hook cases were added to the existing
  `describe("translateReview hook (F1: no nested write)")` block, and the TTL
  cases to a new `describe("translation-lock TTL derivation")` in the lock suite.
  No restructuring — the hook file keeps its shape at ~1340 lines.
- **The unhandled-rejection assertion is real, not simulated.** The test installs
  a `process.on("unhandledRejection")` listener and waits 20 ms after the run, so
  it fails if a rejection is actually emitted. It would have failed on the old
  code, because the rejecting `releaseTranslationLock` escapes
  `runTranslationPipeline`'s `catch` through its `finally`.

### For the reviewer and Phase 6

- FR-10's capture is at the *hook* boundary. `runTranslationPipeline`'s own
  internal `catch` is untouched, as the brief requires — provider failures are
  still logged there with the classified kind, and the new handler only ever sees
  what escapes it. The two cannot double-log the same failure.
- Phase 6 owns the admin attention bell. Nothing here touches
  `translation-attention.ts` or `translation-errors.ts`; the `kind` the new log
  entry carries is the same classifier output the bell will read from
  `translationError`, so the two agree by construction.
- If a maximum rich-text length is ever added to the collection, `TRANSLATION_PIPELINE_STEPS`
  becomes a true upper bound rather than a bound on the realistic shape, and this
  derivation should be revisited then.

## Primary verification

The primary re-ran all three layers on the squashed checkpoint `a77c486`:

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 252 files (456ms) |
| static | `bun run lint` | 0 | 243 files checked, no fixes applied |
| unit | `bun test` | 0 | 663 pass, 0 fail, 1566 expect() calls, 49 files (2.29s) |

The primary read both diffs directly and re-derived the TTL from the constants rather than trusting the evidence:

- **FR-10:** `capturePipelineFailure` attaches `.catch` instead of discarding the promise, classifies with the existing `classifyTranslationError`, and logs one entry with `{kind, transient, detail}` — never the raw error. Wired to all three `void`-ed pipelines and to the delayed re-run in `scheduleTranslationRetry`, which the subagent added beyond the brief and which is correct: it is a fourth surface on the same path, firing minutes later with nothing on the stack. The save path still does not await; the deadlock comment is preserved and extended.
- **FR-11:** `TRANSLATION_WORST_CASE_STEP_MS = MAX_ATTEMPTS * (TRANSLATION_BUDGET_WINDOW_MS + TRANSLATION_REQUEST_TIMEOUT_MS) + TRANSLATION_RETRY_BACKOFF_MS`, where the backoff is `RETRY_DELAYS_MS.slice(0, MAX_ATTEMPTS - 1)` — correctly two entries, because the loop sleeps only while `attempt < MAX_ATTEMPTS - 1`, so the `30000` entry is never waited on. That gives `3 * 130000 + 10000 = 400000` per step; `TRANSLATION_PIPELINE_STEPS = 5` gives `2000000` ms. The old 600000 was 1.4 million ms short of the run's own worst case. The derivation is in the module as code plus a doc comment, not only in this report, so it cannot drift silently.
- **FR-12:** `markTranslationStale` takes the caller's status and returns before any write unless it is `translated`, logging at `debug`. It is the only caller, updated; the typecheck confirms no stale call site.
- **AC-10** registers a real `process.on("unhandledRejection")` listener and asserts it saw nothing, which is the assertion that actually proves the fix rather than describing it.

**Result: verified.** AC-10, AC-11 and AC-12 are satisfied by direct test evidence; FR-10, FR-11 and FR-12 by the code above. No existing test was weakened.

### Non-blocking observations carried forward to review

1. **The TTL bound is not absolute, and the code says so.** `TRANSLATION_PIPELINE_STEPS = 5` assumes each rich-text field fits in one packed request. A field over `TRANSLATION_BATCH_CHAR_CAP` (25,000 code points) issues further chunks and outlives the TTL. The fields carry no `maxLength`, so no finite TTL could bound that case — it needs a product decision (cap the field, or accept that a very long review can exceed its lock). The subagent documented this in the module rather than hiding it, which is the right call, but it is a real residual and worth a follow-up. Medium.
2. **`MAX_ATTEMPTS` became exported.** Correct and necessary — restating `3` in `translation-lock.ts` is exactly the drift FR-11 forbids — but it widens the public surface of `translate.ts` by one constant. Low.
3. **A 33-minute lock is a long time to be blocked.** With the TTL erring long, a crashed run blocks retranslation of that review for 33 minutes. Acceptable against silent data corruption, and the reasoning is recorded in the module, but an operator who sees "a translation run is already in progress" for half an hour has no signal that it is a stale lock rather than a live run. Phase 6's bell does not cover it. Low.