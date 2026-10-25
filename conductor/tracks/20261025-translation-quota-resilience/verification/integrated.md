# Integrated verification - Translation Quota Resilience

**Track:** 20261025-translation-quota-resilience
**Date:** 2026-10-25
**Branch:** fix/20261025-translation-quota-resilience
**Base:** bdc422de3a0b25eecd167ac685455db345317b78
**Head at time of run:** 7032e23 (all six phases verified)

## 1. Result

**Verified.** Every layer of the configured verification strategy was run against the
full track diff, not against a phase checkpoint. Static (typecheck, lint) and unit pass
directly, e2e passes 112/112, and the build layer passes once the local database
precondition is met - that precondition is documented in section 4 rather than papered
over.

## 2. Scope of the diff

```
18 files changed, 2599 insertions(+), 41 deletions(-)
```

Production code (8 files):

| File | Change |
| --- | --- |
| `src/lib/translate.ts` | character packing, per-attempt budget reservation, non-retryable quota, structured attempt logging, exported `MAX_ATTEMPTS` |
| `src/lib/translation-budget.ts` | **new** — rolling character budget, Redis + in-process backends |
| `src/lib/translation-errors.ts` | `RETRYABLE_KINDS`, `isRetryable`, `extractProviderErrorDetails` |
| `src/lib/translation-lock.ts` | lock TTL derived from the retry/timeout/budget constants |
| `src/lib/retranslate.ts` | bulk run bounded by the shared character budget |
| `src/hooks/translateReview.ts` | batched quote call, `capturePipelineFailure`, guarded `markTranslationStale` |
| `src/lib/env.ts` | `TRANSLATION_CHAR_BUDGET` |
| `src/components/admin/translation-attention.ts` | per-kind failure breakdown |

Plus `src/components/admin/TranslationAttentionBell.tsx` (22 added lines, rendering
only) and 10 test files.

No migration, no schema change, no new dependency, no change to the persisted
`translationStatus` state machine.

## 3. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| Static | `bun run typecheck` | 0 | No type errors in 253 files (455ms) |
| Static | `bun run lint` | 0 | Checked 244 files, no fixes applied |
| Unit | `bun test` | 0 | 681 pass, 0 fail, 1598 expect() calls, 50 files (2.31s) |
| Static | `bun run build` | 0 | Production build complete, standalone output emitted |
| E2E | `bun run test:e2e` | 0 | 112 passed, 0 failed, 0 flaky (1.6m) |

The unit layer grew from 612 tests on `main` to 681 - 69 new tests, no existing test
deleted or weakened. Two existing assertions were **changed deliberately** and are
called out in section 6.

The counts above were re-run after documentation sync, which added `env.test.ts`
(section 11), so they are five tests and one file higher than the phase-level runs.

## 4. The build layer and its database precondition

`bun run build` failed on the first attempt with:

```
Error: Failed to query: select count(*) from "reviews" where ...
  [cause]: error: column reviews.publish_at does not exist
Error: Failed to collect page data for /[locale]/reviews/[slug]
```

**This is a local environment condition, not a defect in the track.** The local dev
database has 10 applied migrations; `main` ships 14. `src/migrations/20261024_023532_add_publish_at.ts`
exists on disk and is an ancestor of the track base, so the missing column predates
this work and would fail identically on `main`.

`bunx payload migrate` refuses to run against this database without a data-loss
confirmation:

```
It looks like you've run Payload in dev mode, meaning you've dynamically pushed
changes to your database.
If you'd like to run migrations, data loss will occur. Would you like to proceed?
```

That prompt was **not** accepted. The local dev database was created by Payload's
dev-mode schema push, so applying migrations to it is destructive by design, and
losing local data to satisfy a verification step is not a trade this phase gets to
make unilaterally. The prompt was terminated; `payload_migrations` was confirmed to
still hold 10 rows afterwards, so nothing was altered.

The build was instead validated against the e2e database, which the harness creates
from scratch and migrates fully (14 migrations, `publish_at` present):

```
DATABASE_URI=...chasing-chapters_e2e STORAGE_ADAPTER=local bun run build  →  exit 0
```

`STORAGE_ADAPTER=local` is required because that database was created under the local
adapter and therefore has no `_objectkey` column; building it as `s3` fails with
`column "_objectkey" does not exist`. With the matching adapter the build completes
and emits the expected route table, including `ƒ /[locale]/reviews/[slug]`,
`ƒ /api/translation/bulk-retranslate`, `ƒ /sitemap.xml` and `○ /robots.txt`.

**CI validates the build layer independently** against a fresh Postgres service with
migrations applied, so this precondition does not weaken the gate — the required
`Typecheck, Lint, Test, Build` check runs the build in the environment that actually
matters. The local finding is recorded so the next person does not mistake a stale
dev database for a regression.

## 5. E2E

The e2e suite runs against a production build on port 3100 with its own
`<DATABASE_URI>_e2e` database, local disk media, and a fail-fast Redis check.

