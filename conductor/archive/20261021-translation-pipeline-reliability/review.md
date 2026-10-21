# Review: Translation Pipeline Reliability

- **Track:** `20261021-translation-pipeline-reliability`
- **Type:** feature
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Range:** `6d6e7b908b9288678e605ac02bb70ddad71317fa..2290560`
- **Date:** 2026-10-22
- **Verdict:** `PASS`
- **Rounds:** 3 (round 1 BLOCK → R1 fix phase; round 2 BLOCK → R2 fix phase; round 3 PASS WITH FINDINGS → R3 fix phase)

## Summary

The track delivers the author-facing translation workflow it set out to build: a concurrency-safe
pipeline with a per-review lock, failures classified into author-actionable messages, one automatic
delayed re-run after a transient failure, a real `stale` status driven by the English content's own
change time, live status and completion feedback in the edit view, a global attention indicator, and
a bulk re-translate action with a wall-clock budget. The public site is untouched (NFR-1).

The first review round blocked the track on two genuine correctness defects (a degenerate staleness
predicate that would have mass-labelled the corpus, and a delayed re-run that could overwrite a newer
translation). The second round blocked it on a defect the first fix itself introduced: the English
change time was written with an awaited nested `payload.update` inside the `afterChange` hook, which
opens a second transaction and deadlocks every admin save. The third round — a focused verification of
the R2 delta — passed the track with one Medium and two Low findings, all of which are fixed in the R3
phase. No finding remains open.

The fixes are structural, not cosmetic: staleness no longer depends on Payload's restamped
`updatedAt`, the English change time is written by a `beforeChange` hook (one write, one transaction,
one version) so no hook can deadlock on a second pooled connection, and the bulk batch bounds both
the loop and the review in flight so the response always lands inside the proxy's 60 s read timeout.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 393 pass / 0 fail, 29 files, 853 expect() calls (primary + reviewer re-runs) |
| coverage | `bun test --coverage` | pass | Round 3: `src/lib/translate.ts` 100% lines, `src/hooks/translateReview.ts` 90.27%; all files 91.70% funcs / 92.28% lines against an 80% gate |
| lint | `bun run lint` | pass | biome check, 182 files, 0 errors / 0 warnings (error severity) |
| format check | `biome check .` (included in lint) | pass | 0 formatting deviations |
| typecheck | `bun run typecheck` | pass | 0 errors, 190 files |
| build | `bun run build` | pass | Production build green after the migration was applied to the local DB; `ƒ /api/translation/bulk-retranslate` registered ahead of the Payload catch-all |
| e2e | `bun run test:e2e` | fail (pre-existing, not attributable) | Reproduced on the base commit with an identical failure signature — see Debt |

### e2e layer — why this is not a track finding

