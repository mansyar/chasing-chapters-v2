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
**Status:** in_progress

- [ ] **P1.T1: Reproduce the rollback in a database-backed test** — covers: FR-7
	- [ ] Add `src/lib/__tests__/publish-reliability.test.ts`: boot Payload with
	      `DB_POOL_MAX=2`, create a draft, publish it, and assert the re-read
	      document is `_status: "published"` and matches the public gate.
	- [ ] Gate on `DATABASE_URI` (skip with a printed reason when absent) so
	      `bun test` stays runnable without a database locally.
	- [ ] Confirm on the pre-fix code that the test fails with
	      `timeout exceeded when trying to connect`; record the failing output as
	      evidence before changing `src/hooks/revalidatePages.ts`.
- [ ] **P1.T2: Defer revalidation and neighbour lookup past commit** — covers: FR-1, FR-2
	- [ ] Wrap the revalidation tail in `next/server`'s `after()` so it runs after
	      the response, and keep the existing static-generation-store tolerance
	      for calls with no request scope (seed scripts, local API).
	- [ ] Make the neighbour lookup best-effort: classify a failure
	      (`neighbour_lookup_failed`) with slug and error digest, log it, and
	      return without throwing.
	- [ ] Assert in `revalidatePages.test.ts` that no `revalidatePath` and no
	      neighbour query runs while the hook body is executing, and that a
	      throwing neighbour lookup still resolves.
- [ ] **P1.T3: Confirm freshness did not regress** — covers: FR-1
	- [ ] Run `bun run test:e2e` and confirm `publish-schedule` and
	      `review-schedule` still pass: a publish still revalidates the review,
	      the index, the homepage, the feed and both neighbours.
	- [ ] Capture the phase evidence file with the test names and the failing-then-
	      passing regression output.

## Phase 2: The pool is a configured resource, and slug lookups stop counting

Remove the redundant round-trip from every public slug lookup and make the pool
explicit, bounded and observable.

**Goal:** public review reads cost one query instead of two, and pool behaviour
is configuration with defaults rather than constants in code.

**Depends on:** Phase 1
**Covers:** FR-3, FR-6, NFR-5, AC-3, AC-6
**Touches:** `src/payload.config.ts`, `src/lib/env.ts`, `src/lib/__tests__/env.test.ts`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/reviews/[slug]/opengraph-image.tsx`, `src/app/(payload)/api/preview/route.ts`, `.env.example`
**Verification:** `bun run typecheck && bun run lint && bun test`
**Status:** Pending

- [ ] **P2.T1: Stop counting when looking up one document by slug** — covers: FR-3
	- [ ] Add `pagination: false` to the three slug lookups and leave access,
	      `draft` handling and the visibility `where` untouched.
	- [ ] Extend the existing page/route tests to assert the option is passed, so a
	      future refactor cannot quietly reintroduce the `count(*)`.
- [ ] **P2.T2: Make pool sizing configuration** — covers: FR-6
	- [ ] Add `DB_POOL_MAX` (default 10), `DB_POOL_MIN` (default 2) and
	      `DB_POOL_CONNECT_TIMEOUT_MS` (default 10000) to `src/lib/env.ts` with
	      numeric parsing and fallback-to-default on invalid input, logged once.
	- [ ] Wire them into `postgresAdapter`; document all three in `.env.example`
	      with the deployment note that the value must stay below the database's
	      connection ceiling.
	- [ ] Cover defaults, overrides and invalid values in `env.test.ts`.
- [ ] **P2.T3: Log slow connection acquisition** — covers: FR-6
	- [ ] Measure acquisition at the point the adapter exposes a pool; if it
	      exposes none, time the deferred verification read and log the deviation
	      in the phase notes instead of inventing an internal hook.
	- [ ] Emit one structured warning per slow acquisition (threshold
	      configurable, default 1000 ms) with elapsed ms — no per-query noise.

## Phase 3: A publish that did not become visible says so

Distinguish "scheduled", "published and visible" and "published but unreadable",
and report the last one.

**Goal:** every publish ends in a recorded, identifiable outcome; a review that
is invisible after the response is captured in Sentry with enough context to act.

**Depends on:** Phase 1
**Covers:** FR-4, FR-5, NFR-3, NFR-4, AC-4, AC-5
**Touches:** `src/lib/publish-verification.ts` (new), `src/lib/__tests__/publish-verification.test.ts` (new), `src/hooks/revalidatePages.ts`
**Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
**Status:** Pending

- [ ] **P3.T1: Classify the outcome of a published save** — covers: FR-4
	- [ ] Add a pure classifier over the saved document: `visible`, `scheduled`
	      (published with a future `publishAt`) or `not-published`, reusing
	      `isPubliclyVisible` rather than restating the rule.
	- [ ] Emit the `scheduled` signal as information, not as an error, and only
	      for documents that are actually `published`.
	- [ ] Unit-test the three outcomes including the unparsable-`publishAt` case.
- [ ] **P3.T2: Verify through the public gate after the response** — covers: FR-5
	- [ ] In the deferred path (from Phase 1), read the document once with
	      `overrideAccess: false` and no user; when it is absent, report to the
	      error reporter once with slug, locale and document id.
	- [ ] Keep the read out of the request's critical path and make it a no-op for
	      `scheduled`, draft and deleted documents.
	- [ ] Assert exactly-one report on mismatch and zero on success with an
	      injected reader (no database needed).

## Phase R1: Review Fixes (conditional)

Appended by `conductor-review` if fixes are required. Not part of the plan.
