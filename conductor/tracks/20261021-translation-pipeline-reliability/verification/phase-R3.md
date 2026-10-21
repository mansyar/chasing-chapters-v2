# Phase R3 Verification — Review Fixes (Round 3)

- **Track:** 20261021-translation-pipeline-reliability — Translation Pipeline Reliability
- **Phase:** R3 — Review Fixes (round 3)
- **Date:** 2026-10-22
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Base commit:** `30f3e6c`
- **Head commit:** `55540f4`
- **Result:** `verified`

## Result

Both round-3 findings in scope are resolved and the phase gate is green:
typecheck, lint, 393 unit tests (390 at the base commit, **+3 tests**).

- **R3.T1 / F1 (Medium) — a provider failure stays a provider failure.** The
  deadline logic no longer converts every error into a budget stop. A quota or
  credentials failure that reaches the deadline is reported with its own
  actionable provider message, keeps its raw detail (FR-5), stays classified as
  transient, and therefore still gets the single automatic delayed re-run
  (FR-7 / AC-7). Only a genuinely deadline-cut request — a request the
  deadline itself cut, or a run stopped before its first attempt — is a
  budget stop.
- **R3.T3 / F3 (Low) — the guard's "review no longer exists" branch is
  covered.** A run whose guard read fails (deleted review) is skipped without
  writing anything and without translating.

