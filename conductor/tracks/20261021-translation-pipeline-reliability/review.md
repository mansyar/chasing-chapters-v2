# Review: Translation Pipeline Reliability

- **Track:** `20261021-translation-pipeline-reliability`
- **Type:** feature
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Range:** `6d6e7b908b9288678e605ac02bb70ddad71317fa..25bd755`
- **Date:** 2026-10-22
- **Verdict:** `BLOCK`

## Summary

The track is well structured and every configured check that can produce a signal is green (typecheck, lint, 350 unit tests, production build, 90.18% coverage against an 80% gate), but two genuine correctness defects in the Phase 1 pipeline block it. The staleness predicate compares the document's `updated_at` against `translation_updated_at`, and Payload stamps `updated_at` on *every* write — including the pipeline's own translation write — so the predicate is true for essentially every translated review: the backfill migration would mass-flip the corpus to `stale`, turning the new attention bell into noise and the bulk action into a quota burner (F1). The delayed re-run closes over the document snapshot captured at failure time, so a save made inside the three-minute window can be overwritten by the retry with pre-edit content while the status still claims `translated` — the exact silent-fallback failure this track exists to eliminate (F2). Three Medium findings (an inert poller in the save-triggered flow, an untested lock helper, an unbounded bulk batch behind a 60 s proxy read timeout) and four Low findings also apply. Review mode is strict, so every in-scope finding is fixed in Phase R1 before the PR.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 350 pass / 0 fail, 29 files, 738 expect() calls (primary + reviewer re-run) |
| coverage | `bun test --coverage` | pass | All files 90.45% funcs / 90.18% lines (gate 80%, new-code scope) |
| lint | `bun run lint` | pass | biome check, 182 files, 0 errors / 0 warnings (error severity) |
| format check | `biome check .` (included in lint) | pass | 0 formatting deviations |
| typecheck | `bun run typecheck` | pass | 0 errors, 190 files |
| build | `bun run build` | pass | Production build green; `ƒ /api/translation/bulk-retranslate` registered ahead of the Payload catch-all |
| e2e | `bun run test:e2e` | fail (pre-existing, not attributable) | Reproduced on the base commit with an identical failure signature — see Debt (L3) |

### e2e layer — why this is not a track finding

