# Phase 1 — A publish commits even when nothing else can query

- **Track:** `20261030-publish-reliability-pool-hygiene`
- **Phase:** 1
- **Date:** 2026-10-30
- **Branch:** `fix/20261030-publish-reliability-pool-hygiene`
- **Base commit:** `ca38ee8`
- **Head commit:** `1be2a3f` (the evidence commit below follows it)
- **Result:** verified

## What changed

`src/hooks/revalidatePages.ts` no longer awaits any I/O inside the write
transaction. The whole revalidation tail — index, slug, homepage, feed, and the
neighbour lookup — now runs through `next/server`'s `after()`, i.e. after the
response and outside the write's transaction. When there is no request scope
(Local API writes: the seed fixture, the DB-backed test, a script) `after()`
throws, so the deferral is logged and the tail skipped rather than run inline —
running it inline is exactly the in-transaction hazard the deferral removes.

The neighbour lookup is now best effort. Its failure is classified and logged as
`{kind: "neighbour_lookup_failed", slug, digest}` and the deferred work returns;
the paths that do not depend on it are revalidated either way. Before, the throw
escaped the hook and rolled the publish back.

`src/lib/__tests__/publish-reliability.test.ts` is the regression test: it boots
Payload against `DATABASE_URI` with a small pool and publishes a draft while the
pool has no spare connection, then asserts the document re-reads as `published`
and is returned by a public, access-controlled `find`.

`src/hooks/__tests__/revalidatePages.test.ts` now drives the deferred tail
through a mocked `after()`, and asserts the two properties that make the fix
real: no `revalidatePath` and no neighbour query while the hook body executes,
and a throwing neighbour lookup still resolves the hook.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 297 files |
| static | `bun run lint` | 0 | `biome check` clean, 294 files |
| unit | `bun test` | 0 | 928 pass, 0 fail, 3662 `expect()` calls, 69 files |
| e2e | `bun run test:e2e` | 0 | 145 passed (3.1m), including `publish-schedule` (9) and `admin/review-schedule` (3) |
| all | `bun run typecheck && bun run lint && bun test && bun run test:e2e` | 0 | the phase's Verification command, run exactly as written |

Focused runs behind the evidence:

| Command | Exit | Summary |
| --- | --- | --- |
| `bun test src/lib/__tests__/publish-reliability.test.ts` (pre-fix) | 1 | 0 pass, 1 fail — the incident reproduced |
| `bun test src/lib/__tests__/publish-reliability.test.ts` (post-fix) | 0 | 1 pass, 0 fail, 2.38s |
| `bun test src/hooks/__tests__/revalidatePages.test.ts` | 0 | 9 pass, 0 fail, 27 `expect()` calls |

## Red before green

The failing run was captured before `src/hooks/revalidatePages.ts` was touched,
with the neighbour lookup's try/catch deliberately absent (with the catch in
place the publish already survived — the catch, not the deferral, is what saves
the write; the deferral is what takes the work off the transaction). It fails on
the incident's own query and the incident's own message:

```
error: Failed query: select count(*) from "reviews" where (("reviews"."_status" = $1 and
  ("reviews"."publish_at" is null or "reviews"."publish_at" <= $2)) and
  ("reviews"."id" is null or "reviews"."id" <> $3) and ("reviews"."publish_date" > $4 or
  ("reviews"."publish_date" = $5 and "reviews"."slug" < $6)))
error: timeout exceeded when trying to connect
    at <anonymous> (node_modules/pg-pool/index.js:45:11)
(fail) publish reliability under a starved pool > commits a publish while the pool has no spare connection [10226.00ms]
```

