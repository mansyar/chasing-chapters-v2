# Phase R2 Verification — Review Fixes (Round 2)

- **Track:** 20261021-translation-pipeline-reliability — Translation Pipeline Reliability
- **Phase:** R2 — Review Fixes (round 2)
- **Date:** 2026-10-22
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Base commit:** `b967129`
- **Head commit:** `67eadbb`
- **Result:** `verified`

## Result

The three round-2 findings are resolved and the phase gate is green: typecheck,
lint, 390 unit tests.

- **F1 (High) — the deadlock is fixed at its root.** The English content
  change time is now written **into the incoming data** by a `beforeChange`
  hook (`recordEnglishChangeTime`), so the outer `UPDATE` writes the column
  in the same transaction: one write, one transaction, one version. The
  awaited nested `payload.update` from the `afterChange` hook is gone, so no
  admin save can deadlock any more.
- **F2 (Medium) — the bulk budget now bounds the in-flight review.** The
  review that is running when the budget runs out is aborted at the same
  deadline, so one slow review can no longer push the response past the
  proxy's 60 s read timeout.
- **F3 (Low) — the delayed re-run re-checks the timestamp under the lock.**
  The run re-reads the review after it has acquired the per-review lock and
  aborts when a translation newer than the captured failure timestamp already
  exists.

F4 and F5 are Low findings owned by the primary and were not in scope.

## The F1 deadlock, and why this fix removes it

The round-1 fix recorded the English change time with an awaited
`payload.update` inside the collection `afterChange` hook. That call cannot
work:

1. `node_modules/payload/dist/collections/operations/local/update.js:12`
   always builds a **fresh request** via `createLocalReq(options, payload)`.
2. `createLocalReq.js:65` defaults `req = {}` — the nested request carries
   **no `transactionID`**, and `req.locale` is reset to the default locale.
3. `initTransaction.js` therefore opens a **second transaction on a second
   pooled connection**, while the outer `updateByID.js:24` transaction is
   still open.
4. `updateByID.js:226` commits only after the operation returns, and the
   collection `afterChange` hooks run inside that window
   (`utilities/update.js:386-398`) — so the outer transaction still holds the
   row lock when the nested transaction asks for it.
5. The outer transaction waits for the nested one, the nested one waits for
   the row lock the outer one holds: **deadlock on every admin save of a
   changed review**, burning two pooled connections per save.

