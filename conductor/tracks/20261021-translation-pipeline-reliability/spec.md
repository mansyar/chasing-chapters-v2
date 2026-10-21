# Translation Pipeline Reliability — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

This track makes the EN → ID review translation pipeline observable, resilient,
and recoverable from the author's point of view. Today the pipeline runs
fire-and-forget after publish: failures are silent, recovery is one review at a
time, error text is raw technical output, and the built-in staleness detection
is dead code. The track adds live status feedback in the edit view, a global
notification surface for translation problems, bulk re-translation from the
list view, author-actionable error messages backed by real error
classification, an automatic delayed pipeline re-run for transient failures, a
per-review concurrency lock, and real stale-status semantics.

## Problem / Motivation

The author publishes a review and the translation pipeline runs in the
background with no feedback. Failures (which recur — both visible failures in
the admin and silent English fallbacks on Indonesian pages) are discovered
only by accident, sometimes long after publishing. When discovered, each
failed review must be opened individually and re-translated by hand, and the
stored error message ("Translation failed after 3 attempts: …") does not tell
the author what to do next. Left unsolved, the author loses trust in the
bilingual feature — the site's core differentiator — and Indonesian readers
silently read English fallback content.

## Goals & Success Metrics

- **Goal:** A zero-hunt author workflow — every translation failure surfaces
  in the admin within about a minute, every failed or stale review is one
  click from recovery, and every error message says what to do next.
- **Metric:** No failure state requires opening a review to discover; no
  recovery requires more than one click (or one bulk action); transient
  failures recover automatically without author involvement.

## Scope

### In Scope

- Live translation-status feedback in the review edit view (polling while the
  document is open, so "pending → translated" appears without a refresh, plus
  a success/failure toast on completion).
- A global admin notification indicator (bell) listing reviews whose
  translation needs attention: `failed`, `stale`, and reviews stuck in
  `pending` beyond a threshold; each entry links to the review document.
- An admin bulk action on the reviews admin path to re-translate selected
  failed/stale reviews (Payload 3.90 hardcodes list-view bulk actions; the
  action is offered where the reviews are worked through).
- Error classification: map underlying causes (Google API quota, network
  unreachability, timeout, invalid credentials, unexpected) to
  author-actionable messages, alongside the preserved raw detail.
- Per-review pipeline lock so concurrent saves cannot race two parallel
  translation pipelines for the same review.
- One automatic delayed re-run of the full pipeline after transient failure
  (single re-run after a few minutes) before the status becomes `failed`.
- Real stale-status semantics: staleness is decided by the English content's
  change time (`englishUpdatedAt`, recorded when the English rich text
  changes) against the translation's time (`translationUpdatedAt`) — not by
  the document's modification time, which Payload restamps on every write.
  The transition map already permits `translated → stale` and
  `stale → pending/translated`; reviews predating the English-change
  timestamp are not backfilled.
- Tooling for both roles: admins see/fix all reviews, writers the same UX
  scoped to their own reviews (existing Payload access rules apply).

### Out of Scope

- Reader-facing notices on public Indonesian pages (separate track).
- Translating content types other than Reviews (comments, genres/tags/moods,
  reading lists).