Post-fix, the same command is green (1 pass, 2.38s). Full transcript:
`.conductor/evidence/phase-1-publish-reliability-red-green.txt`.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| FR-1 | Every `revalidatePath` and the neighbour lookup run after commit | `revalidatePages.ts` defers through `after()`; `revalidatePages.test.ts` asserts `revalidatePath` is not called during the hook body and only after the flush | pass |
| FR-2 | Neighbour lookup best effort: classified log with `kind`/`slug`/digest, never propagated | `revalidatePages.test.ts` "leaves the write standing when the neighbour lookup fails"; the DB-backed red run logs `kind: "neighbour_lookup_failed"` with slug and digest | pass |
| FR-7 | Publishing under a constrained pool commits | `publish-reliability.test.ts` — publish commits, re-read is `published`, public gate matches | pass |
| NFR-1 | Publish not slower; DB round-trips inside the transaction strictly decrease | The hook body now performs zero queries (asserted: `find` not called before the flush); pre-fix the same publish burned the full 10 s acquire timeout and still failed, post-fix it commits in 2.38 s | pass |
| NFR-2 | Reader-visible behaviour unchanged: same rule, same revalidated paths, neighbours still refreshed | `revalidatePages.test.ts` asserts the exact path sets (`/reviews`, slug, `/`, `/feed.xml`, both neighbours, both locales) — identical to the pre-change expectations | pass |
| NFR-4 | All existing unit tests and Playwright specs pass unchanged | 928 unit tests, 145 e2e specs, no spec edited | pass |
| AC-1 | Unit test asserts no `revalidatePath` and no neighbour query while the write transaction is open | `revalidatePages.test.ts` cases "defers a review page revalidation", "does not query for neighbours while the hook runs", "leaves the write standing when the neighbour lookup fails" | pass |
| AC-2 | A throwing neighbour lookup leaves the document published, with exactly one classified log | `revalidatePages.test.ts` case 8 asserts `result === doc`, the base paths still revalidated, and exactly one `logger.warn` with `{kind, slug, digest}` | pass |
| AC-7 | The pool-constrained regression test passes and the document is publicly readable | `publish-reliability.test.ts`: `_status === "published"`, `isPubliclyVisible` true, and a `find` with `overrideAccess: false` and `publishedAndVisibleWhere` returns the slug | pass |

## Freshness not regressed (P1.T3)

`bun run test:e2e` is green end to end, including the two specs the phase names:

- `e2e/publish-schedule.spec.ts` — 9 tests: the scheduled review 404s in both
  locales, stays out of the public REST API, the home page's latest reviews, the
  browse list, the reading-list card, both feeds and the sitemap, and serves no
  Open Graph image.
- `e2e/admin/review-schedule.spec.ts` — 3 tests: scheduled vs live in the list,
  the schedule stated in the edit view, and a cleared schedule no longer
  promised.

The rest of the suite (`feeds`, `locale-metadata`, `related-reviews`,
`admin/draft-preview`, `admin/translation-poller`, `admin/bulk-retranslate`, …)
passes unchanged, which is where "the same pages are still revalidated and still
render the same content" is observable at the reader's end.

## Evidence paths

- `conductor/tracks/20261030-publish-reliability-pool-hygiene/verification/phase-1.md` (this file, committed)
- `.conductor/evidence/phase-1-publish-reliability-red-green.txt` (local; `.conductor/` is gitignored)

## Deviations

