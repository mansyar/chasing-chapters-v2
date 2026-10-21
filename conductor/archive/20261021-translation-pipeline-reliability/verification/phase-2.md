# Phase 2 Verification — Author Feedback Surfaces

- **Track:** 20261021-translation-pipeline-reliability — Translation Pipeline Reliability
- **Phase:** 2 — Author Feedback Surfaces
- **Date:** 2026-10-21
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Base commit:** `fd514a0`
- **Head commit:** `36253c1`
- **Result:** `verified`

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` | 0 | 0 errors across 183 files |
| Lint (Biome, ERROR severity) | `bun run lint` | 0 | 0 errors, 0 warnings across 176 files |
| Unit tests | `bun test` | 0 | 327 pass, 0 fail (675 expect() calls, 26 files). New: `translation-poll.test.ts` (8 tests) and `translation-attention.test.ts` (13 tests). Pre-existing `error:` log lines in output are expected error-path logs from other suites (rate-limit, translate-batch, translation-lock); those tests all pass. |

Full chain `bun run typecheck && bun run lint && bun test` — exit 0. Also run ad-hoc
by the pre-commit hook on both task commits, both green.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-1 | While a review edit view is open with `translationStatus: pending`, the status is polled on a bounded interval (20s) and transitions are reflected in visible form state without manual refresh; polling stops when status leaves `pending`, on unmount, or on id change. | `src/components/admin/TranslationStatusPoller.tsx` (effect uses `TRANSLATION_POLL_INTERVAL_MS = 20_000` from `src/components/admin/translation-poll.ts`; reads form state via `useForm` getFieldsRef each tick and dispatches `UPDATE_MANY` patches via `buildStatusPatch`; aborts in-flight fetch and clears interval on unmount/id change); `bun test` — transition/patch logic unit-tested in `src/components/admin/__tests__/translation-poll.test.ts` | Pass |
| AC-2 | On observing the transition out of `pending`, a toast reflects the final status — success ("Translation completed") or failure using the classified `translationError` message truncated for the toast. | `src/components/admin/translation-poll.ts` — `resolveTranslationTransition` toasts `translated` → success "Translation completed" and `failed` → error toast with `truncateToastMessage` (140 chars max incl. ellipsis, fallback "Translation failed"); component wiring verified by typecheck + code reading (no DOM test renderer configured). Verified the toast choice: `@payloadcms/ui` exports the `toast` API (sonner 1.7.4 re-export, same instance the admin `ToastContainer` mounts — confirmed in `node_modules/@payloadcms/ui`), so Payload's own toast facility is used. | Pass |
| AC-3 | Admin-shell indicator lists every review needing attention — `failed`, `stale`, or `pending` older than 24h — with count badge, expandable list of review titles/statuses linked to `/admin/collections/reviews/{id}`, polling the REST list endpoint on the same 20s interval; REST where-clause and attention build are pure helpers. | `src/components/admin/TranslationAttentionBell.tsx` (bell icon + count badge, expandable panel, polls `/api/reviews?depth=0&limit=20&where=...` every 20s with `AbortController` cleanup, links via `buildReviewEditURL`); `src/components/admin/translation-attention.ts` (`willNeedAttention` predicate over status × threshold, `buildAttentionWhere` REST where-clause, `extractAttentionDocs`); `bun test` — `src/components/admin/__tests__/translation-attention.test.ts` covers every status × threshold combination, boundary at exactly 24h (24h exactly = NOT attention; strictly `>`), missing/invalid timestamps, custom threshold, where-clause deep-equality, and extraction. | Pass |

## Evidence paths

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-2.md` (this file)
- Tests: `src/components/admin/__tests__/translation-poll.test.ts`, `src/components/admin/__tests__/translation-attention.test.ts`
- Implementation: `src/components/admin/translation-poll.ts`, `src/components/admin/translation-attention.ts`, `src/components/admin/TranslationStatusPoller.tsx`, `src/components/admin/TranslationAttentionBell.tsx`, `src/collections/Reviews/admin/RetranslateButton.tsx`
- Registration: `src/payload.config.ts`, `src/app/(payload)/admin/importMap.js`
- Commits: `bcb3ad8` (P2.T1), `36253c1` (P2.T2 + P2.T3 evidence)

## Deviations

None. `src/collections/Reviews.ts` was **not** modified — zero changes to the root
collection file were needed. The brief's hard-block (custom endpoint) was avoided by
design: the poller reads the standard REST detail endpoint
(`/api/reviews/{id}?depth=0&locale=en`) and the bell reads the standard REST list
endpoint, both of which already carry `translationStatus`, `translationError`,
`translationUpdatedAt`, `updatedAt`, and the title field.

## Notes

- **Poller mount point:** there is no root-level `payload.config.ts` component slot
  that receives the document `Form` context — `DocumentInfoProvider`/`Form` mount
  inside `@payloadcms/next`'s Document view, which is per-collection, and
  `useForm()` returns `{}` outside that tree. The poller (which renders `null`) is
  therefore mounted inside the existing `RetranslateButton` — the `retranslateAction`
  sidebar ui-field component already inside Form context, and the component the
  brief explicitly identifies as the pattern source. This keeps registration changes
  out of `Reviews.ts` entirely.
- **Bell registration choice:** registered as a root-level `admin.components.actions`
  entry (`@/components/admin/TranslationAttentionBell#TranslationAttentionBell`), which
  places it in the top-right admin header — a dedicated slot that exists in Payload
  3.x and is preferable to the brief's provider/floating-bell fallback. Requires the
  import-map entry; `bunx payload generate:importmap` was not available in this
  executor's environment (permission-denied), so the entry
  `TranslationAttentionBell_6e6a0ba7a2d23dcf57d595ba4a1a06ad` was hand-added to
  `src/app/(payload)/admin/importMap.js` in the generated style. Payload rewrites the
  import map entirely on `next dev`/`next build`, so a full regen is safe and expected
  to preserve the mapping.
- **Stuck-pending timestamp field:** per the brief's analysis (verified against the
  Phase 1 pipeline), `pending` rows do not get `translationUpdatedAt` written, so the
  pending-attention predicate compares the document's `updatedAt` against the 24h
  threshold (strictly `>` — exactly 24h is not attention), while `failed`/`stale` need
  no timestamp.
- **Poll interval:** one exported constant `TRANSLATION_POLL_INTERVAL_MS = 20_000`
  (within the brief's 15–30s band), shared by the poller and the bell.
- **Access scoping:** `Reviews.access.read` was read to confirm the REST list applies
  scoping automatically — admin users see all reviews; `writer`-role users are scoped
  by an `author.id` equals Where. The bell therefore shows only what the viewing user
  is permitted to read, with no change to `Reviews.ts`.
- **Testing constraint:** the repo's `bun test` has no DOM test renderer; component
  wiring (effect ordering, dispatch calls, DOM placement) is verified by typecheck
  plus reading, per the brief. All transition/attention/where-clause logic lives in
  pure helpers and is unit-tested.
