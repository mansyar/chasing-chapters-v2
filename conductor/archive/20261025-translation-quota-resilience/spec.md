# Translation Quota Resilience - Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

The translation pipeline has no accounting for the character quota Google
enforces, so bursts of requests saturate a per-100-second budget and every
attempt - including all retries - fails inside the same window. This track gives
the pipeline a rolling character budget, packs requests by character count
instead of string count, stops retrying an error class that cannot succeed on
retry, and makes quota failures legible in logs and in the admin bell.

## Problem / Motivation

On 2026-10-25 at 07:51:50 production logged `403 User Rate Limit Exceeded`
(`reason: userRateLimitExceeded`) for a batch of 64 texts, and **all three
attempts failed**. The affected review was left at `translationStatus: failed`,
so the Indonesian site serves English content for it.

Cloud Translation v2 (Basic) - which this codebase uses via `new v2.Translate()`
- enforces a legacy **per-user quota of 100,000 characters per 100 seconds**
(default; maximum 10,000,000). The console's per-minute and per-user rows showed
no saturation and no spike at minute granularity, which is consistent with a
100-second window having drained before inspection. The console surfaces these
as `V2 and v3 Characters per 100 seconds` and `... per user` rows, separate from
every per-minute row.

Three things consume that budget with no bound:

1. `TRANSLATION_BATCH_SIZE = 64` bounds **string count**, not characters. 64
   rich-text nodes at ~400 characters each is ~25,000 characters in one request
   - 5x Google's 5K recommendation.
2. `translateReview.ts` translates favorite quotes with `Promise.all`, firing N
   simultaneous single-text requests per review, bypassing the batcher entirely.
3. `retranslate.ts` bounds bulk runs by a 30-second wall clock and 50 reviews -
   no character limit. 50 reviews x several thousand characters in 30 seconds is
   5-10x the ceiling.

Worse, the retry ladder guarantees failure: `RETRY_DELAYS_MS = [2000, 8000,
30000]` with `MAX_ATTEMPTS = 3` yields only two backoffs (2s, 8s) - **`30000` is
never read**, despite a comment claiming "~2s -> ~8s -> ~30s". All three attempts
land at t=0, t=2s, t=10s, inside the same 100-second window, so each retry
spends more of an already-exhausted budget.

If unsolved: every future bulk run and every burst of publishing reproduces the
incident, each occurrence leaves reviews permanently untranslated until manually
recovered, and diagnosis stays impossible because `console.error(message, error)`
prints a `Gunzip` stream dump rather than the error body.

## Goals & Success Metrics

- **Goal:** A translation run can never exceed the character quota without the
  pipeline pacing itself first.
- **Metric:** Zero `userRateLimitExceeded` 403s in production logs over 30 days
  following the fix, including during a 50-review bulk retranslate.
- **Goal:** A quota failure costs exactly one API attempt, not three.
- **Metric:** Unit test asserts one provider call on a mocked 403 (currently
  three).
- **Goal:** Quota failures are identifiable from logs alone.
- **Metric:** A quota failure emits `code`, `reason`, and character count as
  structured fields, with no `Gunzip`/stream dump.

## Scope

### In Scope

- Rolling 100-second character budget enforced before every provider request.
- Character-based batch packing (~5K target, hard cap well under 30K).
- Quota errors classified as non-retryable.
- Favorite quotes translated in a single batched call.
- Bulk retranslate consuming the shared budget alongside its existing wall clock.
- Structured failure logging.
- Quota failures distinguished from other failures in the admin attention bell.
- Pipeline-run failures captured rather than becoming unhandled rejections.
- Translation lock TTL sized to exceed the worst-case run.
- `markTranslationStale` restricted to legal status transitions.

### Out of Scope

- Migrating from Cloud Translation v2 to v3.
- Changing the translation cache key scheme or TTL (30 days).
- Re-translating content already stored in Indonesian.
- A new admin UI for quota status beyond distinguishing the failure kind.
- Reworking the `translationStatus` state machine itself.
- Google console quota configuration as an automated step - the increase to
  10,000,000 is a documented manual operational action, not code.
