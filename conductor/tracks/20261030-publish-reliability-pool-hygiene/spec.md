# Publish Reliability & Pool Hygiene — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

A review can be saved as published and still never appear on the public site.
The write's `afterChange` chain performs database reads and cache invalidation
**inside the write transaction**, so a starved connection pool turns a healthy
publish into a rollback — or into a public page that cannot render. This track
moves all invalidations past the commit point, makes them incapable of failing a
write, removes a redundant database round-trip from every public slug lookup,
and makes the connection pool a configured, observable resource instead of a
hard-coded guess.

## Problem / Motivation

On 2026-10-28 the author published two reviews from the admin panel and received
a success toast. Neither review became publicly readable. The production log
shows Payload's internal `select count(*)` for the public review-page lookup
failing with `timeout exceeded when trying to connect`:

```
select count(*) from "reviews"
where ("reviews"."slug" = $1 and ("reviews"."_status" = $2
       and ("reviews"."publish_at" is null or "reviews"."publish_at" <= $3)))
params: how-to-own-the-room, published, 2026-10-28T00:00:14.441Z
[cause]: Error: timeout exceeded when trying to connect
```

The same message is produced by a different query (`publish_date`/`slug`
neighbour lookup) when the pool is constrained, and in that case the publish
itself rolls back. Both failures are the same defect class: **cache invalidation
and auxiliary reads are on the write's critical path**.

Who feels it:

- **The author** — a publish silently does not happen, with no actionable signal
  beyond a global site error.
- **Readers** — review detail pages and their Open Graph images can 500 while the
  pool is saturated.
- **Whoever is on call** — there is no pool telemetry, so the failure is only
  visible as a database timeout in application logs.

If it is not fixed, every publish remains exposed to the busiest moment the app
has (admin write + ISR regeneration + translation pipeline + public traffic),
and the failure mode is silent by construction.

## Goals & Success Metrics

- **Goal:** a publish commits and stays committed regardless of what the
  revalidation, neighbour lookup, translation pipeline or public read path does.
- **Metric:** with the pool constrained to 2 connections, publishing a review
  leaves it `published` and publicly readable; the regression test that
  demonstrates this fails on `main` and passes on the branch.
- **Metric:** a public review slug lookup issues no `count(*)`; publish-path
  database round-trips inside the transaction drop from ≥3 to 1 (the write).

## Scope

### In Scope

- Defer every `revalidatePath` call and the neighbour lookup to after the write
  transaction commits.
- Make the neighbour lookup best-effort: classified log on failure, never a
  thrown hook.
- Remove the `count(*)` round-trip from single-document slug lookups (review
  page, Open Graph image, preview entry).
- Make pool size, minimum and acquire timeout environment-driven with documented
  defaults; log slow connection acquisition with structured fields.
- Record a distinct signal when a save leaves a document published but not
  publicly visible (e.g. a future `publishAt`), and verify the public gate after
  the publish response is sent.
- Reproduce the production failure as a regression test that fails first.

### Out of Scope

- Admin publish UX: Schedule vs Publish affordance, pre-publish checklist,
  post-publish "open live page" confirmation.
- A runbook or admin-guide section for this incident.
- A `/api/health` endpoint or a general metrics surface.
- Changing the visibility rule itself (`publish-visibility.ts`), the translation
  pipeline's contract, or the ISR windows.
- Reworking unrelated hooks, collections, or the e2e harness.

## Bug Details

- **Reproduction steps:**
  1. Start Postgres + Redis (`docker compose up -d`) and point `DATABASE_URI` at
     the local database.
  2. Set the Payload pool to `max: 2` (production uses `max: 10`, acquire timeout
     `10000`, `min: 2`).
  3. Create a review as a draft and publish it through the Local API
     (`payload.update({ draft: false, data: { _status: "published" } })`).
  4. Observe: the neighbour lookup inside `revalidateReviewPages` requests a
     third connection, waits 10 s, throws `timeout exceeded when trying to
     connect`, and the publish transaction rolls back — re-reading the document
     returns `_status: "draft"`.
  5. With the default pool, repeat under concurrency and request the public
     review URL: Payload's `count(*)` for the slug lookup times out and the page
     render fails.
- **Expected behavior:** the publish commits before any revalidation work runs;
  a failing invalidation or auxiliary read is logged and cannot undo the save; the
  public page renders once the write is committed.
- **Actual behavior:** the invalidation work shares the write transaction's
  connection budget, so pool starvation either rolls the publish back or makes
  the public read fail. The author sees no reliable signal either way.
- **Root-cause hypothesis:** `revalidateReviewPages` (an `afterChange` hook, and
  therefore inside the transaction) calls `getAdjacentReviews` → two parallel
  `payload.find` calls, each opening a fresh request/transaction/connection and
  each emitting its own `count(*)`. The fire-and-forget translation pipeline
  additionally holds a connection while blocked on the row lock the outer
  transaction owns. The pool is hard-coded at `max: 10` with a 10 s acquire
  timeout and no visibility into acquisition waits.
- **Regression test:** a database-backed test that publishes with the pool
  constrained to 2 connections and asserts the document is committed as
  `published`; it must fail on the pre-fix code and pass after.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Every `revalidatePath` call and the neighbour lookup in the review and reading-list revalidation hooks run **after** the write transaction commits, never inside it. | must |
