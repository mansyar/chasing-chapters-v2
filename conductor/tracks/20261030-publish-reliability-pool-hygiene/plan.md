# Publish Reliability & Pool Hygiene — Implementation Plan

**Branch:** `fix/20261030-publish-reliability-pool-hygiene`
**Base:** `main` @ `db27f79bfdbd4c290b54bb825403743c77f31793`

> The plan is the source of truth. Each phase is independently verifiable;
> produce evidence in `conductor/tracks/<track-id>/verification/phase-<n>.md`.
> Test-first applies to `src/lib/`, `src/hooks/` and collection hooks.

## Phase 1: A publish commits even when nothing else can query

Move the revalidation tail off the write transaction and make it unable to fail
a save. Prove it with a test that reproduces the incident, written first.

**Goal:** publishing under a starved pool leaves the document `published` and
publicly readable; a failing neighbour lookup cannot undo the write.

**Depends on:** none
**Covers:** FR-1, FR-2, FR-7, NFR-1, NFR-2, NFR-4, AC-1, AC-2, AC-7
**Touches:** `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts`, `src/lib/__tests__/publish-reliability.test.ts` (new)
**Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
**Status:** Done

- [x] **P1.T1: Reproduce the rollback in a database-backed test** — covers: FR-7
	- [x] Add `src/lib/__tests__/publish-reliability.test.ts`: boot Payload with
	      a constrained pool (3 connections, one held — see the deviation below),
	      create a draft, publish it, and assert the re-read document is
	      `_status: "published"` and matches the public gate.
	- [x] Gate on `DATABASE_URI` (skip with a printed reason when absent) so
	      `bun test` stays runnable without a database locally.
	- [x] Confirm on the pre-fix code that the test fails with
	      `timeout exceeded when trying to connect`; record the failing output as
	      evidence before changing `src/hooks/revalidatePages.ts`.
- [x] **P1.T2: Defer revalidation and neighbour lookup past commit** — covers: FR-1, FR-2
	- [x] Wrap the revalidation tail in `next/server`'s `after()` so it runs after
	      the response, and keep the existing static-generation-store tolerance
	      for calls with no request scope (seed scripts, local API).
	- [x] Make the neighbour lookup best-effort: classify a failure
	      (`neighbour_lookup_failed`) with slug and error digest, log it, and
	      return without throwing.
	- [x] Assert in `revalidatePages.test.ts` that no `revalidatePath` and no
	      neighbour query runs while the hook body is executing, and that a
	      throwing neighbour lookup still resolves.
- [x] **P1.T3: Confirm freshness did not regress** — covers: FR-1
	- [x] Run `bun run test:e2e` and confirm `publish-schedule` and
	      `review-schedule` still pass: a publish still revalidates the review,
	      the index, the homepage, the feed and both neighbours.
	- [x] Capture the phase evidence file with the test names and the failing-then-
	      passing regression output.

**Result:** The revalidation tail (both path revalidation and the neighbour
lookup) now runs through `next/server`'s `after()`, so the write commits first;
the neighbour lookup is best effort and a failure is logged as
`neighbour_lookup_failed` instead of thrown. The starved-pool regression test
fails on the pre-fix code with the incident's query and message, and passes
after the change.
**Checkpoint:** `7127f71`
**Evidence:** `conductor/tracks/20261030-publish-reliability-pool-hygiene/verification/phase-1.md`

## Phase 2: The pool is a configured resource, and slug lookups stop counting

Remove the redundant round-trip from every public slug lookup and make the pool
explicit, bounded and observable.

**Goal:** public review reads cost one query instead of two, and pool behaviour
is configuration with defaults rather than constants in code.