The fix removes the nested write entirely. `recordEnglishChangeTime` is a
`CollectionBeforeChangeHook<Review>` that mutates `data.englishUpdatedAt`
before the document is written, so the value is part of the single outer
`UPDATE` — same transaction, same version, no second connection.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` (`bun check`) | 0 | "✓ No type errors in 190 files" |
| Lint (Biome) | `bun run lint` (`biome check .`) | 0 | "Checked 182 files … No fixes applied." |
| Unit tests | `bun test` | 0 | 390 pass / 0 fail across 29 files (833 `expect()` calls) |
| Formatter | `bunx biome check --write <files>` | 0 | Applied to the files Biome reported deviations for (3 files fixed once) |
| Pre-commit hook | `bun check` + `biome check .` + `bun test` | 0 | Ran on all three task commits (husky), all green |

Test-count baseline: 376 pass / 29 files at the base commit; 390 pass / 29
files after this phase — **+14 tests**, no new test file (hook tests
28 → 37, translate-batch 14 → 18, bulk-run 8 → 9). The `error:` lines in the
output are the expected error-path logs of the rate-limit, translate-batch
and translation-lock suites; those tests all pass.

Not run (per the brief): `bun run build`, a dev server, `bun run test:e2e`.
`bunx payload generate:types` was not needed — the Reviews collection gained
no new field in this phase (the `englishUpdatedAt` field and its migration
already exist).

## Findings resolved

| ID | Severity | Resolution | Evidence |
|---|---|---|---|
| **F1** | High | `recordEnglishChangeTime` (`CollectionBeforeChangeHook<Review>`, exported from `src/hooks/translateReview.ts`) writes `englishUpdatedAt` **into the incoming `data`**: on `create` it always stamps; on `update` it stamps only when a rich-text field that is present in `data` has a different plain text than `originalDoc`. A format-only change does not stamp, a write without a rich-text field does not stamp, and a write whose `req.locale` is not the default locale (`req.payload.config.localization.defaultLocale ?? "en"`) does not stamp. The hook is registered in `src/collections/Reviews.ts` as the second entry of the existing `hooks.beforeChange` array (after the inline `publishDate` hook). `recordEnglishUpdatedAt` and its two call sites (the "translate" and the "mark-stale" branches of the `afterChange` hook) are deleted, so the `afterChange` hook performs no awaited write at all. The pure predicate is extracted as the exported `englishContentChanged({ next, previous })` and reused by `isEnglishContentChanged` and — through it — by `decideTranslationAction`; `isStale(doc.englishUpdatedAt, doc.translationUpdatedAt)` stays the staleness signal. | `src/hooks/translateReview.ts` (`englishContentChanged`, `recordEnglishChangeTime`, `resolveDefaultLocale`, `translateReview`), `src/collections/Reviews.ts`; tests: `src/hooks/__tests__/translateReview.test.ts` — describe `recordEnglishChangeTime (F1: English change time)` (6 tests) and describe `translateReview hook (F1: no nested write)` (4 tests) |
| **F2** | Medium | The bulk budget bounds the whole request, not only the loop. `BULK_RETRANSLATE_TIME_BUDGET_MS` drops from 45 s to **30 s**; the review that is in flight shares the batch deadline (`retranslateOneReview` → `retranslateReview` → `runTranslationPipeline(payload, doc, { deadline })`) and is aborted at it. Inside the pipeline the deadline is checked before every translated field, the remaining time is passed to the translation layer as `{ timeoutMs, deadline }`, and the review is reported failed with the reason **"translation time budget reached"**. In `src/lib/translate.ts` the request timeout is no longer hardcoded (`TRANSLATION_REQUEST_TIMEOUT_MS`, overridable per call), a request that would outlive the deadline is cut short, the backoff never sleeps past the deadline, and the run stops before every attempt. Every selected id still reports exactly one outcome, and the doc comment now states that the answer comes back within the budget plus a small overhead. | `src/lib/translate.ts` (`TranslateBatchOptions`, `TranslationBudgetError`, `TRANSLATION_BUDGET_REASON`, `translateChunkWithRetry`, `withTimeout`), `src/lib/retranslate.ts` (`BULK_RETRANSLATE_TIME_BUDGET_MS`, `RetranslateOptions`, `retranslateReviews`, `retranslateOneReview`), `src/hooks/translateReview.ts` (`RunPipelineOptions.deadline`, `isDeadlineReached`, `buildTranslationOptions`); tests: `src/lib/__tests__/translate-batch.test.ts` (describe `translateBatch (time budget)`, 4 tests), `src/lib/__tests__/retranslate-bulk-run.test.ts` (1 test), `src/hooks/__tests__/translateReview.test.ts` (2 tests) |
| **F3** | Low | `RunPipelineOptions` gains `abortIfTranslationNewerThan?` (ISO timestamp). After the per-review lock is acquired the run re-reads the review (`payload.findByID({ collection: "reviews", id, locale: "en", depth: 0 })`) and aborts with an info log ("a newer translation exists; skipping this run") when the stored `translationUpdatedAt` is newer than the given timestamp — the lock is held, so nothing can change under the check. The delayed re-run passes the `failedAt` timestamp it captured, so a translation that lands between the re-run's own read and the lock is no longer overwritten. | `src/hooks/translateReview.ts` (`runTranslationPipeline` guard, `readReviewForGuard`, `runDelayedTranslationRetry`); tests: `src/hooks/__tests__/translateReview.test.ts` — "a translation that lands between the re-read and the write survives" |

## Task map

| Task | Finding | Commit | Status |
|---|---|---|---|
| R2.T1 | F1 | `614dc2b` | done |
| R2.T2 | F2 | `60e422b` | done |
| R2.T3 | F3 | `67eadbb` | done |

One conventional commit per task. The pre-commit hook (husky) runs
`bun check`, `biome check .` and `bun test` on every commit; all three were
green.

## Design notes

- **One write, one transaction, one version.** `recordEnglishChangeTime` is a
  `beforeChange` hook, so the stamp rides along in the `data` the operation
  already writes. There is no second `UPDATE`, no second version row and no
  second pooled connection — the deadlock cannot come back through this path.
- **The comparison is by plain text, not by markup.** `englishContentChanged`
  compares `extractPlainText` of the fields that are present in the incoming
  `data`, so a format-only change (bold applied to the same words) is not a
  content change. It is the single source of truth for "the English content
  changed": `isEnglishContentChanged` (first publish **or** content change)
  and `decideTranslationAction` both go through it.
- **The locale check.** A write whose `req.locale` is not the default locale
  cannot change the English content, so it never stamps. The translation
  pipeline writes the `id` locale, so it never stamps either.
- **A budget stop is not a provider failure.** `TranslationBudgetError`
  extends `TranslationError` and carries the message "translation time
  budget reached". That message matches none of the classifier's quota /
  timeout / network / credentials patterns, so `classifyTranslationError`
  classifies it as `unexpected` — **not transient** — and the pipeline
  therefore never schedules the delayed re-run for it. The pipeline also
  checks `error instanceof TranslationBudgetError || isDeadlineReached(deadline)`
  explicitly, so the classification is not the only thing standing between a
  budget stop and a retry.
- **A timeout is only a budget stop when the deadline cut it.** The request
  timeout now rejects with a dedicated `TranslationRequestTimeoutError`. A
  timeout that fired because the deadline was near is a budget stop; any
  other error — a quota error, a credentials error — stays a provider
  failure with its own classification, whatever the remaining time is.
- **The remaining time is recomputed per field.** `buildTranslationOptions`
  returns `{ timeoutMs: deadline - now, deadline }` and is called for every
  translated field, so a request started with 2 s left is cut at 2 s, not at
  30 s.
- **The guard runs under the lock.** The per-review lock is held while the
  guard re-reads the review, so the "newer translation exists" check and the
  write that follows it cannot be interleaved by another run.
- **The bulk budget is 30 s.** The proxy read timeout is 60 s
  (`docker-compose.prod.yml`), so the request answers well inside it even
  when the in-flight review consumes the whole budget.

## Deviations

None. Every file touched is inside the phase's scope, and no Conductor state
file other than this evidence file was modified.

## Notes

- **No status transition outside the map.** The pipeline still writes
  `pending` → `translated` / `failed`; the budget stop reports `failed`, which
  `pending → failed` allows. `src/lib/translation-status.ts` was not changed.
- **The `afterChange` hook no longer writes anything at all.** The
  "translate" branch only starts the pipeline (`void runTranslationPipeline`),
  the "format-sync" branch only starts the format sync, and the "mark-stale"
  branch only starts the stale marking. All three are fire-and-forget, as
  before, but none of them is awaited any more.
- **`markTranslationStale` and `runFormatSyncPipeline` are unchanged** — they
  are fire-and-forget `void` calls from the `afterChange` hook, so they were
  never part of the deadlock.
- **Test isolation.** The hook tests stub `translateRichText` / `translateText`,
  so no real Google Translate client is created in that file (the module
  memoizes the client for the process lifetime — the trap recorded in the R1
  evidence). The new translate-batch budget tests are the only ones that
  exercise the real client, and they live in the file that owns the mock.
- **Residual risk.** The admin save path itself is not covered by an e2e
  test (the repo has no admin e2e flow — the L3 debt recorded earlier). The
  deadlock's root cause is removed structurally (no nested Local API write in
  a hook), and the hook tests assert that the `afterChange` hook resolves
  while its own write is still pending — the shape that used to deadlock.
- **Not run:** `bun run build` and a dev server are outside this phase's
  verification command.

## Evidence paths

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R2.md` (this file)
- F1: `src/hooks/translateReview.ts`, `src/collections/Reviews.ts`
- F2: `src/lib/translate.ts`, `src/lib/retranslate.ts`, `src/hooks/translateReview.ts`
- F3: `src/hooks/translateReview.ts`
- Tests: `src/hooks/__tests__/translateReview.test.ts`, `src/lib/__tests__/translate-batch.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`
- Phase commits: `614dc2b` (R2.T1), `60e422b` (R2.T2), `67eadbb` (R2.T3)
