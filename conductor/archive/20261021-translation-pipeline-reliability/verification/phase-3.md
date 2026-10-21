# Phase 3 Verification — Bulk Recovery and Final Verification

- **Track:** 20261021-translation-pipeline-reliability — Translation Pipeline Reliability
- **Phase:** 3 — Bulk Recovery and Final Verification
- **Date:** 2026-10-21
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Base commit:** `874fb23`
- **Head commit:** `b64a2fa`
- **Result:** `verified`

## Result

The reviews list view now offers one bulk action that recovers any selection
of failed/stale reviews: a sequential server-side bulk re-translate endpoint
(per-review outcomes, access rules enforced, one failure never aborts the
batch) plus an admin action component that drives it and reports the outcome
per review. The whole track passes integrated verification: typecheck, lint,
350 unit tests and the production build are green.

The root collection file `src/collections/Reviews.ts` was **not** modified.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` (`bun check`) | 0 | No type errors in 190 files |
| Lint (Biome, ERROR severity) | `bun run lint` (`biome check .`) | 0 | 0 errors, 0 warnings across 182 files |
| Unit tests | `bun test` | 0 | 350 pass / 0 fail across 29 files (738 `expect()` calls). Baseline before this phase was 327 pass / 26 files; this phase adds 23 tests in 3 new files. The `error:` log lines in the output are the expected error-path logs of the rate-limit, translate-batch and translation-lock suites — those tests all pass. |
| Full gate | `bun run typecheck && bun run lint && bun test` | 0 | All three green in one run (final verification) |
| Production build | `bun run build` (= `bun --bun next build --webpack`) | 0 | Build succeeded; the new route is registered as `ƒ /api/translation/bulk-retranslate`. The only warnings are the pre-existing `google-gax` "Can't resolve '../../package.json'" warnings that the baseline build already produced. |
| Pre-commit hook | `bun check` + `biome check .` + `bun test` | 0 | Ran on both task commits (husky), both green |

Command notes:

- The brief's literal `bun --bun next build` is rejected by this executor's
  shell sandbox (permission denied). The project's configured build script
  `bun run build` runs exactly `bun --bun next build --webpack` — the same
  command the PR-validation CI runs (`.github/workflows/ci.yml`, "Build"
  step) — so the production build was executed through that script.
- The production build did **not** regenerate `src/app/(payload)/admin/importMap.js`
  (the file was byte-identical afterwards): Payload only rewrites it when the
  Payload config is initialised at runtime (`payload/dist/index.js` → `generateImportMap`),
  which `next build` does not trigger. The entry for the new component was
  therefore added by hand in the generated style — Payload derives the import
  identifier as `exportName + "_" + md5(componentPath)`
  (`payload/dist/bin/generateImportMap/utilities/addPayloadComponentToImportMap.js`),
  and the algorithm was verified by reproducing the three existing entries'
  hashes exactly (`TranslationAttentionBell_4614064c…`,
  `RetranslateButton_8e2b4cee…`, `AnalyticsDashboard_d8816c4b…`) before adding
  `BulkRetranslateAction_708c1e8afd07e71504f16fd3ad23a526`. `bunx payload
  generate:importmap` and `bunx biome check --write` are not executable in
  this sandbox (permission denied); `bun run lint` (read-only Biome) passes on
  the hand-edited file, so it is already in the repository's format.
- `bun run test:e2e` was not run: the phase's verification command does not
  include it, the existing Playwright suite only covers public pages (no
  admin/translation flow), and `bunx playwright` is blocked in this sandbox.

## Acceptance criteria

Integrated sweep over the whole track (AC-1..AC-8). AC-1..AC-3 are Phase 2
surfaces, AC-5..AC-8 are Phase 1 pipeline behaviour, AC-4 is this phase.

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-1 | With an edit view open, a background pipeline completing transitions the visible status from `pending` to `translated` (or `failed`) without a manual refresh. | Phase 2: `src/components/admin/TranslationStatusPoller.tsx` polls `/api/reviews/{id}` on the 20 s interval while the visible status is `pending` and dispatches the new status into the form state; transition rules in the pure helper `src/components/admin/translation-poll.ts` (`resolveTranslationTransition`), unit-tested in `src/components/admin/__tests__/translation-poll.test.ts` (8 tests). Residual risk: UI wiring verified by logic tests + typecheck + reading — the repo has no DOM test renderer (same constraint Phase 2 recorded). | pass |
| AC-2 | A completed or failed background pipeline produces a toast reflecting the final status in the open edit view. | Phase 2: `resolveTranslationTransition` returns the success toast ("Translation completed") for `translated` and the truncated, already-actionable error toast for `failed`; `TranslationStatusPoller.tsx` renders it with Payload's `toast` API; tests in `src/components/admin/__tests__/translation-poll.test.ts`. Residual risk: toast rendering is not asserted in a DOM test (no renderer configured). | pass |
| AC-3 | The notification indicator count and list correctly include failed, stale and stuck-pending reviews, each entry links to its document; writers see only their own. | Phase 2: `src/components/admin/TranslationAttentionBell.tsx` polls the REST list endpoint with the `buildAttentionWhere()` clause; the predicate/threshold logic and the where-clause are pure helpers in `src/components/admin/translation-attention.ts`, unit-tested in `src/components/admin/__tests__/translation-attention.test.ts` (13 tests). Writers are scoped automatically by `Reviews.access.read` (read-only check of the root collection file — unchanged). | pass |
| AC-4 | Selecting multiple failed reviews in the list view and running the bulk action re-translates all of them (sequential), with a visible per-review outcome. | **This phase.** Endpoint: `src/app/(payload)/api/translation/bulk-retranslate/route.ts` (POST, session-cookie auth via `payload.auth({ headers })`, JSON body `{ ids }`), core in `src/lib/retranslate.ts` (`retranslateReviews` — `for…of` + `await`, i.e. sequential; `normalizeBulkRetranslateIds` validates/dedupes/caps at 50; `isBulkRetranslatableStatus` limits the action to `failed`/`stale`; per-review outcome `{ id, status: "translated" \| "failed" \| "skipped", reason?, translationStatus? }`; unauthorized targets resolved through `payload.findByID({ overrideAccess: false, user })` → skipped; a locked review → skipped; a per-review throw → failed without aborting the batch). UI: `src/components/admin/BulkRetranslateAction.tsx` (admin action, rendered on the reviews admin path) lists the failed/stale reviews, lets the author select several and posts the ids, then shows the summary and one line per review. Tests: `src/lib/__tests__/retranslate-bulk.test.ts` (9 pure selection tests: validation, dedupe, cap, status qualification), `src/lib/__tests__/retranslate-bulk-run.test.ts` (7 batch tests: translated outcomes, **sequential order** — the assertion fails for a parallel implementation, status skip, access-denied skip, already-running skip, failed outcome, one failure does not abort the batch), `src/components/admin/__tests__/bulk-retranslate.test.ts` (7 tests: candidate where-clause, outcome summary, per-review lines). Residual risk: the HTTP layer (cookie auth, JSON parsing, status codes) and the panel interaction are verified by typecheck + code reading, not by an integration/DOM test — no DOM renderer and no admin e2e flow exist in this repo. | pass |
| AC-5 | A simulated quota failure produces an actionable message (wait/retry guidance) in `translationError` with raw detail preserved; a simulated network failure produces its own distinct message. | Phase 1: `src/lib/translation-errors.ts` (`classifyTranslationError`, `formatTranslationError` → `"<actionable guidance> (raw: <detail>)"`), wired into the failure paths of `src/hooks/translateReview.ts`; tests in `src/lib/__tests__/translation-errors.test.ts` (quota vs network vs timeout vs credentials vs unknown). Unchanged by this phase — `bun test` still green. | pass |
| AC-6 | Two rapid consecutive saves that both qualify for translation result in exactly one pipeline run for the review. | Phase 1: `src/lib/translation-lock.ts` (Redis `SET NX PX` + in-memory fallback, compare-and-delete release) acquired/released around the pipeline body in `src/hooks/translateReview.ts`; tests in `src/lib/__tests__/translation-lock.test.ts` and `src/hooks/__tests__/translateReview.test.ts` ("second concurrent trigger while locked is a silent no-op"). This phase adds the read-only counterpart `isTranslationLocked()` so the bulk action can report a running review as skipped. | pass |
| AC-7 | A pipeline failing with a transient-classified error ends in `failed` only after the automatic delayed re-run has been attempted; a permanent-classified error fails immediately without the delayed re-run. | Phase 1: `scheduleTranslationRetry` in `src/hooks/translateReview.ts` (`TRANSLATION_RETRY_DELAY_MS = 3 min`, `isRetry` guard, timer `.unref()`); tests in `src/hooks/__tests__/translateReview.test.ts` (transient → exactly one delayed re-run then `failed`; credentials → immediate `failed`). Unchanged by this phase. | pass |
| AC-8 | After an English edit that leaves the translation behind (autoTranslate off), the review's status becomes `stale`, and a seeded legacy review with an older translation is backfilled to `stale`. | Phase 1: the autoTranslate-off branch of `decideTranslationAction` (translated + `translationUpdatedAt` + `isStale` → `mark-stale`), `shouldBackfillToStale` in `src/lib/translation-status.ts`, migration `src/migrations/20261021_120000_backfill_stale_translation_status.ts`; tests in `src/lib/__tests__/translation-status.test.ts`. Unchanged by this phase. | pass |

## Evidence paths

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-3.md` (this file)
- Endpoint: `src/app/(payload)/api/translation/bulk-retranslate/route.ts`, `src/lib/retranslate.ts`
- Lock helper: `src/lib/translation-lock.ts`
- UI: `src/components/admin/BulkRetranslateAction.tsx`, `src/components/admin/bulk-retranslate.ts`
- Registration: `src/payload.config.ts`, `src/app/(payload)/admin/importMap.js`
- Tests: `src/lib/__tests__/retranslate-bulk.test.ts`, `src/lib/__tests__/retranslate-bulk-run.test.ts`, `src/components/admin/__tests__/bulk-retranslate.test.ts`
- Phase commits: `6871d40` (P3.T1), `b64a2fa` (P3.T2)