The Playwright suite fails on this machine with `page.goto` 30 s navigation timeouts on public pages.
The same failures reproduce on the base commit `6d6e7b9` under identical conditions (16 failed / 15
passed on main vs 21 failed / 10 passed on the branch, same specs, same error type, no assertion
failures, HTTP 200 for the same routes when requested directly). Per-request server cost is
equivalent between the branches (median 412 ms branch vs 313 ms main, same range with outliers on
both). The dev server's request handling balloons to 14–19 s under `fullyParallel` load, which trips
Playwright's `goto` budget. The track touches only admin-side code; no public file is in the diff
(NFR-1). `conductor/workflow.md` scopes the e2e layer to "when the phase touches user-facing flows" —
this phase does not. Recorded as pre-existing debt, not as a blocking finding.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P2.T1, R2.T3 | `src/components/admin/__tests__/translation-poll.test.ts` (logic only) | covered |
| FR-2 | P2.T1, R2.T3 | `src/components/admin/__tests__/translation-poll.test.ts` (logic only) | covered |
| FR-3 | P2.T2, P2.T3, R1.T6 | `src/components/admin/__tests__/translation-attention.test.ts` (13 tests) | covered |
| FR-4 | P3.T1, P3.T2, R2.T2 | `src/lib/__tests__/retranslate-bulk.test.ts`, `retranslate-bulk-run.test.ts`, `src/components/admin/__tests__/bulk-retranslate.test.ts` | covered |
| FR-5 | P1.T1, R3.T1 | `src/lib/__tests__/translation-errors.test.ts`, `translate-batch.test.ts` | covered |
| FR-6 | P1.T2, R1.T4 | `src/lib/__tests__/translation-lock.test.ts`, `src/hooks/__tests__/translateReview.test.ts` | covered |
| FR-7 | P1.T3, R1.T2, R2.T3, R3.T1 | `src/hooks/__tests__/translateReview.test.ts` | covered |
| FR-8 | P1.T4, R1.T1, R2.T1 | `src/lib/__tests__/translation-status.test.ts` | covered |
| NFR-1 | no public-site file in `6d6e7b9..HEAD` | `git diff --stat` | covered |
| NFR-2 | P1.T1–P3.T3, R1.T1–R3.T2 | `bun test`, `bun run typecheck`, `bun run lint`, `bun run build` | covered |
| NFR-3 | P2.T2, P3.T1, R1.T1 | `src/collections/Reviews.ts:39-57`, `src/app/(payload)/api/translation/bulk-retranslate/route.ts:18-34`, `src/lib/retranslate.ts:186-215` | covered |
| NFR-4 | P2.T1, P2.T2, P3.T2 | `translation-attention.ts:21-26`, `bulk-retranslate.ts:16`, `retranslate.ts:73`, AbortController cleanup in both components | covered |
| AC-1 | P2.T1, R2.T3 | `translation-poll.test.ts` | covered |
| AC-2 | P2.T1, R2.T3 | `translation-poll.test.ts` | covered |
| AC-3 | P2.T2, P2.T3 | `translation-attention.test.ts` (statuses × threshold, 24h boundary, where-clause, extraction) | covered |
| AC-4 | P3.T1, P3.T2, R2.T2 | `retranslate-bulk-run.test.ts` (sequential order, per-review isolation, access skip, budget) | covered |
| AC-5 | P1.T1, R3.T1 | `translation-errors.test.ts` (429, 403 quota-vs-permission, 401/400, 5xx, timeout, cause chains) | covered |
| AC-6 | P1.T2 | `translation-lock.test.ts`, `translateReview.test.ts` (duplicate trigger no-op) | covered |
| AC-7 | P1.T3, R1.T2, R2.T3, R3.T1 | `translateReview.test.ts` (transient → one re-run → failed; credentials → immediate failed; newer translation survives) | covered |
| AC-8 | P1.T4, R1.T1 | `translation-status.test.ts` (a freshly translated review is never stale; legacy rows skipped) | covered |

## Findings

### Critical

- none

### High

- **F1 — The staleness predicate is degenerate: the backfill mass-flips translated reviews to `stale`** — **resolved in R1**
  - **File:** `src/migrations/20261021_120000_backfill_stale_translation_status.ts:9-13` (and `:21-25` for `down`); mirrored by `src/lib/translation-status.ts:61-65` and `src/hooks/translateReview.ts:78-84`
  - **What:** staleness was selected with `updated_at > translation_updated_at`, but `updated_at` is stamped by Payload on *every* write (`node_modules/payload/dist/collections/operations/utilities/update.js`: `dataToUpdate.updatedAt = new Date().toISOString()`), while the pipeline writes `translation_updated_at` in the `data` payload *before* the update call. The comparison was therefore true by milliseconds for every review the pipeline had ever translated — and any later unrelated save (rating, publish, autoTranslate toggle) satisfied it with certainty. The `down` migration reverted exactly the same always-true set.
  - **Why:** running the migration mass-mislabelled the corpus. The attention bell (FR-3) would then list essentially every translated review as "needing attention" and the bulk action (FR-4) would offer all of them for re-translation, burning Google quota — the opposite of the track's goal. The transition map then blocks legal `stale → failed` / `stale → untranslated` moves. The existing unit test only exercised equal timestamps — a state that never occurs in the database — which is why CI could not see the defect.
  - **Fix applied:** a non-localized `englishUpdatedAt` date field records the English content's own change time; staleness is `englishUpdatedAt > translationUpdatedAt` in the hook's stale branch, in `shouldBackfillToStale`, and in the migration SQL. Legacy rows (no `englishUpdatedAt`) are not backfilled and the migration says so. The never-applied backfill migration was deleted; `20261021_140330_add_english_updated_at` replaces it. The stamp is written by a `beforeChange` hook in R2 (see round 2).
  - **Requirement:** FR-8, AC-8
  - **Test gap closed:** a freshly translated review is never selected for backfill; an English edit newer than the translation is stale; legacy rows are skipped.