| FR-2 | The neighbour lookup is best-effort: a failure is logged with structured fields (kind, slug, error digest) and never propagates out of the hook, so the write stays committed. | must |
| FR-3 | Single-document lookups by slug (public review page, its Open Graph image, the preview entry point) do not issue a `count(*)` query. | must |
| FR-4 | A save that leaves a document `published` but not publicly visible at `now` (a future `publishAt`) is recorded as a distinct `scheduled` signal, not as an error. | should |
| FR-5 | After a publish response has been sent, the public gate is read once; a document that is not readable through it is reported to Sentry with the slug and locale. | should |
| FR-6 | Pool size, minimum connections and acquire timeout come from environment variables (`DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_CONNECT_TIMEOUT_MS`) with the current values as documented defaults; an acquisition slower than a configurable threshold is logged as a structured warning. | must |
| FR-7 | Publishing under a constrained pool commits: the document remains `published` and publicly readable. | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Publish must not get slower: the number of database round-trips inside the publish transaction strictly decreases. |
| NFR-2 | Reader-visible behaviour is unchanged: same visibility rule, same revalidated path set, and neighbour pages still refresh after a publish. |
| NFR-3 | No new runtime dependency; only `next/server`'s `after` and existing modules may be used. |
| NFR-4 | All existing unit tests and the Playwright suite pass unchanged; new behaviour is covered by tests that do not require manual verification. |
| NFR-5 | Pool configuration is validated at startup: an invalid or missing value falls back to the documented default and logs once, never crashes the process. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | A unit test asserts that no `revalidatePath` and no neighbour query executes while the write transaction is open (deferral is observed, not assumed). | FR-1 |
| AC-2 | A throwing neighbour lookup leaves the saved document `published` and produces one classified log entry. | FR-2 |
| AC-3 | The public review page, its Open Graph image and the preview entry point issue no `count(*)` for a slug lookup (asserted on the Payload `find` options). | FR-3 |
| AC-4 | Publishing with a future `publishAt` emits the `scheduled` signal and no failure signal. | FR-4 |
| AC-5 | A publish whose post-response public read returns nothing reports to Sentry exactly once, with slug and locale. | FR-5 |
| AC-6 | `DB_POOL_MAX`/`DB_POOL_MIN`/`DB_POOL_CONNECT_TIMEOUT_MS` are honoured; invalid values fall back to defaults with one warning; a slow acquisition logs the wait. | FR-6 |
| AC-7 | With the pool constrained to 2 connections, the publish regression test passes and the document is publicly readable. **Amended during review:** the constraint is a 3-connection pool with one connection held by the test and one kept by the adapter's own probe, which leaves the publish the same single slot. A 2-connection pool starves the publish's own `beginTransaction` before the bug under test can be reached, so the smaller number proves nothing; the premise is now asserted in the test rather than assumed. | FR-7 |

## Edge Cases

- **Unpublish and delete.** A transition to draft revalidates the same path set
  and must also be deferred; a deleted review has no document to verify, so the
  post-response check is skipped.
- **Reading lists.** The reading-list hook shares the deferral mechanism and must
  not regress its own revalidation.
- **No request scope.** Revalidation outside a Next request (seed scripts,
  local API) already tolerates a missing static-generation store; the deferred
  path must keep that tolerance instead of throwing after the response.
- **Translation pipeline.** Publishing triggers the pipeline, whose writes
  re-enter the hooks with `skipTranslation`; the deferral must not re-trigger
  translation or duplicate revalidation per pipeline write.
- **Scheduled publish.** A published review with a future `publishAt` is
  intentionally invisible: it is a `scheduled` signal, never a failure.
- **`after()` unavailable or aborted.** When the request ends abnormally, the
  deferred work may not run; the committed state must still be correct and the
  omission must be loggable.
- **Concurrency.** Two publishes at once must not produce duplicate or lost
  revalidations; the verification read is per-document and idempotent.

## Dependencies

- **Tracks:** none. (`20261027-typography-residuals` introduced the neighbour
  lookup; it is merged and needs no follow-up branch.)
- **External:** PostgreSQL and Redis for the database-backed regression test;
  production needs the new environment variables documented in `.env.example`.

## Open Questions & Assumptions

- **Assumption:** Payload's `afterChange` hooks run inside the write transaction
  for the Postgres adapter, and `next/server`'s `after()` runs after the
  response — hence after commit. If implementation disproves either, the plan's
  Phase 1 goal is blocked and must be re-planned rather than worked around.
- **Assumption:** the regression test can run under `bun test` against the CI
  Postgres service by gating on `DATABASE_URI` (skipped locally when absent).
- **Question:** production's Postgres connection ceiling is assumed to be the
  default (~100) on a dedicated container, so the pool may be sized up rather
  than merely reduced. The track does not require that answer to proceed.

## References

- Production incident log: 2026-10-28, `select count(*) from "reviews"` —
  `timeout exceeded when trying to connect`.
- `src/hooks/revalidatePages.ts`, `src/lib/review-navigation.ts`,
  `src/lib/publish-visibility.ts`, `src/hooks/translateReview.ts` (the existing
  in-transaction write hazard is documented at ~line 150).
- Attribute: #38 (`8b0abb6`) introduced the in-transaction neighbour lookup;
  `db27f79` is the current base.
- `conductor/tracks/archive/20261024-draft-preview-scheduling/spec.md` — the
  `publishAt` visibility contract this track must not change.