`bun run test:e2e` - **exit 0, 112 passed, 0 failed, 0 flaky (1.6m)**, ending
`[e2e] The suite finished.` The harness ran the full path: Redis reachability, the
`chasing-chapters_e2e` database created and migrated (the dev-mode data-loss prompt is
answered automatically there, unlike the local dev database), the fixture seeded, the
production build, then Playwright against port 3100.

**A correction to an earlier draft of this section.** It claimed no e2e spec covered the
attention bell or the bulk retranslate action, and that this track therefore could not
have an e2e regression without new admin-authenticated infrastructure. That was wrong.
`git ls-files e2e` shows `e2e/admin/attention-bell.spec.ts`,
`e2e/admin/bulk-retranslate.spec.ts`, `e2e/admin/translation-poller.spec.ts`,
`e2e/admin/draft-preview.spec.ts`, `e2e/admin/review-schedule.spec.ts` and
`e2e/admin/locale-preference.spec.ts`, with `e2e/fixtures/admin-session.ts` providing
`loginAsFixtureAdmin`, `attentionBell` and `getReviewIdBySlug`. The admin infrastructure
exists and was already in use. The correction is recorded rather than quietly edited
because the wrong claim would have closed off a layer this track can actually use.

What that means for the coverage argument:

- The suite **exercises this track's UI change directly**. `attention-bell.spec.ts`
  asserts the bell's `aria-label` is `translations needing attention: 2`, that it renders
  `2`, and that each row links to `/admin/collections/reviews/<id>` by accessible name
  (`<title> failed`, `<title> stale`). All three assertions still pass with Phase 6's
  breakdown block rendered above the list, which is real evidence that the added block
  did not disturb the bell's count, its label, or its rows - a claim the unit tests
  alone could not make.
- The bulk retranslate action also has e2e coverage, so Phase 4's call-site change is
  exercised end to end rather than only through the unit seam.
- What the suite does **not** do is assert on the breakdown text itself, or drive a real
  403 from Google. A spec asserting "13 quota" would need a fixture review whose
  `translationError` is a stored quota message; the fixture seeds `failed` and `stale`
  reviews, and adding a third with a specific persisted error string is a fixture change
  this track did not make. The kind breakdown is therefore pinned at the unit layer
  (`translation-attention.test.ts`, 36 cases, including the round-trip of all five kinds
  through the stored message format) and observed end to end only insofar as the bell
  still renders correctly.

So the honest position: the e2e layer passes and does cover the changed components, the
defect-specific assertions live at the unit layer where a 403 is mocked and the clock is
injected, and the one gap - an e2e assertion on the breakdown text - is a fixture change
that is worth doing in a follow-up rather than being claimed as impossible.

## 6. Deliberately changed assertions

Two existing tests encoded the behaviour this track exists to fix. Both were changed,
and both changes are the point of the track:

1. **`src/lib/__tests__/translate-batch.test.ts`** — asserted `attempts === 3` and three
   provider calls for a quota error. Now asserts `attempts === 1` and one call. The
   `TranslationError` type, the not-a-`TranslationBudgetError` assertion and the message
   assertion were left untouched.

2. **`src/lib/__tests__/retranslate-bulk-run.test.ts`** (new in this track) — pins
   `remainingCharacters` to a full window in `beforeEach`. Its default had begun reaching
   a live Redis once the bulk run consulted the shared budget, so the test was accidentally
   depending on ambient state. This is a hardening, not a weakening. The existing
   `retranslate-bulk.test.ts` gained only the two budget-reason cases; the pin lives in the
   new file, not in that one.

The Phase 3 evidence records the regression test failing **before** the change
(`Received number of calls: 3`) and passing after (`1`), which is the proof that the
defect was real rather than assumed.

## 7. Cross-phase integration

The phases were built to compose, and the composition is what the production incident
needed:

- **Phase 1** bounds a single request (characters per request).
- **Phase 2** bounds the rate (characters per 100-second window).
- **Phase 3** stops a doomed request from being sent three times and makes the failure
  legible in logs.
- **Phase 4** removes the two call sites that could still produce an unbounded burst.
- **Phase 5** makes sure a run cannot be lost, doubled, or write an illegal transition.
- **Phase 6** tells an operator which of those actually happened.

Phase 2's reservation sits **inside** the retry loop, so Phase 3's change to the retry
count directly reduces budget consumption — the two interact in the intended direction.
Phase 5's TTL derivation imports Phase 3's exported `MAX_ATTEMPTS` and Phase 2's
`TRANSLATION_BUDGET_WINDOW_MS`, so the three constants cannot drift apart silently.

One integration seam was found and handled: a review stopped by the character budget is
persisted as `translationStatus: "failed"` while the bulk run reports it `skipped`. The
status machine is out of scope, the throttle self-heals (a failed review is
bulk-retranslatable), and Phase 6 classifies the stored message as `unexpected` rather
than throwing. Recorded in `verification/phase-4.md` and carried to review.

## 8. Coverage

The gate is 80% for new logic-bearing code. Per-phase evidence reports:

| Module | Lines | Functions |
| --- | --- | --- |
| `src/lib/translation-budget.ts` | 99.38% | 93.75% |
| `src/lib/translation-errors.ts` | 100% | 100% |
| `src/lib/retranslate.ts` | 92.14% | 100% |
| `src/hooks/translateReview.ts` | 91.87% | 100% |
| `src/components/admin/translation-attention.ts` | 98.37% | 100% |