## Deviations

`src/collections/Reviews.ts` was **not** touched — zero changes to the root
collection file. Three files outside the phase's `Touches` list were changed,
each for a reason the brief's own guidance requires:

1. `src/lib/translation-lock.ts` — added the read-only `isTranslationLocked(reviewId)`
   helper (Phase 1 file). The brief requires "a target already running reports
   as skipped with reason"; the lock state is encapsulated in that module
   (Redis + in-memory fallback), so the check could not be implemented
   honestly anywhere else without duplicating the lock logic. The helper is
   additive and does not change acquire/release behaviour.
2. `src/payload.config.ts` — one line: the new admin component registered in
   the root-level `admin.components.actions` slot (the same slot Phase 2 uses
   for the attention bell). Payload 3.90 offers no collection-level
   registration for a list-view bulk action that does not live in the root
   collection file; see Notes.
3. `src/app/(payload)/admin/importMap.js` — the generated import map entry for
   the new component, added by hand in the generated style (see the command
   notes for the verified identifier algorithm and why the generator could not
   be run in this sandbox).

Files created inside the brief's sanctioned areas: the custom route under
`src/app/(payload)/api/…` (explicitly offered by the brief for P3.T1.1) and
the admin component + pure helper under `src/components/admin/*` (the brief's
preferred placement for the bulk action UI).

