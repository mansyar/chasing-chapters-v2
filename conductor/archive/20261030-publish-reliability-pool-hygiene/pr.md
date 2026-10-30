# Publish Reliability & Pool Hygiene

## The incident

On 2026-10-28 an author pressed **Publish** on two reviews. Both showed a success
toast. Neither review was ever readable:

```
Error: Failed query: select count(*) from "reviews" where ("reviews"."slug" = $1
  and ("reviews"."_status" = $2 and ("reviews"."publish_at" is null or
  "reviews"."publish_at" <= $3)))
params: how-to-own-the-room,published,2026-10-28T00:00:14.441Z
  [cause]: Error: timeout exceeded when trying to connect
```

The `afterChange` chain ran inside the write's own transaction. It revalidated
pages, then looked up the two neighbouring reviews so their prev/next links could
be refreshed — and that lookup needed a second pooled connection. Under a
constrained pool it waited out `connectionTimeoutMillis`, threw, and rolled the
publish back. The toast had already been sent. The author had no way to know.

## What changed

**A publish commits even when nothing else can query.** All cache invalidation
and the neighbour lookup moved off the write path: `afterChange` now registers
the work with `after()` and returns the document immediately, so the write
commits before any of it runs. The neighbour lookup is best-effort — a failure is
logged as `neighbour_lookup_failed` and the write stands. The regression test
publishes with the pool held down to a single free slot, and it fails on the
pre-fix code with the incident's exact error.

**One query instead of two on a single-document lookup.** The review page, its
Open Graph image and the preview route all asked Payload for one document by
slug without `pagination: false`, so every lookup also ran a `count(*)`. The
`count(*)` in the incident log is that second query. List queries and
`generateStaticParams` keep their totals.

**The pool is configuration.** `DB_POOL_MAX`, `DB_POOL_MIN` and
`DB_POOL_CONNECT_TIMEOUT_MS` replace the hard-coded 10 / 2 / 10 000 ms, parsed
defensively: an empty value is treated as unset and silent, an invalid one falls
back to the default and warns once, and neither can crash boot. `.env.example`
documents the instance-count arithmetic. A deferred read slower than
`DB_POOL_SLOW_ACQUIRE_MS` is logged as `db_pool_slow_acquire`; a read that gives
up waiting reports the same milliseconds on `neighbour_lookup_failed`, because a
timeout never reaches the success path.

**A publish that did not become visible says so.** After the response, a
published review is classified as `visible`, `scheduled` (a future `publishAt`,
logged as information) or `not-published`. When it is `visible`, one read through
the public gate — `overrideAccess: false`, no user, no count — confirms it, and a
miss is reported to Sentry once with the slug, the route and the document id. A
read that throws is logged, not reported: a failed read is not evidence a review
is invisible.

## Review

One round, read-only, over the whole track. No blocker. Nine findings — six
minor, three nit — all fixed in `81421e6` and `c18b7b6`: the visibility report no
longer gets skipped when revalidation throws, the slow-read signal is no longer
unreachable on the incident's own shape, the re-entry contract for the
translation pipeline's post-response writes is pinned, and three pieces of test
hygiene (a leaked `logger.warn` spy, an unasserted starvation premise, a source
scan that would silently match the wrong object) are closed. Full detail in
`review.md`. AC-7 was amended in the spec: a 2-connection pool starves the
publish's own `beginTransaction`, so the regression test holds a 3-connection
pool down to one free slot and now asserts that premise instead of assuming it.

## Verification

| Layer | Result |
|---|---|
| `bun run typecheck` | exit 0 — 301 files |
| `bun run lint` | exit 0 — 298 files |
| `bun test` | exit 0 — 955 pass, 0 fail, 3751 assertions, 72 files |
| `bun run test:e2e` | exit 0 — 145 passed in 3.3 m |

The DB-backed regression test needs `DATABASE_URI` and skips with a warning
without it. Every other test runs without infrastructure.

## Not in this track

The in-request deferral is not proven end to end — no e2e asserts a page going
fresh after an admin publish, because the suite has no admin session. The gate
read is the post-response evidence the track promised; a publish-driven e2e is
the honest next step and is recorded as such in `verification/phase-3.md` and
`review.md`, along with the unmeasured Vercel invocation lifetime.

Phase evidence: `verification/phase-1.md`, `phase-2.md`, `phase-3.md`.