The one uncovered line in `translation-budget.ts` is the production `setTimeout` sleep
helper, which tests replace with an injected sleep — the behaviour it exists for is
covered, only the real timer is not exercised.

## 9. Residual risks carried to review

1. **The lock TTL bound is not absolute.** `TRANSLATION_PIPELINE_STEPS = 5` assumes each
   of the five sequential steps issues one packed request. The real invariant is about
   content: the TTL bounds a run of at most five chunks, i.e. when the four rich-text
   fields **plus the quote list** total no more than `TRANSLATION_BATCH_CHAR_CAP` (25,000)
   code points. A long quote list adds chunks exactly as an over-cap field does —
   `favoriteQuotes` has no `maxRows` and each quote's textarea is unbounded, so a single
   `translateBatch` call can issue several requests — and a run that exceeds the total can
   outlive the 33-minute TTL. None of those fields carry a `maxLength`, so no finite TTL
   bounds that case — it needs a product decision (cap the field, or accept that a very
   long review can exceed its lock). Medium.
2. **The attention breakdown describes the fetched page, not the backlog.** `translationError`
   is free text, so no `where` clause filters by kind. The label says so explicitly, but a
   true backlog-wide count would need a stored kind field, which the spec puts out of
   scope. Low, but recorded so nobody later "tidies" the label into a bare number.
3. **`unexpected` is retryable**, so a deterministic failure such as
   `Translation API returned N results for M inputs` still burns three attempts — the
   same shape as the quota bug. Low.
4. **A budget stop persists `failed`.** Self-healing but shows as a failure in the admin
   UI. Low; needs a status-machine decision.
5. **A 33-minute lock has no staleness signal.** An operator seeing "a translation run is
   already in progress" for half an hour cannot tell a live run from a stale lock. Low.

## 10. Verdict

The integrated state is sound: all six phases verified, the full diff typechecks, lints,
tests and builds, no existing test weakened, no schema or dependency change, and the
production defect has a regression test that was demonstrated failing before the fix.

The five residual risks above are recorded rather than resolved, and each needs a
decision the spec deliberately left out of scope. None blocks this track; items 1 and 4
are the two most worth a follow-up track.

## 11. Documentation sync

`conductor/tech-stack.md` and `.env.example` were updated to match the behaviour this
track introduced:

- **tech-stack.md** - the Translation row now records character-based packing
  (`TRANSLATION_BATCH_CHAR_TARGET` 5,000 / `TRANSLATION_BATCH_CHAR_CAP` 25,000), the
  rolling 100-second budget with its Redis and in-process backends, that a quota
  response is classified and not retried, that attempt failures log structured fields,
  and that the attention bell breaks failures down by kind, each dated 2026-10-25. The
  Redis row gained the per-review translation locks and the character budget.
- **.env.example** - documents `TRANSLATION_CHAR_BUDGET` with its default of 100,000,
  the instruction to raise it in step with the Google Cloud console quota, and the fact
  that an empty value falls back to that default rather than failing at boot - so the
  variable must be set explicitly when the console quota is raised. It was absent
  entirely before this track, which meant an operator raising the console quota had no
  visible knob.

### The one code change made during sync, and why

Phase 2's primary verification recorded a Medium observation: `z.coerce.number()` maps
`""` to `0`, which `.positive()` then rejects, so `validateEnv()` throws at module load
when `TRANSLATION_CHAR_BUDGET` is set but empty - a realistic container env-var UI shape,
and a boot crash over a tuning knob that has a good default. FR-3 says the limit is
configurable *with a default*, so crashing when it is unset-but-defined contradicts the
requirement rather than merely being untidy.

That was fixed here rather than deferred: `src/lib/env.ts` now wraps the field in
`z.preprocess((value) => (value === "" ? undefined : value), ...)` so an empty value
falls back to the default. `env.ts` is inside Phase 2's `Touches`, and the change is
four lines plus comment.

Demonstrated before and after with the schema directly:

```
BEFORE (no preprocess) empty string => FAIL: Too small: expected number to be >0
AFTER  empty string                => ok 100000
```

`src/lib/__tests__/env.test.ts` is new (5 cases) and pins the behaviour: absent defaults
to 100,000; empty defaults to 100,000; `"10000000"` is accepted as a string, the shape an
env var actually arrives in; zero, negative and fractional are rejected; non-numeric is
rejected. To make that testable, `env.ts` also exports `envSchemaForTest` - `env` is
validated once at module load against the real `process.env`, so a test cannot vary an
input by mutating the environment afterwards.

`env.ts` and `env.test.ts` had no coverage at all before this, which is why the empty-string
path survived Phase 2's review.

### What documentation sync deliberately did not do

- No change to `product.md` or `product-guidelines.md`. Nothing user-visible changed:
  the site translates the same content, and the bell's new block is an operator aid, not
  a product surface.
- No rewrite of `conductor/workflow.md`. Its verification strategy already described the
  layers and commands this track used.
- No edit to the archived or completed tracks' artifacts.
