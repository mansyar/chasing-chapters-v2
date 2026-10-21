## Summary

Translation failures were invisible and unrecoverable: a failed translation showed a raw
technical string in the admin, the status never refreshed on its own, and recovery meant
re-translating one review at a time by hand. This track makes the translation pipeline
observable and recoverable — failures carry an actionable message, the open edit view
reports the outcome live, a global indicator lists every review that needs attention, and a
bulk action recovers a whole backlog in one run. The pipeline itself is hardened: a
per-review lock, one automatic delayed re-run after a transient failure, a real `stale`
status, and a bounded bulk batch that always answers within the proxy's read timeout.

## Track

- **ID:** `20261021-translation-pipeline-reliability`
- **Type:** `feature`
- **Spec:** [`conductor/tracks/20261021-translation-pipeline-reliability/spec.md`](conductor/tracks/20261021-translation-pipeline-reliability/spec.md)
- **Plan:** [`conductor/tracks/20261021-translation-pipeline-reliability/plan.md`](conductor/tracks/20261021-translation-pipeline-reliability/plan.md)
- **Review:** [`conductor/tracks/20261021-translation-pipeline-reliability/review.md`](conductor/tracks/20261021-translation-pipeline-reliability/review.md)

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Pipeline Hardening | Actionable error classes, a per-review lock, one delayed re-run, a real `stale` status | verified | `5a3dab7` | New `translation-errors.ts` / `translation-lock.ts`; a backfill migration was later dropped (never applied) |
| 2: Author Feedback Surfaces | Live status + toast in the edit view, a global attention indicator | verified | `16a8a73` | Pure helpers in `translation-poll.ts` / `translation-attention.ts` |
| 3: Bulk Recovery | A bulk re-translate endpoint and the admin action that drives it | verified | `a319338` | Registered through `admin.components.actions` — Payload 3.90 hardcodes list-view bulk actions |
| R1: Review fixes (1) | Fix the stale-status model, the retry snapshot, the inert poller, the untested lock helper, the unbounded batch | verified | `8646729` | Introduced the `englishUpdatedAt` field and its migration |
| R2: Review fixes (2) | Fix the admin-save deadlock, bound the in-flight bulk work, close the TOCTOU window | verified | `281e0fc` | The English change time moved into a `beforeChange` hook — one write, one transaction |
| R3: Review fixes (3) | Keep a provider failure a provider failure; cover the guard's not-found branch | verified | `2290560` | A quota failure at the deadline is still a quota failure |

## Requirements

- [x] `FR-1` — The edit view's translation status refreshes automatically (test: `src/components/admin/__tests__/translation-poll.test.ts`)
- [x] `FR-2` — A finished pipeline raises a success/failure toast (test: `src/components/admin/__tests__/translation-poll.test.ts`)
- [x] `FR-3` — A global indicator counts and lists the reviews that need attention (test: `src/components/admin/__tests__/translation-attention.test.ts`)
- [x] `FR-4` — A bulk action re-translates a selection of failed/stale reviews under a wall-clock budget, each reporting its own outcome (test: `src/lib/__tests__/retranslate-bulk-run.test.ts`)
- [x] `FR-5` — `translationError` carries an actionable message plus the raw detail (test: `src/lib/__tests__/translation-errors.test.ts`)
- [x] `FR-6` — A per-review lock makes a concurrent trigger a no-op (test: `src/lib/__tests__/translation-lock.test.ts`)
- [x] `FR-7` — A transient failure is re-run once automatically before `failed` is recorded (test: `src/hooks/__tests__/translateReview.test.ts`)
- [x] `FR-8` — Staleness compares the English content's change time with the stored translation (test: `src/hooks/__tests__/translateReview.test.ts`)
- [x] `NFR-1` — The public site is unchanged (no rendered output, route or revalidation change)
- [x] `NFR-2` — Typecheck, lint and the unit suite stay green
- [x] `NFR-3` — No secrets; the polling and bulk endpoints honour the existing access rules
- [x] `NFR-4` — Bounded queries, a 20 s poll interval, a capped attention list

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| unit | `bun test` | pass | 393 pass / 0 fail, 29 files — `conductor/tracks/20261021-translation-pipeline-reliability/verification/integrated.md` |
| coverage | `bun test --coverage` | pass | 91.83% functions / 92.35% lines (gate 80) |
| lint | `bun run lint` | pass | 182 files, 0 errors |
| typecheck | `bun run typecheck` | pass | 0 errors, 190 files |
| build | `bun run build` | pass | Production build green |
| e2e | `bun run test:e2e` | fail — pre-existing | The same failures reproduce on the base commit `6d6e7b9`; see `review.md` |

## Review

- **Verdict:** `PASS`
- **Rounds:** 3
- **Fixed:** 17 findings (2 High, 5 Medium, 7 Low, plus the round-2 and round-3 additions)
- **Accepted/deferred:** 0 — one item remains recorded as debt (no DOM/admin e2e harness)

## Deviations and risks

- The bulk action is registered as an admin panel component rather than a Payload list-view
  bulk action: Payload 3.90 hardcodes the list-view bulk action set, and the only list
  injection point is the root `src/collections/Reviews.ts`. The spec and plan were amended
  to describe the delivered surface.
- The new migration (`20261021_140330_add_english_updated_at`) adds `english_updated_at` to
  `reviews` and `_reviews_v`. It is applied by CI and by the deploy pipeline; a local
  database that predates it must be migrated before the app starts.
- Reviews that pre-date the `englishUpdatedAt` field are **not** backfilled — they keep
  their current status rather than being flipped to `stale` on a guess.
- The automatic re-run after a transient failure is scheduled in-process (`setTimeout`), so
  it does not survive a redeploy. A durable queue is out of scope for this track.
- The bulk batch is bounded to 50 reviews per run and to a 30 s budget; a larger backlog
  needs more than one run.

## Follow-ups

- A DOM/admin e2e harness would close the last verification gap (recorded as debt in
  `review.md`; the e2e layer is currently unusable in this environment).
- A durable job queue for the delayed re-run, if the in-process timer proves too fragile.
- A translation-health view over time (failure rate per cause) — not needed for recovery,
  but useful for spotting a broken quota.

## Rollback

```bash
# Merge commit
git revert --no-edit -m 1 <merge-commit>

# Squash commit
git revert --no-edit <squash-commit>
```

The migration can be rolled back on its own with
`bunx payload migrate` after restoring `src/migrations/20261021_140330_add_english_updated_at.ts`'s
`down` migration (it drops `english_updated_at` and `version_english_updated_at`). The
`english_updated_at` data is only a staleness signal — dropping it leaves every review in
its current status, and nothing else depends on it. The bulk endpoint and the admin
components can be removed independently; no persisted schema depends on them.