- Adding a recovery script or bell click-action; existing bulk retranslate
  recovers stuck reviews.

## Bug Details

- **Reproduction steps:**
  1. Publish several reviews in quick succession, or run bulk retranslate across
     ~50 reviews.
  2. Total characters sent within a 100-second window exceed 100,000.
  3. Google returns `403` with `errors[0].reason: "userRateLimitExceeded"`.
  4. `translateChunkWithRetry` retries at t+2s and t+10s - inside the same
     window - and fails again.
  5. After 3 attempts it throws `TranslationError`; the pipeline classifies it as
     `quota` (transient) and writes `translationStatus: "failed"`.
  6. One delayed automatic re-run fires and fails the same way.
  7. The review stays untranslated; the Indonesian site serves English for it.
- **Expected behavior:** The pipeline paces itself to stay within the character
  quota; a quota response is not retried; the failure is logged with structured
  fields identifying it as quota.
- **Actual behavior:** The pipeline sends unbounded characters, retries three
  times inside the exhausted window, and logs an unreadable stream dump.
- **Root-cause hypothesis:** No character accounting exists anywhere in
  `src/lib/translate.ts` (verified: no rolling window, no character budget, no
  pacing - only a string-count cap and a wall clock). Three burst sources feed
  one 100-second budget, and the retry policy compounds it.
- **Regression test:** A unit test with a mocked client returning `403
  userRateLimitExceeded` and an injected clock. It must fail before the fix
  (observing three provider calls) and pass after (observing one), and must
  additionally assert the budget blocks the next call until the window rolls
  forward.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Requests are packed by character count, targeting ~5,000 code points and never exceeding a hard cap below 30,000. | must |
| FR-2 | A rolling 100-second character budget is checked before every provider request; a request that would exceed it does not start. | must |
| FR-3 | The budget limit is configurable via environment variable, defaulting to 100,000 characters per 100 seconds. | must |
| FR-4 | The budget is backed by Redis, with an in-process Map fallback when Redis is unavailable, mirroring `translation-lock.ts`. | must |
| FR-5 | A `403` whose message matches the rate-limit pattern is classified as quota and is **not** retried; it is reported as a single-attempt failure. | must |
| FR-6 | Favorite quotes are translated in one batched call rather than one call per quote. | must |
| FR-7 | Bulk retranslate consumes the shared budget; whichever limit (characters or wall clock) is reached first stops the run and reports remaining reviews as skipped. | must |
| FR-8 | Translation failures log `code`, `errors[0].reason`, character count, text count, attempt number, and remaining budget as structured fields, without passing the raw error object to the logger. | must |
| FR-9 | The admin attention bell distinguishes quota failures from other failure kinds. | should |
| FR-10 | A pipeline run that fails after the response is sent is logged with its classified kind and does not surface as an unhandled rejection. | must |
| FR-11 | The translation lock TTL exceeds the maximum possible run duration, derived from the retry policy and timeout constants rather than a fixed 10 minutes. | must |
| FR-12 | `markTranslationStale` writes `stale` only from a status where that transition is legal, leaving other statuses unchanged. | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Budget accounting is O(1) per request - one Redis read and one write - and adds no measurable latency to a translation run. |
| NFR-2 | Budget enforcement never deadlocks: a blocked request is deferred or skipped within a bounded time, never waited on indefinitely. |
| NFR-3 | A budget or Redis failure must never prevent a review from saving; the save path stays independent of translation. |
| NFR-4 | All new logic is unit-testable with an injected clock and no real sleeps; existing translation tests continue to pass unchanged. |
| NFR-5 | No database migration and no change to stored documents; existing reviews and statuses remain valid. |
| NFR-6 | Cache hits consume no budget, since they send no characters. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | A batch whose texts total more than 5,000 code points is split into multiple requests, each under the cap. | FR-1 |
| AC-2 | A request that would push the window past the configured limit does not reach the provider until the window rolls forward. | FR-2 |
| AC-3 | Setting the budget env var to 10,000,000 changes the enforced limit without a code change. | FR-3 |
| AC-4 | With Redis absent, budget enforcement still applies via the in-process fallback. | FR-4 |
| AC-5 | A mocked `403 userRateLimitExceeded` produces exactly one provider call and a `failed` status carrying the quota message. | FR-5 |
| AC-6 | A review with N favorite quotes issues one provider call for the quotes, not N. | FR-6 |
| AC-7 | A bulk run stops at the character budget and reports the remaining reviews as skipped rather than failing them. | FR-7 |
| AC-8 | A quota failure's log line contains `code`, `reason`, and character count, and contains no `Gunzip` or `_readableState` text. | FR-8 |
| AC-9 | The bell's failure breakdown separates quota failures from network, timeout, and unexpected failures. | FR-9 |
| AC-10 | A pipeline run that throws after the response is sent produces one classified log entry and no unhandled-rejection warning. | FR-10 |
| AC-11 | The computed lock TTL is greater than the worst-case run duration derived from the retry and timeout constants. | FR-11 |
| AC-12 | Calling `markTranslationStale` on an `untranslated` review leaves its status unchanged and logs no validator error. | FR-12 |