## Notes

- **Endpoint placement.** The root `src/collections/Reviews.ts` is out of
  `Touches`, and Payload 3.90 has no separate "endpoints file" for a
  collection — collection endpoints live in the collection config object. The
  endpoint is therefore a Next.js route handler at
  `src/app/(payload)/api/translation/bulk-retranslate/route.ts`, which Next
  resolves ahead of Payload's `/api/[...slug]` catch-all (confirmed in the
  build output: `ƒ /api/translation/bulk-retranslate`). Authentication uses
  `payload.auth({ headers: request.headers })` — the same pattern as the
  existing `src/app/actions/moderation.ts` — so the admin's `payload-token`
  session cookie is honoured and an anonymous request gets 401.
- **Access enforcement.** Every selected id is resolved with
  `payload.findByID({ collection: "reviews", id, overrideAccess: false, user })`
  so the Reviews access rules apply (admin → all reviews, writer → only their
  own); an inaccessible target is reported as `skipped` with the reason
  "Review not found or not accessible". The single-review contract in
  `retranslateReview` (401/403/404 + ownership check + pipeline run with the
  autoTranslate toggle overridden) is reused unchanged per id, so the bulk
  action cannot drift from the per-review button.
- **CSRF.** The endpoint only accepts `application/json` bodies. A cross-site
  form post cannot set that content type without a CORS preflight, so the
  cookie-authenticated POST cannot be forged from another origin. The admin
  client sends the header explicitly.
- **Why not the admin list view's own row selection.** Payload 3.90 hardcodes
  the list-view bulk actions (`DeleteMany`, `EditMany`, `PublishMany`,
  `RestoreMany`, `UnpublishMany` in `@payloadcms/ui` `views/List/ListSelection`)
  and exposes no pluggable custom bulk-action slot. The supported way to add
  a component to the reviews list view is the collection's
  `admin.components.beforeList`/`afterList` — which lives in the root
  `src/collections/Reviews.ts` the brief forbids. The bulk action is
  therefore registered in the root-level `admin.components.actions` slot and
  renders only on the reviews admin path (`/admin/collections/reviews…`), so
  the author meets it exactly where the reviews are worked through. The
  candidate list it offers is the failed/stale reviews fetched from the REST
  list endpoint, which the Reviews read rule already scopes to the signed-in
  admin/writer — the same access scoping as the Phase 2 bell.
- **Sequential execution is asserted, not just documented.** The batch test
  records start/end events around the (awaited) pipeline call and expects
  `start:1, end:1, start:2, end:2`; a `Promise.all` implementation would
  interleave them and fail the test.
- **Per-review isolation.** Each id is handled in its own try/catch: a
  missing review, an inaccessible review, a review whose status needs no
  re-translate, a review whose pipeline is already running, and a review
  whose pipeline failed are all reported individually — the batch always
  continues.
- **Batch cap.** 50 ids per request (server: `BULK_RETRANSLATE_MAX_IDS`) and
  50 selectable rows (client: `BULK_RETRANSLATE_SELECTION_LIMIT`, mirrored
  constant with a comment pointing at the server cap).
- **Residual risk (NFR honesty).** AC-1..AC-4 are admin UI flows. The repo
  has no DOM test renderer and no admin e2e spec, so those criteria rest on
  pure-logic unit tests plus typecheck and code reading — the same limitation
  Phase 2 recorded. AC-5..AC-8 are logic-level pipeline behaviours covered by
  unit tests that were re-run green in this phase's gate.
- **Format/lint.** Biome's formatter is not writable in this sandbox
  (`bunx biome check --write` → permission denied), so the two formatting
  deviations Biome reported on the first lint run (a collapsed
  `Response.json` call and an import-name sort) were fixed by hand and the
  lint gate re-run clean.