The Playwright suite fails on this machine with `page.goto` 30 s navigation timeouts on public pages. The same failures reproduce on the base commit `6d6e7b9` under identical conditions (16 failed / 15 passed on main vs 21 failed / 10 passed on the branch, same specs, same error type, no assertion failures, HTTP 200 for the same routes when requested directly). Per-request server cost is equivalent between the branches (median 412 ms branch vs 313 ms main, same range with outliers on both). The dev server's request handling balloons to 14–19 s under `fullyParallel` load, which trips Playwright's `goto` budget. The track touches only admin-side code; no public file is in the diff (NFR-1). `conductor/workflow.md` scopes the e2e layer to "when the phase touches user-facing flows" — this phase does not. Recorded as pre-existing debt (L3), not as a blocking finding.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P2.T1 | `src/components/admin/__tests__/translation-poll.test.ts` (logic only) | partial — see F3 |
| FR-2 | P2.T1 | `src/components/admin/__tests__/translation-poll.test.ts` (logic only) | partial — see F3 |
| FR-3 | P2.T2, P2.T3 | `src/components/admin/__tests__/translation-attention.ts` suite (13 tests) | covered (badge count caveat → L1) |
| FR-4 | P3.T1, P3.T2 | `src/lib/__tests__/retranslate-bulk.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`, `src/components/admin/__tests__/bulk-retranslate.test.ts` | partial — see F4, F5 |
| FR-5 | P1.T1 | `src/lib/__tests__/translation-errors.test.ts` | covered |
| FR-6 | P1.T2 | `src/lib/__tests__/translation-lock.test.ts`, `src/hooks/__tests__/translateReview.test.ts` | covered (helper gap → F4) |
| FR-7 | P1.T3 | `src/hooks/__tests__/translateReview.test.ts` | partial — see F2 |
| FR-8 | P1.T4 | `src/lib/__tests__/translation-status.test.ts` (synthetic timestamps only) | partial — see F1 |
| NFR-1 | no public-site file in `6d6e7b9..HEAD` | `git diff --stat` | covered |
| NFR-2 | P1.T1–P3.T3 | `bun test`, `bun run typecheck`, `bun run lint`, `bun run build` | covered |
| NFR-3 | P2.T2, P3.T1 | `src/collections/Reviews.ts:39-57`, `src/app/(payload)/api/translation/bulk-retranslate/route.ts:18-34`, `src/lib/retranslate.ts:186-215` | covered |
| NFR-4 | P2.T1, P2.T2, P3.T2 | `translation-attention.ts:21-26`, `bulk-retranslate.ts:16`, `retranslate.ts:73`, AbortController cleanup in both components | covered |
| AC-1 | P2.T1 | `translation-poll.test.ts` | partial — see F3 |
| AC-2 | P2.T1 | `translation-poll.test.ts` | partial — see F3 |
| AC-3 | P2.T2, P2.T3 | `translation-attention.test.ts` (statuses × threshold, 24h boundary, where-clause, extraction) | covered |
| AC-4 | P3.T1, P3.T2 | `retranslate-bulk-run.test.ts` (sequential order asserted, per-review isolation, access skip) | partial — see F4, F5, L2 |
| AC-5 | P1.T1 | `translation-errors.test.ts` (429, 403 quota-vs-permission, 401/400, 5xx, timeout, cause chains) | covered |
| AC-6 | P1.T2 | `translation-lock.test.ts`, `translateReview.test.ts` (duplicate trigger no-op) | covered |
| AC-7 | P1.T3 | `translateReview.test.ts` (transient → one re-run → failed; credentials → immediate failed) | partial — see F2 |
| AC-8 | P1.T4 | `translation-status.test.ts` (predicate only; the migration SQL is never executed by a test) | partial — see F1 |

## Findings

### Critical

- none

### High

- **F1 — The staleness predicate is degenerate: the backfill mass-flips translated reviews to `stale`**
  - **File:** `src/migrations/20261021_120000_backfill_stale_translation_status.ts:9-13` (and `:21-25` for `down`); mirrored by `src/lib/translation-status.ts:61-65` and `src/hooks/translateReview.ts:78-84`
  - **What:** staleness is selected with `updated_at > translation_updated_at`, but `updated_at` is stamped by Payload on *every* write (`node_modules/payload/dist/collections/operations/utilities/update.js`: `dataToUpdate.updatedAt = new Date().toISOString()`), while the pipeline writes `translation_updated_at` in the `data` payload *before* the update call (`src/hooks/translateReview.ts:186`). The comparison is therefore true by milliseconds for every review the pipeline has ever translated — and any later unrelated save (rating, publish, autoTranslate toggle) satisfies it with certainty. The `down` migration reverts exactly the same always-true set.
  - **Why:** running the migration mass-mislabels the corpus. The attention bell (FR-3) then lists essentially every translated review as "needing attention" and the bulk action (FR-4) offers all of them for re-translation, burning Google quota — the opposite of the track's goal. The transition map then blocks legal `stale → failed` / `stale → untranslated` moves. The existing unit test only exercises equal timestamps (`translation-status.test.ts:163-172`) — a state that never occurs in the database — which is why CI cannot see the defect.
  - **Fix:** stop deriving staleness from the document's `updated_at`. Track the English content's own change time: add a non-localized `englishUpdatedAt` date field written by the `translateReview` hook when the English rich text changes, write `translationUpdatedAt` from the same clock in the pipeline, and compare `englishUpdatedAt > translationUpdatedAt` in `decideTranslationAction`, in `shouldBackfillToStale`, and in the migration SQL. Legacy rows (no `englishUpdatedAt`) are not backfilled — their English change time was never recorded — and the migration must say so. The corresponding AC-8 wording in `spec.md` is amended to match.
  - **Requirement:** FR-8, AC-8
  - **Test gap:** a test asserting a freshly translated review (whose `updated_at` is later than its `translation_updated_at`) is **not** selected for backfill, plus a test of the new predicate with an English-change timestamp older and newer than the translation.