**Depends on:** Phase 1
**Covers:** FR-3, FR-6, NFR-5, AC-3, AC-6
**Touches:** `src/payload.config.ts`, `src/lib/env.ts`, `src/lib/__tests__/env.test.ts`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/reviews/[slug]/opengraph-image.tsx`, `src/app/(payload)/api/preview/route.ts`, `.env.example`
**Verification:** `bun run typecheck && bun run lint && bun test`
**Status:** Done

- [x] **P2.T1: Stop counting when looking up one document by slug** — covers: FR-3
	- [x] Add `pagination: false` to the three slug lookups and leave access,
	      `draft` handling and the visibility `where` untouched.
	- [x] Extend the existing page/route tests to assert the option is passed, so a
	      future refactor cannot quietly reintroduce the `count(*)`.
- [x] **P2.T2: Make pool sizing configuration** — covers: FR-6
	- [x] Add `DB_POOL_MAX` (default 10), `DB_POOL_MIN` (default 2) and
	      `DB_POOL_CONNECT_TIMEOUT_MS` (default 10000) to `src/lib/env.ts` with
	      numeric parsing and fallback-to-default on invalid input, logged once.
	- [x] Wire them into `postgresAdapter`; document all three in `.env.example`
	      with the deployment note that the value must stay below the database's
	      connection ceiling.
	- [x] Cover defaults, overrides and invalid values in `env.test.ts`.
- [x] **P2.T3: Log slow connection acquisition** — covers: FR-6
	- [x] Measure acquisition at the point the adapter exposes a pool; if it
	      exposes none, time the deferred verification read and log the deviation
	      in the phase notes instead of inventing an internal hook.
	- [x] Emit one structured warning per slow acquisition (threshold
	      configurable, default 1000 ms) with elapsed ms — no per-query noise.

**Result:** Single-document slug lookups on the review page, its OG image and the
preview route now pass `pagination: false`, so the redundant `select count(*)`
is gone. Pool size, floor and acquire timeout come from `DB_POOL_MAX`,
`DB_POOL_MIN` and `DB_POOL_CONNECT_TIMEOUT_MS` with the previous constants as
defaults and a warn-once fallback for bad values; a deferred pooled read that
exceeds `DB_POOL_SLOW_ACQUIRE_MS` logs a structured `db_pool_slow_acquire`
warning (the adapter exposes no acquisition seam, so the read is the proxy —
recorded as a deviation).
**Checkpoint:** `0bd2b80`
**Evidence:** `conductor/tracks/20261030-publish-reliability-pool-hygiene/verification/phase-2.md`

## Phase 3: A publish that did not become visible says so

Distinguish "scheduled", "published and visible" and "published but unreadable",
and report the last one.

**Goal:** every publish ends in a recorded, identifiable outcome; a review that
is invisible after the response is captured in Sentry with enough context to act.

**Depends on:** Phase 1
**Covers:** FR-4, FR-5, NFR-3, NFR-4, AC-4, AC-5
**Touches:** `src/lib/publish-verification.ts` (new), `src/lib/__tests__/publish-verification.test.ts` (new), `src/hooks/revalidatePages.ts`
**Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
**Status:** Done

- [x] **P3.T1: Classify the outcome of a published save** — covers: FR-4
	- [x] Add a pure classifier over the saved document: `visible`, `scheduled`
	      (published with a future `publishAt`) or `not-published`, reusing
	      `isPubliclyVisible` rather than restating the rule.
	- [x] Emit the `scheduled` signal as information, not as an error, and only
	      for documents that are actually `published`.
	- [x] Unit-test the three outcomes including the unparsable-`publishAt` case.
- [x] **P3.T2: Verify through the public gate after the response** — covers: FR-5
	- [x] In the deferred path (from Phase 1), read the document once with
	      `overrideAccess: false` and no user; when it is absent, report to the
	      error reporter once with slug, locale and document id.
	- [x] Keep the read out of the request's critical path and make it a no-op for
	      `scheduled`, draft and deleted documents.
	- [x] Assert exactly-one report on mismatch and zero on success with an
	      injected reader (no database needed).

**Result:** `classifyPublishOutcome` names a saved review's outcome (`visible`,
`scheduled`, `not-published`) by delegating to `isPubliclyVisible`; the hook logs
the scheduled case as `review_publish_scheduled` and returns. Otherwise
`verifyPublicVisibility` performs exactly one post-response read through the
public gate (`overrideAccess: false`, no user, `pagination: false`) and reports a
miss to Sentry once with the slug, the default-locale route and the id; a read
that throws is logged, not reported. The e2e suite is green (145/145) once run
without a second suite on the same port; the three timeouts recorded mid-phase
were contention and are documented as such.
**Checkpoint:** `26d2b28`
**Evidence:** `conductor/tracks/20261030-publish-reliability-pool-hygiene/verification/phase-3.md`

## Phase R1: Review Fixes

Findings from the read-only review of `db27f79..HEAD`, dispositions and the
verification that followed are recorded in `review.md`.

- [x] **R1.T1: Keep the visibility report when revalidation throws** — covers: FR-5
	- [x] Run the two deferred jobs independently, logging each failure as
	      `revalidation_deferred_failed` instead of letting the first throw take
	      the second with it.
	- [x] Pin it with a hook case that makes `revalidatePath` throw and asserts the
	      gate read still happens.
- [x] **R1.T2: Cover the edges the review named** — covers: FR-6, AC-5
	- [x] Carry `elapsedMs`/`thresholdMs` on `neighbour_lookup_failed`, so a read
	      that dies waiting for a connection still reports the wait.
	- [x] Assert the report through the hook with an injected empty gate read.
	- [x] Document and pin the post-response re-entry contract.
- [x] **R1.T3: Fix the test hygiene the review found** — covers: AC-7
	- [x] Assert the starvation premise inside the regression test (and inside the
	      `finally`, so a wrong premise cannot leak a connection).
	- [x] Restore the leaked `logger.warn` spy; guard the source scan against a
	      missing marker; justify the adapter cast; reword the `env.ts` comment.
	- [x] Amend AC-7 in the spec to the 3-connection constraint the adapter forces.

**Result:** the deferred half is two independent jobs, each failure contained and
logged; a starved read reports its elapsed time whether it finishes or gives up;
and the regression test asserts the premise it depends on rather than assuming
it. 955 unit tests pass, typecheck and lint are clean.
**Checkpoint:** see the review-fix commits `81421e6`, `c18b7b6`.

## Phase R1: Review Fixes (conditional)

Appended by `conductor-review` if fixes are required. Not part of the plan.