- **The regression test holds one connection in a three-connection pool rather
  than running with `DB_POOL_MAX=2`.** Payload's Postgres adapter opens a
  reconnect probe on `connect()` and never releases it, so a two-connection pool
  has one free connection at rest: a publish's own `beginTransaction` then
  starves *before* the hook ever runs, which fails with a different shape than
  the incident. Three connections with one held by the test (the way the
  translation pipeline's own write or a public page render holds one) leaves the
  publish exactly one — so the write proceeds, and the first thing the write
  starts on top of it has nothing to run on. That is the incident's shape. The
  pool size is set on the test's own `postgresAdapter`, because `DB_POOL_MAX`
  does not exist until Phase 2.

## Notes

- **The deferral alone is not the safety net; the catch is.** The failing run was
  recaptured with the neighbour `try`/`catch` removed as well as the deferral,
  because with the catch in place the publish already survived. Reviewers should
  treat `revalidateNeighbourPages`' catch as load-bearing, not defensive.
- **No request scope is the common non-admin path.** Every Local API write — the
  e2e seed fixture included — logs
  `[Revalidation] Could not defer revalidation for review "<slug>": Error: `after`
  was called outside a request scope`. That is intended: those writes are seeds,
  and running the tail inline would put it back inside the transaction. It does
  mean such a write leaves cached pages stale until their ISR window; there is no
  request to attach to, so there is nothing better to do than say so in the log.
- **The in-request path is not covered by an e2e publish.** The admin writes that
  e2e exercises (`draft-preview`, `review-schedule`) read the admin UI, not the
  public page after a publish, so "`after()` runs the tail on a real request and
  the public page goes fresh" rests on the Next.js contract (`after()` in a Route
  Handler / Server Function runs after the response, and `revalidatePath` is
  documented only as unavailable in Client Components and Proxy) plus the unit
  assertion that the same path set is handed to `revalidatePath`. Worth a
  follow-up e2e when a publish-through-the-admin spec exists.
- Pool constants in `src/payload.config.ts` are untouched, as Phase 2 owns them.

## Primary verification

Re-run independently by the primary after the phase reported done
(2026-10-30, branch `fix/20261030-publish-reliability-pool-hygiene`, head
`7127f71`).

| Check | Command | Result |
| --- | --- | --- |
| Clean tree at start | `git status --porcelain` | empty |
| Files changed within Touches | `git diff --stat ca38ee8..HEAD` | 4 files: `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts`, `src/lib/__tests__/publish-reliability.test.ts`, this evidence file — all inside Touches or the evidence path |
| Typecheck | `bun run typecheck` | exit 0 — no type errors in 297 files |
| Lint/format | `bun run lint` | exit 0 — 294 files checked, no fixes applied |
| Unit/integration suite | `bun test` | exit 0 — 928 pass, 0 fail, 3662 assertions |
| Regression test alone (not skipped) | `bun test src/lib/__tests__/publish-reliability.test.ts` | exit 0 — 1 pass, 4 assertions, runs against `DATABASE_URI` |
| E2E | `bun run test:e2e` | exit 0 — 145 passed in 3.1m |

Acceptance criteria:

- **AC-1/AC-2 (deferred, best-effort tail):** confirmed by reading
  `src/hooks/revalidatePages.ts` — the hook awaits no I/O, the whole tail is
  handed to `after()` through `deferPastResponse`, and
  `revalidateNeighbourPages` classifies and logs
  `neighbour_lookup_failed` before returning. The unit assertions in
  `revalidatePages.test.ts` cover both, and `bun test` passes.
- **AC-7 (regression):** the test runs against the real pool and passes.
  Verified it is not skipped: its own run reports `1 pass`.
- **Evidence:** this file carries commands with exit codes and the red/green
  output; the raw capture is in `.conductor/evidence/phase-1-publish-reliability-red-green.txt`.

Two observations, neither blocking:

1. **The regression test passes post-fix partly because the tail is skipped.**
   A Local API write has no request scope, so `after()` throws and
   `deferPastResponse` logs instead of running the tail: the starved pool is
   never asked for a connection. On `main` the same test failed for the right
   reason (the tail ran inline and starved), so it is a genuine red-to-green
   guard against *restoring* inline execution — and against removing the
   neighbour catch, if the deferral ever falls back inline. It does not, by
   itself, prove the in-request path.
2. **The in-request path is unproven end to end** (the evidence file says the
   same). It rests on `after()`'s documented contract plus the unit assertion
   that the same path set reaches `revalidatePath`. Phase 3 will add a
   post-response public-gate read, which is where a real publish first becomes
   observable end to end; an admin-driven publish e2e is still the honest gap.