- **F2 — The delayed re-run can overwrite a newer successful translation with pre-edit content**
  - **File:** `src/hooks/translateReview.ts:226, 240-256`
  - **What:** `scheduleTranslationRetry(payload, doc, ...)` closes over the `doc` captured when the failed run started; the timer calls `runTranslationPipeline(payload, doc, { isRetry: true })` with that stale snapshot, so the retry translates the English content as it was at failure time.
  - **Why:** a save made inside the three-minute window starts a second pipeline (the lock is free after the first run released it) that succeeds and writes a fresh translation at t≈1m. At t=3m the retry fires with the old snapshot, overwrites the `id` locale with pre-edit content, and sets `translationStatus: "translated"` with a fresh `translationUpdatedAt` — the Indonesian page then serves out-of-date content while the status claims `translated`, and the newer translation is lost. This is precisely the silent-fallback failure the track exists to eliminate. The retry also re-checks nothing, so a review unpublished or deleted in the meantime is still re-translated.
  - **Fix:** re-read the document in the retry before translating (`payload.findByID({ collection: "reviews", id, locale: "en", depth: 0 })`), skip the retry when the review is no longer published or when the fresh `translationUpdatedAt` is newer than the failure timestamp (a newer run already succeeded), and pass the fresh document to `runTranslationPipeline`.
  - **Requirement:** FR-7, AC-7
  - **Test gap:** a test where a first run fails, a second run succeeds with changed content, the delayed retry fires, and the newer translation is asserted to survive (and the status is not reset).

### Medium

- **F3 — The edit-view poller is inert in the save-triggered flow**
  - **File:** `src/components/admin/TranslationStatusPoller.tsx:70`
  - **What:** the poller only fetches while the form's visible `translationStatus` is exactly `pending` (`if (shownStatus !== PENDING_STATUS) return;`), but the pipeline writes `pending` asynchronously — the hook fires it with `void runTranslationPipeline(payload, doc)` (`src/hooks/translateReview.ts:373`), so the `pending` write lands after the save response was built. In the "author saves from the open edit view" flow the form still shows the pre-pipeline status and the poller returns on every tick.
  - **Why:** FR-1/FR-2 deliver nothing in the flow the overview describes ("the author publishes a review and sees pending → translated without a refresh"): no live status update and no completion toast, and a failed translation stays invisible in the open edit view. The mechanism only works when the edit view was mounted while the document was already `pending`.
  - **Fix:** widen the poll condition so the poller also polls while a background pipeline may be running for this document (e.g. the document was modified within a recent window), and keep the decision in a pure helper (`shouldPollTranslationStatus`) with unit tests covering the save-triggered case.
  - **Requirement:** FR-1, FR-2, AC-1, AC-2
  - **Test gap:** unit tests for the extracted poll rule, including "saved from this edit view" and "stale document, no pipeline".