## Edge Cases

- **A single text exceeds the character cap** - it cannot be split; send it alone
  in its own request and let the budget decide whether it may start.
- **The budget is smaller than one text** - the request is deferred rather than
  looping forever; the run fails with a clear quota message.
- **Redis unavailable** - in-process fallback applies; per-instance pacing only,
  which is sufficient for the current single-instance deployment.
- **All texts are cache hits** - no budget is consumed and no provider call is
  made.
- **Empty quotes array or all-blank quotes** - no provider call is issued for
  that field.
- **A `403` whose message does not match the rate-limit pattern** - classified as
  `credentials` (existing behaviour) and remains non-retryable.
- **Concurrent pipeline runs for different reviews** - the existing lock still
  serializes them; the budget is shared across both.
- **The Google quota is raised to 10,000,000** - the configured budget must be
  raised to match, or pacing stays 100x too conservative.
- **Bulk run where the wall clock expires before the character budget** - reported
  as skipped with the existing budget reason, unchanged.
- **A transient network error mid-batch** - still retried per the existing policy;
  only quota is excluded from retry.

## Dependencies

- **Tracks:** none.
- **External:** Google Cloud Translation API v2 (Basic); Redis; Google Cloud
  console access for the manual quota increase.

## Open Questions & Assumptions

- **Assumption:** The 100-second per-user character quota is the limiting
  dimension. Evidence: a `403` with `reason: userRateLimitExceeded`, no saturation
  on the per-minute or per-user rows, and no spike at minute granularity. It
  could not be confirmed directly because the 100-second rows were not inspected
  during the incident window and the window had drained before inspection.
- **Assumption:** Production runs a single application instance, so an in-process
  budget fallback is adequate when Redis is absent. If multi-instance scaling is
  added, the fallback becomes advisory only.
- **Assumption:** The console quota increase from 100,000 to 10,000,000 characters
  per 100 seconds is available at no cost on the current billing tier.
- **Assumption:** Deferring to the existing delayed re-run is sufficient recovery
  for a quota failure; no additional retry tier is needed.

## References

- Production log, 2026-10-25 07:51:50 - `403 User Rate Limit Exceeded`, batch of
  64, three attempts failed.
- Cloud Translation quotas: https://docs.cloud.google.com/translate/quotas
- Cloud Translation release notes (100-second quota defaults and maximums):
  https://docs.cloud.google.com/translate/docs/release-notes
- `src/lib/translate.ts`, `src/hooks/translateReview.ts`, `src/lib/retranslate.ts`,
  `src/lib/translation-errors.ts`, `src/lib/translation-lock.ts`,
  `src/lib/translation-status.ts`
