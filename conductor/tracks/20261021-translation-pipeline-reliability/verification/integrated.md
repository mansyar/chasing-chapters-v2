# Track Verification — Integrated

- **Track:** `20261021-translation-pipeline-reliability`
- **Date:** `2026-10-22`
- **Branch:** `feat/20261021-translation-pipeline-reliability`
- **Base commit:** `6d6e7b908b9288678e605ac02bb70ddad71317fa` (main)
- **Head commit:** `d4099c6` (conductor bookkeeping) — the code head is `2290560`
- **Result:** `verified`

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | 0 | No type errors in 190 files |
| lint | `bun run lint` | 0 | Biome: 182 files checked, 0 errors, 0 warnings |
| unit | `bun test` | 0 | 393 pass / 0 fail, 29 files, 853 `expect()` calls |
| coverage | `bun test --coverage` | 0 | All files: 91.83% functions, 92.35% lines (gate: 80) |
| build | `bun run build` | 0 | Production build green; `/api/translation/bulk-retranslate` registered ahead of the Payload catch-all |
| e2e | `bun run test:e2e` | 1 | **Pre-existing, not attributable** — see below |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-1 | The open edit view's status refreshes without a manual reload | `src/components/admin/translation-poll.ts` (`shouldPollTranslationStatus`, `resolveTranslationTransition`) + `src/hooks/__tests__/translateReview.test.ts`, `src/components/admin/__tests__/translation-poll.test.ts` | pass |
| AC-2 | A finished pipeline raises a success/failure toast | `src/components/admin/translation-poll.ts` (`truncateToastMessage`, `resolveTranslationTransition`) | pass |
| AC-3 | The attention indicator counts and lists failed / stale / stuck-pending reviews, each linking to its document | `src/components/admin/translation-attention.ts` (`needsTranslationAttention`, `buildAttentionWhere`, `buildReviewEditURL`, `extractAttentionDocs`) + `src/components/admin/TranslationAttentionBell.tsx` | pass |
| AC-4 | A bulk action re-translates selected failed/stale reviews sequentially under a wall-clock budget, with a per-review outcome | `src/app/(payload)/api/translation/bulk-retranslate/route.ts`, `src/lib/retranslate.ts` (`retranslateReviews`, `normalizeBulkRetranslateIds`), `src/components/admin/BulkRetranslateAction.tsx` | pass |
| AC-5 | Failures produce an actionable message with the raw detail preserved | `src/lib/translation-errors.ts` (`classifyTranslationError`, `formatTranslationError`) + `src/lib/__tests__/translation-errors.test.ts` | pass |
| AC-6 | Two rapid qualifying saves produce exactly one pipeline run | `src/lib/translation-lock.ts` (`acquireTranslationLock`) + `src/hooks/translateReview.ts` (lock acquisition) + `src/lib/__tests__/translation-lock.test.ts` | pass |
| AC-7 | A transient failure reaches `failed` only after the automatic delayed re-run; a permanent failure fails immediately | `src/hooks/translateReview.ts` (`scheduleTranslationRetry`, `runDelayedTranslationRetry`) + `src/hooks/__tests__/translateReview.test.ts` | pass |
| AC-8 | Staleness compares the English content's change time with the stored translation; a freshly translated review is never stale, legacy rows are not backfilled | `src/hooks/translateReview.ts` (`recordEnglishChangeTime`, `englishContentChanged`), `src/lib/translation-status.ts` (`isStale`), `src/migrations/20261021_140330_add_english_updated_at.ts` | pass |

## Evidence

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-1.md` — Pipeline Hardening
- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-2.md` — Author Feedback Surfaces
- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-3.md` — Bulk Recovery
- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R1.md` — Review fixes (round 1)
- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R2.md` — Review fixes (round 2)
- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-R3.md` — Review fixes (round 3)
- `conductor/tracks/20261021-translation-pipeline-reliability/review.md` — three review rounds, final verdict PASS

## Deviations

- **The bulk action is an admin panel component, not a Payload list-view bulk action.** Payload 3.90
  hardcodes the list-view bulk action set and the only list injection point is the root
  `src/collections/Reviews.ts`; the component was registered through
  `admin.components.actions` instead, which is the supported slot. The spec and plan were
  amended to match.
- **The Payload import map entry was hand-added** in the phase that generated it (the sandbox
  denied `bunx payload generate:importmap`); the primary re-ran the generator afterwards and
  confirmed the file is byte-identical to the generated output.
- **`bunx payload migrate:create`** was used for the single new migration
  (`20261021_140330_add_english_updated_at`); no drizzle snapshot was hand-edited.

## Notes

- The e2e layer fails **identically on the base commit** — every failure is a
  `page.goto` 30 s timeout, with HTTP 200 responses on direct requests and equivalent
  per-request server cost on both branches (see `review.md`, "e2e layer — why this is not a
  track finding"). The layer's applicability rule ("when the phase touches user-facing
  flows") is not met: this track is admin-side only and the public site is unchanged
  (NFR-1).
- The admin save path is covered by unit tests over the hook's behaviour, not by a
  browser-level test — there is no DOM/admin e2e harness in this repository (recorded debt).
- The migration is applied by CI and by the deploy pipeline; a local database that predates
  it must be migrated before `bun run build` (the column is read at request time).