- **F4 — `isTranslationLocked()` has no test at all**
  - **File:** `src/lib/translation-lock.ts:74-92`
  - **What:** the only test exercising the "already running → skipped" path (`src/lib/__tests__/retranslate-bulk-run.test.ts:141-143`) mocks the helper away, so neither the Redis branch nor the in-memory branch ever executes (matches the coverage report's uncovered range 74-90).
  - **Why:** the helper gates FR-4's "a review whose pipeline is already running is reported as skipped" outcome, so that requirement currently has an implementation without verification. A regression passes CI silently: always-false turns a running review into a misleading `failed`; always-true skips every selected review and the bulk action silently does nothing.
  - **Fix:** add cases to `src/lib/__tests__/translation-lock.test.ts`: fake Redis returning a value → true; fake Redis returning null and no memory lock → false; Redis error → falls through to the in-memory map (live lock → true, expired → false); memory-only path (`getRedisClient` → null) with a live lock → true.
  - **Requirement:** FR-4, AC-4
  - **Test gap:** as described above.

- **F5 — The bulk batch has no wall-clock budget behind a 60 s proxy read timeout**
  - **File:** `src/lib/retranslate.ts:161-171`
  - **What:** one HTTP request runs up to 50 sequential pipeline runs, each translating four rich-text fields plus the quotes array, with no wall-clock budget. Production runs behind Traefik (`docker-compose.prod.yml:60`), whose default read timeout is 60 s.
  - **Why:** a large selection (the spec's own edge case: "bulk re-translation of a large selection") can exceed the proxy timeout: the connection is cut, `BulkRetranslateAction.tsx:153-155` reports a generic "Request failed", and every per-review outcome — the thing AC-4 requires — is lost, while the server keeps translating and consuming Google API quota. The author then retries and re-translates the same reviews.
  - **Fix:** bound the batch by wall clock inside `retranslateReviews`: stop the loop after a budget (e.g. 45 s) and report the remaining ids as `{ status: "skipped", reason: "not attempted — batch time budget reached" }` so the response still carries a per-review outcome.
  - **Requirement:** FR-4, AC-4
  - **Test gap:** a test that the budget stops the loop and that the untouched ids are reported as skipped with a reason.

### Low

- **L1 — The attention bell's badge count is the number of rows returned, not the number needing attention**
  - **File:** `src/components/admin/TranslationAttentionBell.tsx:81-86`
  - **What:** the badge is `items.length`, i.e. the number of rows the REST call returned (capped by `limit: String(TRANSLATION_ATTENTION_LIMIT)`), so the `count > limit` branch that would render "20+" is unreachable.
  - **Why:** FR-3 asks for "the count of reviews whose translation needs attention"; with 57 failed reviews the bell shows "20", understating the backlog and hiding that the list is truncated.
  - **Fix:** read `totalDocs` from the REST list response and use it for the badge, keeping the "+" suffix when it exceeds the limit; extend the response interface with `totalDocs?: number`.
  - **Requirement:** FR-3
  - **Test gap:** none

- **L2 — The recorded contract and the delivered surface differ for the bulk action**
  - **File:** `conductor/tracks/20261021-translation-pipeline-reliability/plan.md:79`; `spec.md` FR-4 / AC-4
  - **What:** Phase 3's `Touches` list does not include the files the phase actually created (`src/app/(payload)/api/translation/bulk-retranslate/route.ts`, `src/components/admin/BulkRetranslateAction.tsx`, `src/components/admin/bulk-retranslate.ts`), and FR-4/AC-4 describe "the reviews list view offers a bulk action" whereas the implementation is an admin action on the reviews admin path that re-lists failed/stale candidates itself (Payload 3.90 hardcodes list-view bulk actions; the only list injection point is the root collection file, which the plan forbade touching).
  - **Why:** the delivered behavior differs from the recorded contract; a later reviewer or fixer reading `spec.md` will look for a list-view bulk action that does not exist.
  - **Fix:** amend Phase 3's `Touches` to include `src/app/(payload)/api/**` and `src/components/admin/*`, and reword FR-4/AC-4 to match the delivered surface, noting that Payload 3.90 offers no pluggable list-view bulk-action slot.
  - **Requirement:** FR-4, AC-4
  - **Test gap:** none

- **L3 — No DOM or admin-flow test harness behind the admin surfaces**
  - **File:** `src/components/admin/TranslationStatusPoller.tsx:104-115` (and the bell/bulk components)
  - **What:** component wiring (effect lifetime, abort/cleanup, dispatch calls, panel interaction) is verified only by typecheck and reading; the repo has no DOM renderer and the Playwright suite covers public pages only — and the e2e layer is currently not a usable signal at all (the same `page.goto` 30 s timeouts reproduce on the base commit).
  - **Why:** AC-1…AC-4 rest entirely on pure-logic unit tests, so a UI regression in the poll/bell/bulk wiring (a leaked interval, a toast that never renders, a panel that never opens) would not be caught. Pre-existing debt, not introduced by this track; not blocking.
  - **Fix:** record as debt — once the Playwright harness is healthy (dev-server load / `fullyParallel` reduced), add one admin-flow spec: open a review with a pending status → the status field and toast update; the bell lists a failed review and links to it; the bulk panel selects two reviews and shows two outcome lines. The pure-helper structure this track uses keeps that spec cheap to write.
  - **Requirement:** NFR-2, AC-1, AC-2, AC-3, AC-4
  - **Test gap:** no DOM/e2e coverage for the admin surfaces (known, non-blocking).

- **L4 — Sub-task checkboxes contradict the recorded phase evidence**
  - **File:** `conductor/tracks/20261021-translation-pipeline-reliability/plan.md:24-36, 59-65, 88-92`
  - **What:** all three phases are marked verified with task-level checkboxes ticked, but every sub-task checkbox (P1.T1.1–P1.T4.3, P2.T1.1–P3.T3.1) is still unchecked.
  - **Why:** the plan contradicts `verification/phase-1.md`, `phase-2.md`, and `phase-3.md`, which cite each sub-task as delivered; the plan is the artifact a later fixer reads first.
  - **Fix:** tick the completed sub-task checkboxes to match the evidence files.
  - **Requirement:** none
  - **Test gap:** none

## Overrides

- none

## Plan compliance

- All three planned phases ran, produced a `Result`, a `Checkpoint`, and an evidence file, and were verified independently by the primary (typecheck, lint, tests, build re-run by the primary; tests and lint re-run by the reviewer).
- Every task in the plan was implemented; none was dropped.
- The final diff stays inside the union of the phases' `Touches` except for the three reported deviations: `src/lib/translation-lock.ts` (read-only `isTranslationLocked()` helper, additive), `src/payload.config.ts` (one registration line for the bulk action), and the generated `src/app/(payload)/admin/importMap.js` (regenerated by the primary with the real generator — byte-identical to the hand-written entry).
- The root `src/collections/Reviews.ts` was not modified by the implementation, as the plan required. Phase R1 modifies it deliberately to add the `englishUpdatedAt` field required by the F1 fix; that is a scoped, reviewed change.
- Sub-task checkboxes were not ticked (L4) — corrected in Phase R1.

## Out of scope

- A DOM test renderer or an admin-flow Playwright spec (L3) — depends on the e2e harness being healthy; separate track.
- A public-site i18n layer, reader-facing translation notices, and translating content types other than Reviews — explicitly out of scope in `spec.md`.
- The `locale` query-parameter cast on the public review page (`payload.find({ locale: locale as "en" | "id" })` with an unvalidated param) — a separate pre-existing bug, not touched by this track.

## Debt

- **L3 — no DOM / admin-flow test harness.** Pre-existing: the repo has no DOM renderer and the Playwright suite (public pages only) fails in this environment with `page.goto` 30 s timeouts on the base commit `6d6e7b9` as well as on this branch. Not fixable inside this track; `review.issues.enabled` is `false`, so it is recorded here rather than filed as an issue. Follow-up: add one admin-flow spec once the harness is healthy.
- **e2e layer fails environmentally (pre-existing).** Reproduced on the base commit with an identical failure signature and equivalent per-request server cost on both branches. The track changes no public file (NFR-1), and the layer's own applicability rule scopes e2e to phases that touch user-facing flows. Follow-up: reduce `fullyParallel` worker contention for the local dev server, or point the suite at a production build, so the layer becomes a usable signal again.
- **Legacy reviews are not backfilled to `stale`.** A consequence of the F1 fix: a review's English-change time was never recorded before this release, so its staleness cannot be established. Its status stays `translated` and it does not appear in the attention list. Follow-up (optional, future track): a heuristic backfill, e.g. `updated_at > translation_updated_at + INTERVAL '1 day'`, accepting that a non-content save (rating, publish) also bumps `updated_at` and would produce false positives.

## Doc sync

`pending` — `conductor/tech-stack.md` and the product docs are updated after the review fixes land, in the completion step.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 2 | 3 | 4 | 0 (fix phase R1 pending) |