- **F2 — The delayed re-run can overwrite a newer successful translation with pre-edit content** — **resolved in R1**
  - **File:** `src/hooks/translateReview.ts:226, 240-256`
  - **What:** `scheduleTranslationRetry(payload, doc, ...)` closed over the `doc` captured when the failed run started, so the retry translated the English content as it was at failure time.
  - **Why:** a save made inside the three-minute window starts a second pipeline that succeeds and writes a fresh translation; at t=3m the retry fired with the old snapshot, overwrote the `id` locale with pre-edit content, and set `translationStatus: "translated"` — the Indonesian page then served out-of-date content while the status claimed `translated`.
  - **Fix applied:** the retry re-reads the review (`findByID`, locale `en`, depth 0`) and skips when it is gone, no longer published, or when a newer `translationUpdatedAt` exists; the fresh document is passed to the pipeline. R2 closed the remaining TOCTOU window by re-checking under the lock.
  - **Requirement:** FR-7, AC-7
  - **Test gap closed:** a failed run followed by a successful run with changed content keeps the newer translation when the delayed retry fires.

### Medium

- **F3 — The edit-view poller is inert in the save-triggered flow** — **resolved in R1**
  - **File:** `src/components/admin/TranslationStatusPoller.tsx:70`
  - **What:** the poller only fetched while the form's visible `translationStatus` was exactly `pending`, but the pipeline writes `pending` asynchronously — after the save response was built — so the poller returned on every tick in the "author saves from the open edit view" flow.
  - **Why:** FR-1/FR-2 delivered nothing in the flow the overview describes: no live status update, no completion toast, and an invisible failure.
  - **Fix applied:** a pure `shouldPollTranslationStatus` helper polls while the status is `pending` **or** the document was modified within a 10-minute window (Payload refreshes `updatedAt` after a save).
  - **Requirement:** FR-1, FR-2, AC-1, AC-2
  - **Test gap closed:** unit tests for the poll rule, including the save-triggered case.

- **F4 — `isTranslationLocked()` has no test at all** — **resolved in R1**
  - **File:** `src/lib/translation-lock.ts:74-92`
  - **What:** the only test exercising the "already running → skipped" path mocked the helper away, so neither the Redis branch nor the in-memory branch ever executed.
  - **Why:** the helper gates FR-4's "a review whose pipeline is already running is reported as skipped" outcome — an implementation without verification. A regression passes CI silently: always-false turns a running review into a misleading `failed`; always-true skips every selected review and the bulk action silently does nothing.
  - **Fix applied:** five cases — fake Redis returning a value → true; Redis miss and no memory lock → false; Redis error → falls through to the in-memory map (live lock → true, expired → false); memory-only path with a live lock → true.
  - **Requirement:** FR-4, AC-4
  - **Test gap closed:** as described.

- **F5 — The bulk batch has no wall-clock budget behind a 60 s proxy read timeout** — **resolved in R1, hardened in R2**
  - **File:** `src/lib/retranslate.ts:161-171`
  - **What:** one HTTP request ran up to 50 sequential pipeline runs, each translating four rich-text fields plus the quotes array, with no wall-clock budget. Production runs behind Traefik (`docker-compose.prod.yml:60`), whose default read timeout is 60 s.
  - **Why:** a large selection could exceed the proxy timeout: the connection is cut, the client reports a generic "Request failed", every per-review outcome is lost, and the server keeps translating and consuming quota.
  - **Fix applied:** R1 bounded the loop (45 s) and reported the untouched ids as `skipped` with a reason. R2 bounded the *in-flight* review too: the budget is 30 s, the in-flight review shares the batch deadline, the pipeline stops before every translated field, the per-request timeout is capped at the remaining time, the backoff never sleeps past the deadline, and a budget-stopped review is reported as its own outcome. The doc comment now states what is actually guaranteed.
  - **Requirement:** FR-4, AC-4
  - **Test gap closed:** the budget stops the loop, the untouched ids are reported as skipped with a reason, and a review that hits the deadline is reported as a budget stop.

### Low

- **L1 — The attention bell's badge count is the number of rows returned, not the number needing attention** — **resolved in R1**
  - **File:** `src/components/admin/TranslationAttentionBell.tsx:81-86`
  - **What:** the badge was `items.length` (capped by the query limit), so the "20+" branch was unreachable.
  - **Why:** FR-3 asks for "the count of reviews whose translation needs attention"; with 57 failed reviews the bell showed "20", understating the backlog.
  - **Fix applied:** the badge reads `totalDocs` from the REST list response through the tested `formatAttentionBadgeLabel` helper.
  - **Requirement:** FR-3

- **L2 — The recorded contract and the delivered surface differ for the bulk action** — **resolved by the primary**
  - **File:** `conductor/tracks/20261021-translation-pipeline-reliability/plan.md:79`; `spec.md` FR-4 / AC-4
  - **What:** Phase 3's `Touches` omitted the files the phase created, and FR-4/AC-4 described "the reviews list view offers a bulk action" whereas the implementation is an admin action on the reviews admin path (Payload 3.90 hardcodes list-view bulk actions; the only list injection point is the root collection file, which the plan forbade touching).
  - **Fix applied:** Phase 3's `Touches` now includes `src/app/(payload)/api/**`, `src/components/admin/*`, and `src/payload.config.ts`; FR-4/AC-4/FR-8/AC-8 in `spec.md` were reworded to match the delivered surface and the accurate staleness signal.
  - **Requirement:** FR-4, AC-4

- **L3 — No DOM or admin-flow test harness behind the admin surfaces** — **recorded as debt (not fixed)**
  - **File:** `src/components/admin/TranslationStatusPoller.tsx:104-115` (and the bell/bulk components)
  - **What:** component wiring (effect lifetime, abort/cleanup, dispatch calls, panel interaction) is verified only by typecheck and reading; the repo has no DOM renderer and the Playwright suite covers public pages only — and the e2e layer is currently not a usable signal at all.
  - **Why:** AC-1…AC-4 rest on pure-logic unit tests, so a UI regression in the poll/bell/bulk wiring would not be caught. Pre-existing debt, not introduced by this track; not blocking. R1's first cut made this gap sharper (it added an awaited write to the save path) — the deadlock was then found by reading the Payload internals, not by a test, which is exactly the risk this finding describes.
  - **Requirement:** NFR-2, AC-1, AC-2, AC-3, AC-4

- **L4 — Sub-task checkboxes contradict the recorded phase evidence** — **resolved by the primary**
  - **File:** `conductor/tracks/20261021-translation-pipeline-reliability/plan.md`
  - **Fix applied:** all sub-task boxes (P1–P3, R1, R2, R3) are ticked to match the evidence files.

## Round 2

- **Range:** `6c761aa..281e0fc` — the focused re-review of the R1 fix phase
- **Verdict:** `BLOCK`
- **Findings:** F1 (High) the awaited nested `payload.update` in the `afterChange` hook; F2 (Medium) the bulk budget did not bound the in-flight review; F3 (Low) TOCTOU between the retry's freshness check and the lock acquisition; F4 (Low) unticked R1 sub-task boxes; F5 (Low) the migration was not applied to the local dev DB, so `bun run build` failed with `42703`.

- **F1 (High) — every admin save of a changed review deadlocks.** `recordEnglishUpdatedAt` called `await payload.update(...)` from the Reviews `afterChange` hook. The Local API always builds a fresh request (`local/update.js` → `createLocalReq` with `req = {}` → no `transactionID`), so the nested call opens a *second* transaction on a *second* pooled connection, while the outer update holds the row lock on the same row until `commitTransaction` runs — after the hook returns. The nested `UPDATE` waits for the outer commit; the outer commit waits for the hook. Verified in the installed Payload source (`updateByID.js:24` begin, `utilities/update.js:386-398` hooks, `updateByID.js:226` commit) and by the Postgres row-lock semantics.
  - **Fix applied (R2):** the English change time is now written **into the incoming data** by a `beforeChange` hook (`recordEnglishChangeTime`), so the outer `UPDATE` carries the column — one write, one transaction, one version, and no second pooled connection. The nested write and both of its call sites are gone; the afterChange hook now only fires `void`-ed pipeline calls, so the outer transaction never waits on a second connection. The stamp rules are explicit: default locale only (the pipeline's `locale: "id"` writes never stamp), plain-text comparison (a format-only change is not a content change), no stamp for a write that carries no rich-text field (the pipeline's status writes), `create` stamps.
- **F2 (Medium) — the budget did not bound the in-flight review.** The loop checked the deadline before starting a review, but a started review could take ~100 s (four fields × 30 s request timeout × 3 attempts + backoff). The doc comment claimed "the proxy timeout cannot cut the response off" — overstated.
  - **Fix applied (R2):** the batch budget is 30 s, the in-flight review shares the batch deadline, the pipeline stops before every translated field, the per-request timeout is capped at the remaining time, the backoff never sleeps past the deadline, and the review is reported as a budget stop with its own outcome. The comment now states precisely what is guaranteed.
- **F3 (Low) — TOCTOU in the delayed re-run.** The freshness check ran before the lock was acquired.
  - **Fix applied (R2):** `abortIfTranslationNewerThan` makes the run re-read the review *after* acquiring the lock and abort when a newer `translationUpdatedAt` exists; the delayed re-run passes its captured failure timestamp.
- **F4 (Low) / F5 (Low) —** the R1 sub-task boxes were ticked by the primary, and the migration was applied to the local dev DB so the production build is green again.

## Round 3

- **Range:** `b967129..2290560` — a focused verification of the R2 delta (the nominal cap is two review rounds; round 2 surfaced a defect the round-1 fix itself introduced, so a focused third verification was run and is the last round for this track)
- **Verdict:** `PASS WITH FINDINGS` — "the track is ready to ship with that follow-up"
- **F1 (Medium) — a provider failure arriving at/after the deadline was misreported as a budget stop.** The R2 deadline logic converted *every* error into `TranslationBudgetError`, contradicting the code's own contract ("any other error — even a quota error — is a provider failure, whatever the remaining time is"). A quota or credentials failure arriving late was recorded as "translation time budget reached" instead of the actionable provider message, losing the raw detail (FR-5) and, being classified non-transient, skipping the automatic delayed re-run (FR-7/AC-7).
  - **Fix applied (R3):** the retry loop rethrows the original provider error (`TranslationError` with the original cause and attempt count) instead of converting it; only a request the deadline actually cut is a budget stop; the pipeline's budget-stop detection keys solely off `TranslationBudgetError`. A quota failure at or after the deadline stays a quota failure and still schedules the delayed re-run. The single-review path (no deadline) is unchanged line-by-line: 3 attempts, backoff `[2000, 8000, 30000]`, `attempts = 3`, the same classifier outcome.
- **F2 (Low) — the R2 parent checkboxes were unticked.** Fixed by the primary.
- **F3 (Low) — the guard's "review no longer exists" branch was untested.** Fixed in R3: a pipeline run whose `findByID` throws performs no `payload.update` and writes no translation.

## Overrides

- none

## Plan compliance

- All six phases ran (P1, P2, P3, R1, R2, R3), each produced a `Result`, a `Checkpoint`, and an evidence file, and each was verified independently by the primary (typecheck, lint, tests; the build re-run by the primary after the migration was applied).
- Every task in the plan was implemented; none was dropped.
- The final diff stays inside the union of the phases' `Touches` except for the reported deviations: `src/lib/translation-lock.ts` (a read-only `isTranslationLocked()` helper, additive), `src/payload.config.ts` (registration lines for the attention bell and the bulk action), and the generated `src/app/(payload)/admin/importMap.js` (regenerated with the real generator — byte-identical to the hand-written entry).
- The root `src/collections/Reviews.ts` is modified deliberately and only for the `englishUpdatedAt` field (R1) and the registration of the `beforeChange` hook (R2) — both reviewed changes, both required by the High findings.
- The phase task-level commits were kept rather than squashed into one commit per phase, as `conductor/workflow.md` prefers. The recorded checkpoints reference them, and rewriting the history after three review rounds would invalidate the audit trail for no functional gain. Recorded here as a deviation.
- `.opencode/agents/conductor-phase.md` gained two allow-listed commands (`git rm`, `bunx payload generate:types`) because the phase agent needed them — tooling, not product code.

## Out of scope

- A DOM test renderer or an admin-flow Playwright spec (L3) — depends on the e2e harness being healthy; separate track.
- A public-site i18n layer, reader-facing translation notices, and translating content types other than Reviews — explicitly out of scope in `spec.md`.
- The `locale` query-parameter cast on the public review page (`payload.find({ locale: locale as "en" | "id" })` with an unvalidated param) — a separate pre-existing bug, not touched by this track.

## Debt

- **L3 — no DOM / admin-flow test harness.** Pre-existing: the repo has no DOM renderer and the Playwright suite (public pages only) fails in this environment with `page.goto` 30 s timeouts on the base commit `6d6e7b9` as well as on this branch. `review.issues.enabled` is `false`, so it is recorded here rather than filed as an issue. Follow-up: add one admin-flow spec once the harness is healthy.
- **e2e layer fails environmentally (pre-existing).** Reproduced on the base commit with an identical failure signature and equivalent per-request server cost on both branches. The track changes no public file (NFR-1), and the layer's own applicability rule scopes e2e to phases that touch user-facing flows. Follow-up: reduce `fullyParallel` worker contention for the local dev server, or point the suite at a production build, so the layer becomes a usable signal again.
- **Legacy reviews are not backfilled to `stale`.** A consequence of the F1 fix: a review's English-change time was never recorded before this release, so its staleness cannot be established. Its status stays `translated` and it does not appear in the attention list. Follow-up (optional, future track): a heuristic backfill accepting that a non-content save (rating, publish) also bumps `updated_at` and would produce false positives.
- **A save that lands while a translation is running is dropped by the lock.** The per-review lock makes the second trigger a no-op, and the pipeline stamps `translationUpdatedAt` with its completion time, so the newest English edit is not translated — and is not reported as stale — until the next save. Pre-existing from the Phase 1 lock, not raised by any review round; fixing it needs run coalescing (re-run once when the running pipeline finishes) or a content hash instead of timestamps. Follow-up track.
- **The bulk action recovers a bounded number of reviews per request.** The 30 s batch budget (chosen to keep the response inside the proxy's 60 s read timeout) means a large selection is only partly processed; the remaining reviews are reported as skipped with a reason and can be picked up by the next run. Expected and documented in `docs/ADMIN_GUIDE.md`.

## Doc sync

`done` — `docs/ADMIN_GUIDE.md`'s "Indonesian Translation" section now documents the shipped behaviour:
the live status/toast in the edit view, the attention indicator, the bulk re-translate action and its
batch budget, the actionable failure messages with the single automatic re-run, and the precise
meaning of `stale` (the English content's change time against the translation's). `docs/PRD.md` and
`README.md` describe the translation feature at a level that remains accurate and needed no change;
`conductor/product.md` and `conductor/tech-stack.md` stay accurate as written.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 2 | 3 | 4 | 9 (fix phase R1) |
| 2 | BLOCK | 0 | 1 | 1 | 3 | 5 (fix phase R2) |
| 3 | PASS WITH FINDINGS | 0 | 0 | 1 | 2 | 3 (fix phase R3) |
| final | PASS | 0 | 0 | 0 | 0 | all findings resolved; L3 and the remaining items are recorded as debt |
