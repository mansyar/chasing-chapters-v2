# Review — Publish Reliability & Pool Hygiene

**Track:** `20261030-publish-reliability-pool-hygiene`
**Branch:** `fix/20261030-publish-reliability-pool-hygiene`
**Reviewed diff:** `db27f79..HEAD` (base `main` → head at review time)
**Reviewer:** read-only `conductor-reviewer` subagent, adversarial pass over the
whole track

## Verdict

**Request changes** — no blocker. The reviewer confirmed the fix itself is real
("`revalidateReviewPages` now awaits no I/O inside the write transaction, the
neighbour lookup is genuinely best-effort, the three slug lookups really do drop
`count(*)`, and the pool knobs are parsed defensively") and re-ran every layer
green. Six minor and three nit findings followed, all about the *edges* of the
fix rather than the fix: two ways the new incident signal could still be lost,
one premise a test assumed instead of asserting, and three pieces of hygiene.

## Round 1 — findings and disposition

| # | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | minor | Translation-pipeline writes re-enter the hook after the response; the resulting contract was untested and undocumented, though the spec lists re-entry as an edge case. | **Fixed.** Contract stated in `runReviewAfterWrite`'s docstring (same paths revalidated once per write; a still-invisible review is reported again, which is a repeat signal rather than a second defect) and pinned by a new `revalidatePages.test.ts` case that drives a published→published `skipTranslation` write and asserts one deferral and one pass over the eight paths. |
| F2 | minor | `verifyPublishedReview` ran *after* the revalidation, so a non-invariant `revalidatePath` throw skipped the incident report — the signal Phase 3 exists to provide, lost precisely when something else was already wrong. | **Fixed.** The deferred body is now `runReviewAfterWrite`, which runs both jobs in sequence with each failure contained and logged as `revalidation_deferred_failed`; the write is committed, so nothing escalates. The old unit case asserting a rethrow became "logs a revalidation failure instead of losing the verification", and it now asserts the gate read still happens. |
| F3 | minor | `warnOnSlowPooledRead` ran only on the success path, so a starvation that ends in the 10 s connect timeout threw before the timer was read and never produced `db_pool_slow_acquire` — the incident's exact shape. | **Fixed.** `neighbour_lookup_failed` now carries `elapsedMs` and `thresholdMs`, and the substitution is documented at `warnOnSlowPooledRead`, where the failure path is named explicitly. The `kind` name was left as is: the docstring and payload say what is measured, and renaming would break the alerting any operator has already written against it. |
| F4 | minor | The AC-7 regression test assumed a 3-connection pool minus a held connection minus an adapter-held connection leaves exactly one, and never asserted it; AC-7's text says two connections. | **Fixed, with a correction to the analysis.** Asserting `totalCount`/`idleCount` first failed the test — the adapter's probe plus the held connection leave `total: 2`, not 3, and the assertion itself leaked the held connection because it ran outside the `finally`. The test now holds the connection, then asserts `{ idle: 0, total: POOL_SIZE - 1, waiting: 0 }` inside the `try`, so a changed premise fails loudly and cannot leak. AC-7 is amended in the spec: a 2-connection pool starves the publish's *own* `beginTransaction`, so the smaller number would prove nothing. |
| F5 | minor | `spyOn(logger, "warn")` in `publish-verification.test.ts` was never restored, silencing `logger.warn` for every later file in Bun's process-wide registry — the same leak class `phase-3.md` records once already. | **Fixed.** The body is wrapped in `try/finally` with `mockRestore()`, and the dead `mockClear()` is gone. |
| F6 | minor | AC-5's "exactly once, with slug and locale" was asserted only in the module that raises it, never through the deferred wiring — a regression that kept the read and dropped the report would have passed. | **Fixed.** `captureException` is stubbed before the hook import, and a new case feeds `reviewFinder({ verified: null })`, flushes, and asserts one capture whose message names the slug and id and whose `extra` carries the route and locale. |
| F7 | nit | A comment in `env.ts` claimed "the write path never waits on the pool any more (Phase 1)" — overbroad (the translation pipeline still opens a second connection from inside the transaction) and Conductor bookkeeping in shipped source. | **Fixed.** Reworded to what is true: the revalidation tail no longer reads inside the write's transaction. |
| F8 | nit | A double type assertion in the regression test had no justification for the cast. | **Fixed.** The comment now says why: `payload.db` is typed as the generic adapter and exposes no pool. |
| F9 | nit | The preview-route source scan would brace-match an unrelated object if the `payload.find({` marker ever disappeared. | **Fixed.** It throws a named error when the marker is absent. |

## Requirements coverage after the round

Every FR and AC is `covered`. The three that were `partial` before this round —
FR-5 and AC-5 (report not asserted through the hook), FR-6 (warning unreachable
on a timeout) — are now closed, and AC-7 keeps its deviation recorded in the spec
instead of only in the phase evidence.

## Verification after the round

| Layer | Result |
|---|---|
| `bun run typecheck` | exit 0 — 301 files |
| `bun run lint` | exit 0 — 298 files |
| `bun test` | exit 0 — 955 pass, 0 fail, 3751 assertions, 72 files |
| `bun run test:e2e` | exit 0 — 145 passed in 3.3 m on the reviewed head, run alone |

## What the review could not settle, and where it is recorded

- **The in-request deferral is still not proven end to end.** No e2e asserts a
  page going fresh after an admin publish, so the deferral's *effect* rests on
  unit tests plus the absence of `Could not defer` warnings in a live request.
  Recorded in `verification/phase-3.md`; the honest next step is a publish-driven
  e2e, which needs an admin session the suite does not have today.
- **`after()`'s drained-store semantics** for a post-response write are Next's,
  not this repo's. The contract above is the behaviour the code intends; a
  future Next upgrade is where to re-check it.
- **Vercel invocation lifetime** for two neighbour reads plus one gate read after
  the response is unmeasured. The work is bounded and logged when it cannot run,
  which is the most this track can claim without a deployed environment.