The single-review path (no deadline) is unchanged: 3 attempts, the default
backoff `[2000, 8000, 30000]`, `TranslationError.attempts = 3`, and the same
classifier outcome.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` (`bun check`) | 0 | "✓ No type errors in 190 files" |
| Lint (Biome) | `bun run lint` (`biome check .`) | 0 | "Checked 182 files … No fixes applied." |
| Unit tests | `bun test` | 0 | **393 pass / 0 fail** across 29 files (853 `expect()` calls) |
| Formatter | `bunx biome check --write <4 touched files>` | 0 | "Checked 4 files … No fixes applied." |
| Pre-commit hook | `bun check` + `biome check .` + `bun test` | 0 | Ran on both task commits (husky), all green |

Test-count baseline: 390 pass / 29 files at `30f3e6c`; 393 pass / 29 files
after this phase — **+3 tests** (translate-batch 18 → 19, hook tests 37 → 39).
The `error:` lines in the test output are the expected error-path logs of the
rate-limit, translate-batch, translation-lock and translation suites; those
tests all pass.

Not run (per the brief): `bun run build` and a dev server (the primary runs the
build), `bun run test:e2e`. No Payload types were regenerated — no collection
field changed in this phase.

## What changed

### R3.T1 — A provider failure must stay a provider failure

**`src/lib/translate.ts`**

- New private helper `providerFailure(error, attempts)` returns
  `new TranslationError(message, { attempts, cause: error })`, where `message`
  is the provider error's own message and `cause` is the original error. The
  raw detail therefore survives, and `classifyTranslationError` still sees the
  quota / credentials / network signal through the cause chain.
- The retry loop's catch **no longer** blanket-converts an error into a budget
  stop when the deadline has passed (the old `if (deadline !== undefined &&
  Date.now() >= deadline) throw new TranslationBudgetError()` is deleted).
- The backoff block now rethrows the **original provider error** (wrapped by
  `providerFailure`) when the remaining time is exhausted, instead of
  `new TranslationBudgetError()`.
- The loop-top guard is kept — no new attempt starts after the deadline — but
  when an earlier attempt already failed, the guard rethrows that provider
  failure (via `providerFailure`) instead of masking it with a budget stop.
  When nothing has been attempted yet, the guard still throws
  `TranslationBudgetError` (a run stopped before its first attempt is a
  genuine budget stop).
- Unchanged: a request the deadline actually cut (a
  `TranslationRequestTimeoutError` raised while the remaining time was the
  binding constraint) is still a `TranslationBudgetError`; the backoff still
  never sleeps past the deadline; the run without a deadline is untouched.

**`src/hooks/translateReview.ts`**

- The pipeline's budget-stop detection is now `const budgetStop = error
  instanceof TranslationBudgetError;` — the `|| isDeadlineReached(options.deadline)`
  clause is dropped. The deadline must never reclassify a provider failure,
  because that would both lose the actionable message (FR-5) and cancel the
  automatic re-run (FR-7 / AC-7).
- Unchanged: `ensureBudget()` still throws `TranslationBudgetError` before each
  translated field, so a run stopped by the deadline still reports "translation
  time budget reached" and schedules no re-run.

**`src/lib/__tests__/translate-batch.test.ts`**

- "never sleeps past the deadline" now expects the **provider error** (a
  `TranslationError` that is *not* a `TranslationBudgetError`, message contains
  "API down") instead of `TranslationBudgetError`; the timing assertion
  (elapsed < 2 s, one API call) is unchanged.
- The existing "throws TranslationError after the final retry instead of
  returning English" test additionally pins the unchanged single-review path:
  not a budget stop, `attempts = 3`, three API calls, and the same classifier
  outcome (`quota`).
- New: "keeps a quota failure that reaches the deadline a quota failure" —
  a quota error whose retry window is closed by the deadline is still a
  `TranslationError` (not a budget stop), classifies as `quota`, is transient,
  and keeps the raw detail.

**`src/hooks/__tests__/translateReview.test.ts`**

- New: "a quota failure that arrives after the deadline is still a quota
  failure and still schedules the re-run" — the provider fails only after the
  deadline has passed; the run records `failed` with the actionable quota
  message and the raw provider detail (never "translation time budget
  reached"), and the single automatic delayed re-run is still scheduled (and
  it does not schedule a second one).

### R3.T3 — Cover the guard's "review no longer exists" branch

**`src/hooks/__tests__/translateReview.test.ts`** (describe
`runTranslationPipeline`)

- New: "the guard skips the run when the review no longer exists" — the run
  is started with `abortIfTranslationNewerThan` set while `payload.findByID`
  throws (a 404 Not Found). The guard's read-failure path
  (`readReviewForGuard` → `null`) aborts the run: **no `payload.update` is
  called** and **no translation happens** — a deleted review is skipped, not
  translated.

## Test list

| Test | File | Purpose |
|---|---|---|
| "never sleeps past the deadline" (updated) | `src/lib/__tests__/translate-batch.test.ts` | The deadline stops the retry, the provider failure is reported as itself |
| "keeps a quota failure that reaches the deadline a quota failure" (new) | `src/lib/__tests__/translate-batch.test.ts` | A quota failure stays `quota` and transient, never a budget stop |
| "throws TranslationError after the final retry instead of returning English" (extended) | `src/lib/__tests__/translate-batch.test.ts` | The no-deadline path is unchanged: 3 attempts, not a budget stop, same classifier outcome |
| "a quota failure that arrives after the deadline is still a quota failure and still schedules the re-run" (new) | `src/hooks/__tests__/translateReview.test.ts` | FR-5/FR-7: actionable message + raw detail preserved, delayed re-run scheduled |
| "the guard skips the run when the review no longer exists" (new) | `src/hooks/__tests__/translateReview.test.ts` | F3: the guard's not-found branch is covered — nothing written, nothing translated |

## Task map

| Task | Finding | Commit | Status |
|---|---|---|---|
| R3.T1 | F1 (Medium) | `95676e0` | done |
| R3.T3 | F3 (Low) | `55540f4` | done |

One conventional commit per task. The pre-commit hook (husky) ran `bun check`,
`biome check .` and `bun test` on both commits; all three were green.

## Design notes

- **What is a budget stop now.** Exactly two cases: (a) the deadline cut the
  request (the request timed out because the remaining time was the binding
  constraint), and (b) the deadline had already passed when the run was about
  to make its first attempt. Both throw `TranslationBudgetError`, whose
  message matches none of the classifier's quota / timeout / network /
  credentials patterns, so it classifies as `unexpected` — not transient — and
  never schedules the automatic re-run.
- **Everything else is the provider's failure.** When the deadline closes the
  retry window after a failed attempt, the provider error is rethrown as a
  `TranslationError` carrying the original error as its `cause`. The
  classification therefore comes from the provider's own message / error
  shape: a quota error stays `quota` (transient → the delayed re-run is
  scheduled), a credentials error stays `credentials` (permanent → no re-run).
- **The raw detail is never lost.** `providerFailure` keeps the original error
  as the `cause`, and the wrapper's message is the provider's own message, so
  `formatTranslationError` still renders "<actionable message> (raw: <provider
  detail>)" — e.g. "Translation quota exceeded. Wait a few minutes before
  retrying… (raw: Quota exceeded for quota project)".
- **The attempt count is honest.** A rethrown provider failure carries the
  number of attempts actually made (`attempts = attempt + 1`), instead of the
  0 a budget error used to report.

## Deviations

| File | Reason |
|---|---|
| — | None. Every file touched is inside the phase's scope (`src/lib/translate.ts`, `src/hooks/translateReview.ts`, and the two test files under `src/**/__tests__/`). No Conductor state file other than this evidence file was modified. |

## Notes

- **Task-id mismatch with `plan.md` (for the primary).** The R3 brief and the
  phase request name the guard's not-found test **R3.T3**; `plan.md` lists it
  as **R3.T2** ("Cover the guard's not-found branch (F3)") and uses R3.T3 for
  the already-applied "tick the R2 parent boxes" item. This report follows the
  brief: the guard test is reported as **R3.T3**, implemented in commit
  `55540f4`. The primary owns `plan.md` and may want to align the labels.
- **The brief's instruction on the loop-top guard.** The brief asks to keep
  the guard ("no new attempt starts after the deadline") while the deadline
  test must expect the provider error. Both hold only if the guard rethrows
  the provider failure when an earlier attempt already failed — otherwise the
  guard would mask it with a budget stop again. The guard's *stopping* rule is
  unchanged; only the error it throws when a provider failure is pending
  changed (and only then).
- **The single-review path is provably untouched.** The changed code paths are
  all guarded by `deadline !== undefined` or by `lastError !== undefined`,
  which can only be set when a deadline-bearing run failed an attempt. The
  no-deadline path still runs 3 attempts with the default backoff
  `[2000, 8000, 30000]`, throws `TranslationError("Translation failed after 3
  attempts")` with `attempts = 3`, and classifies the same way.
- **Timing margin in the new hook test.** The quota-at-deadline test gives the
  pipeline a 300 ms deadline window and lets the provider fail after 400 ms,
  so the failure reliably arrives after the deadline while the pre-translation
  work (lock + status write) has ample slack.
- **The `error:` lines in the test output are expected** — they are the
  logged failures of the error-path tests (rate limit, translate-batch retry
  loop, translation lock fallbacks, translation pipeline failures).
- **Not run:** `bun run build` and a dev server are outside this phase's
  verification command; the primary runs the production build.

## Evidence paths

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R3.md` (this file)
- R3.T1: `src/lib/translate.ts` (`providerFailure`, `translateChunkWithRetry`), `src/hooks/translateReview.ts` (budget-stop detection)
- R3.T3: `src/hooks/__tests__/translateReview.test.ts` (guard not-found branch)
- Tests: `src/lib/__tests__/translate-batch.test.ts`, `src/hooks/__tests__/translateReview.test.ts`
- Phase commits: `95676e0` (R3.T1), `55540f4` (R3.T3)