- Changing the translation provider or adding locales beyond EN/ID.
- Automatic scheduled re-runs beyond the single delayed re-run.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | While a review document is open in the admin edit view, the displayed translation status refreshes automatically (polling) so a background pipeline's `pending → translated/failed` transition becomes visible without a manual refresh. | must |
| FR-2 | When a background pipeline finishes, the author sees a success or failure toast in the open edit view reflecting the final status. | must |
| FR-3 | The admin shell shows a global notification indicator with the count of reviews whose translation needs attention (`failed`, `stale`, or `pending` older than 24 hours); opening it lists those reviews with links to their documents. | must |
| FR-4 | An admin action on the reviews admin path re-translates a selection of reviews whose status is `failed` or `stale`, running the existing pipeline sequentially server-side under a wall-clock budget; every selected review reports its own outcome (including reviews not attempted because the budget was reached). | must |
| FR-5 | `translationError` distinguishes an author-actionable message (classified cause with next-step guidance) from the preserved raw technical detail. | must |
| FR-6 | A per-review lock prevents two concurrent translation pipelines from running for the same review; a second trigger while one is active is a no-op (not an error). | must |
| FR-7 | After a pipeline run fails with a transient-classified error, the system automatically re-runs the pipeline once after a delay (a few minutes) before recording `failed`. | should |
| FR-8 | Staleness is a real status: when the English **content's** change time (`englishUpdatedAt`, recorded when the English rich text changes) is newer than the stored translation (`translationUpdatedAt`), the review's status becomes `stale`. The document's modification time is not a staleness signal — Payload restamps it on every write, including the pipeline's own translation write. Reviews whose English-change time was never recorded (pre-dating the field) are not backfilled and keep their current status. | should |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Public site behavior is unchanged: no changes to rendered output, routes, or ISR/revalidation semantics. |
| NFR-2 | All existing checks stay green: typecheck 0 errors, lint 0 errors/warnings (error severities), all unit tests pass. |
| NFR-3 | No secrets in code; polling endpoints honor existing auth/access rules (writers see only their own reviews). |
| NFR-4 | Polling and the notification indicator must not degrade admin performance: bounded query size, reasonable interval, no unbounded growth. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | With an edit view open, a background pipeline completing transitions the visible status from `pending` to `translated` (or `failed`) without a manual refresh. | FR-1 |
| AC-2 | A completed or failed background pipeline produces a toast reflecting the final status in the open edit view. | FR-2 |
| AC-3 | The notification indicator count and list correctly include failed, stale, and stuck-pending reviews, and each entry links to its document; writers see only their own. | FR-3 |
| AC-4 | Selecting multiple failed or stale reviews in the admin bulk action and running it re-translates them (sequential, bounded by a wall-clock budget), with a visible per-review outcome; reviews not attempted because the budget was reached are reported as skipped with a reason. | FR-4 |
| AC-5 | A simulated quota failure produces an actionable message (wait/retry guidance) in `translationError` with raw detail preserved; a simulated network failure produces its own distinct message. | FR-5 |
| AC-6 | Two rapid consecutive saves that both qualify for translation result in exactly one pipeline run for the review. | FR-6 |
| AC-7 | A pipeline failing with a transient-classified error ends in `failed` only after the automatic delayed re-run has been attempted; a permanent-classified error (e.g. invalid credentials) fails immediately without the delayed re-run. | FR-7 |
| AC-8 | After an English edit that leaves the translation behind (autoTranslate off), the review's status becomes `stale`; the staleness comparison uses the English content's change time rather than the document's modification time, so a freshly translated review is never reported as stale, and reviews predating the English-change timestamp are not backfilled. | FR-8 |

## Edge Cases

- Two rapid saves: the lock makes the second pipeline trigger a no-op; the
  first run translates the latest content it reads at run time.
- Process death mid-pipeline: a review can be stuck in `pending`; the
  notification indicator treats `pending` older than 24 hours as needing
  attention, and the per-review Re-translate button remains available.
- Bulk re-translation of a large selection: sequential execution to respect
  Google rate limits; per-review outcomes are reported individually and one
  failure does not abort the batch.
- Redis unavailable: translation cache misses degrade gracefully (existing
  behavior); the pipeline still runs.
- Writers' access: list, edit, and bulk operations only ever touch the
  writer's own reviews (existing access rules; new endpoints must enforce the
  same).
- Stale backfill must not touch reviews whose status is `pending`, `failed`,
  or `untranslated`.
- Invalid credentials: classified permanent — immediate `failed` with
  credential-fix guidance, no automatic re-run.

## Dependencies

- **Tracks:** none (PR Validation CI is merged; strict lint gate active).
- **External:** Google Cloud Translation API (existing credentials); Redis
  (existing, optional as today).

## Open Questions & Assumptions

- **Assumption:** Poll interval for the edit view and bell is ~15–30 seconds
  (tunable constant); exact value is an implementation detail.
- **Assumption:** "Pending older than 24 hours" is the stuck threshold for
  FR-3; it is configurable but not user-facing.
- **Assumption:** The single delayed re-run waits ~2–5 minutes; exact delay is
  an implementation detail.
- **Question:** Where should the delayed re-run be scheduled (in-process
  timer vs Redis-backed marker reconciled on activity)? Decided during
  planning; both satisfy FR-7.

## References

- `conductor/workflow.md` (verification strategy, workflow config)
- `conductor/code_styleguides/typescript.md`, `general.md`
- `src/hooks/translateReview.ts`, `src/lib/translate.ts`,
  `src/lib/retranslate.ts`, `src/lib/translation-status.ts`,
  `src/lib/redis.ts`, `src/collections/Reviews.ts`,
  `src/collections/Reviews/admin/RetranslateButton.tsx`
- Baseline analysis: 2026-10-21 codebase review session (this track's origin).
