# Review: E2E Production Harness

- **Track:** `20261022-e2e-production-harness`
- **Type:** chore
- **Branch:** `chore/20261022-e2e-production-harness`
- **Range:** `9287be692520efb10254aac7b53b4c0620f69689..7acef44`
- **Date:** 2026-10-22
- **Verdict:** `PASS WITH FINDINGS` (round 3; the four remaining findings are documentation and are
  closed in the post-review sync)

## Summary

The harness itself is well built and every layer is green: the suite runs against a production
build on a bounded worker count, over a deterministic fixture, with browser coverage for the three
admin translation surfaces and no provider traffic. The blocking problem is not the harness but the
fixture's relationship with the database it shares with the developer: the fixture competes with
the developer's own rows inside fixed-size windows on the public pages, and the admin specs assert
collection-wide absolute counts. Any review in a failed or stale state - which the product itself
creates on every translation failure and never clears - turns the suite red for a reason unrelated
to the code under test, which is precisely the failure mode this track exists to remove. The spec's
own "Populated database" edge case is therefore not met. Eight findings in total: one High, three
Medium and four Low. The user chose the root fix for the High (a dedicated e2e database) and for
the Medium about the cover image (restore the required cover, with the e2e run storing media on
local disk instead of object storage).

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test --coverage` | pass | 421 pass / 0 fail across 34 files; 86.87% funcs / 91.69% lines (the configured gate is 80% on new code) |
| coverage | `bun test --coverage` | pass | `src/lib/e2e-harness.ts`, `src/lib/translate.ts` and `src/hooks/revalidatePages.ts` at 100% |
| lint | `bun run lint` | pass | `biome check .` - 195 files checked, no fixes applied (this command also runs the formatter as a diagnostic) |
| typecheck | `bun run typecheck` | pass | `bun check` - no type errors |
| build | `bun run build` | pass | `next build --webpack` succeeds; only the pre-existing `google-gax` resolution warning |
| e2e | `bun run test:e2e` | pass | seed -> build -> `Running 41 tests using 3 workers` -> 41 passed, 0 failed, 0 skipped |

The reviewer re-ran all six checks on the head and reported the same results. The `expect() calls`
counter wobble the primary had flagged does not reproduce on this tree (939, stable) and was
dismissed by the reviewer.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P1.T1.1, P1.T1.2 | `playwright.config.ts:95-110`, `package.json:17`, the e2e run log | covered (see F8) |
| FR-2 | P1.T2.1, P1.T2.2 | `src/lib/__tests__/e2e-harness.test.ts`; "Running 41 tests using 3 workers" | covered |
| FR-3 | P2.T1.1-P2.T1.3 | `src/lib/e2e-harness.ts`, `e2e/global-setup.ts`, two consecutive runs | partial (F1, F2, F3) |
| FR-4 | P2.T2.1 | the six specs in `e2e/`; 37 chromium tests, 0 skipped, no tautologies left | covered |
| FR-5 | P3.T2.2-P3.T2.4 | `e2e/admin/{attention-bell,bulk-retranslate,translation-poller}.spec.ts` | covered (brittle assertions, F1) |
| FR-6 | P3.T1.1-P3.T1.3 | `src/lib/translate.ts:38-65,387-389`, `translate-test-mode.test.ts` | covered |
| FR-7 | P4.T1.1, P4.T1.2 | `.github/workflows/ci.yml` (+85/-0) | covered |
| FR-8 | P2.T2.2, P5.T1.1 | `src/collections/Authors.ts:30-49`, `Authors.test.ts`, `e2e/admin/locale-preference.spec.ts` | covered |
| NFR-1 | P1.T1.1, P1.T2.1 | `playwright.config.ts:35,95-110` | covered |
| NFR-2 | P2.T1.2, P3.T1.1, P4.T1.1 | the CI e2e job uses no secrets; `deploy.yml` never sets `TRANSLATION_TEST_MODE` | covered |
| NFR-3 | P4.T2.2 | typecheck, lint, `bun test`, build all exit 0 | covered |
| NFR-4 | P2.T1.1, P2.T2.1 | the fixture's pure data and fixed timestamps | partial (the poller spec waits out the app's 20 s tick) |
| NFR-5 | P1.T1.1, P2.T1.2 | `src/lib/e2e-harness.ts`, `e2e/global-setup.ts` | covered |
| AC-1 | P1.T1.1 | the e2e log: 41 passed, 0 failed | covered (see F8) |
| AC-2 | P1.T2.1, P1.T2.2 | `src/lib/__tests__/e2e-harness.test.ts` | covered |
| AC-3 | P2.T1.2, P2.T1.3 | the upsert by slug, email and name; the status-alignment walk over `canTransition` | covered |
| AC-4 | P2.T2.1 | the e2e log: 0 skipped | partial (F3) |
| AC-5 | P3.T2.2-P3.T2.4 | the three admin projects, one test each | partial (F1 - the asserted number is collection-wide) |
| AC-6 | P3.T1.1-P3.T1.3 | `translate-test-mode.test.ts`; the poller spec reading `[stub-id]` back from `?locale=id` | covered |
| AC-7 | P4.T1.1 | the workflow diff is +85/-0 | covered |
| AC-8 | P5.T2.1, P5.T2.2 | `Authors.test.ts` (3 of 4 cases fail on the pre-fix code) and the browser regression | covered |

## Findings

### Critical

- <none>

### High

- **F1 - The admin specs assert collection-wide absolute counts, so any other review in a failed or
  stale state turns the suite red**
  - **File:** `e2e/admin/attention-bell.spec.ts:22-26` (also `e2e/admin/bulk-retranslate.spec.ts:48,52-53`)
  - **What:** The bell's badge is built from `totalDocs` of
    `GET /api/reviews?where=<buildAttentionWhere()>`, and `buildAttentionWhere`
    (`src/components/admin/translation-attention.ts:64-81`) matches every review in `failed` or
    `stale` plus any `pending` review older than 24 hours, with no author or fixture filter. The
    specs hard-code `translations needing attention: 2`, `0 of 2 selected`, `2 of 2 selected` and
    `Re-translate 2 reviews`. The bulk action's candidate list is likewise every failed/stale review
    in the database (`src/components/admin/BulkRetranslateAction.tsx:112-120,229`).
  - **Why:** The product creates a failed review on every translation failure and never clears it,
    so on any populated database the asserted number drifts and the suite fails for a reason
    unrelated to the code under test - the "red for the wrong reason" failure mode this track
    exists to prevent. The spec's "Populated database" edge case is not met.
  - **Fix:** Give the e2e run its own database (the user's decision), so the fixture owns the whole
    dataset and the counts are exact; and tick the two fixture candidates individually in the bulk
    spec instead of "Select all", so the spec proves the selection is per review.
  - **Requirement:** FR-3, FR-5, AC-5, and the spec's "Populated database" edge case
  - **Test gap:** none - the finding is in the specs themselves

### Medium

- **F2 - The public specs need the fixture review inside the first page of the browse listing**
  - **File:** `e2e/navigation.spec.ts:30-39` (also `e2e/sort.spec.ts:47-57,70-72`)
  - **What:** The browse page queries with `limit: 9` and, for the default sort, `-publishDate`,
    while the fixture pins its review to `publishDate: 2026-04-18`. The specs assert the fixture's
    link is visible on page 1 of `/reviews`.
  - **Why:** Once the developer's database holds nine published reviews newer than the fixture's,
    the fixture falls onto page 2 and three specs fail for a data reason.
  - **Fix:** The dedicated e2e database (F1's root fix) - the fixture's rows are then the only
    rows, so every window is exact.
  - **Requirement:** FR-3, FR-4, AC-4
  - **Test gap:** none
- **F3 - The homepage specs need the fixture's rows inside two unsorted or creation-ordered windows**
  - **File:** `e2e/homepage.spec.ts:52-69`
  - **What:** The homepage's featured query is `where { featured: true }, limit: 5` with **no sort**,
    so the fixture's featured reviews (upserted last) fall outside the window as soon as five other
    featured reviews exist; the featured reading-list query is `sort: '-createdAt', limit: 4`, and
    the fixture's list keeps its original `createdAt` across upserts, so it is the oldest and drops
    out as soon as four newer featured lists exist.
  - **Why:** The homepage is the one page whose windows are not deterministic, so the fixture's
    visibility there is the least stable part of the suite, and AC-4's "the featured-hero
    assertions execute against the fixture's data" is only satisfied while the fixture happens to
    fit.
  - **Fix:** The dedicated e2e database - the fixture's rows become the only rows.
  - **Requirement:** FR-3, FR-4, AC-4
  - **Test gap:** none
- **F4 - The cover image was made optional for the harness - a product-visible change to the
  authoring contract**
  - **File:** `src/collections/Reviews.ts:105-106`
  - **What:** `required: true` was removed from the `coverImage` upload field, because the fixture
    could not write to object storage and had to attach no cover. The database column was already
    nullable, so no migration is owed.
  - **Why:** The admin can now publish a review with no cover, and every render site falls back to
    an empty `aspect-2/3` shadowed frame (`ReviewCard.tsx:35`, `FeaturedHero.tsx:81`,
    `reviews/[slug]/page.tsx:162`). The spec's Out of Scope excludes reader-visible changes, so a
    product contract must not be weakened as a harness side effect.
  - **Fix:** The user's decision: restore `required: true` and let the e2e run store media on local
    disk (the storage adapter becomes selectable; the default stays `s3`, so production and local
    development are untouched). The fixture uploads a real, small cover.
  - **Requirement:** FR-3 and the spec's Out of Scope
  - **Test gap:** the collection test asserting the cover is required

### Low

- **F5 - The preference write's `data` carries an assertion it does not need**
  - **File:** `src/collections/Authors.ts:36-39`
  - **What:** The `data` literal is asserted with `as RequiredDataFromCollectionSlug<"payload-preferences">`
    while omitting the required `user` field. Payload's preferences collection fills `user` from
    `req.user` in a field-level `beforeValidate` hook and overwrites whatever was submitted, so
    keeping `user: { relationTo: "authors", value: user.id }` in `data` satisfies the generated type
    with no assertion and produces the identical row.
  - **Why:** The assertion claims a field the object does not carry, so the compiler stops checking
    that write against the collection's data shape - a future required field would not be caught.
  - **Fix:** Restore `user` to the `data` literal, delete the assertion and the type import, keep
    the `user` and `req` options on the call, and update the unit test's expectation.
  - **Requirement:** FR-8, AC-8
  - **Test gap:** none
- **F6 - The revalidation guard swallows every error, not just the out-of-scope one**
  - **File:** `src/hooks/revalidatePages.ts:14-21`
  - **What:** `safeRevalidatePath` catches everything from `revalidatePath` and only logs a warning.
    The documented reason is narrow - `revalidatePath` throws "Invariant: static generation store
    missing" outside a Next request scope - but the catch is unconditional.
  - **Why:** Before the change a throwing `revalidatePath` rolled the write back and failed loudly;
    now any failure inside a request scope is swallowed and the page can silently stay stale.
  - **Fix:** Catch only the out-of-scope invariant and rethrow anything else; add a test for the
    rethrow branch.
  - **Requirement:** FR-3, NFR-3
  - **Test gap:** the rethrow branch
- **F7 - The fixture's "translated" reviews carry no Indonesian content**
  - **File:** `e2e/global-setup.ts:275-304`
  - **What:** The fixture writes the rich-text fields only in the default locale, so the two reviews
    it declares `translated` have no `id` content and `?locale=id` falls back to the English
    source - a translated review renders identically to an untranslated one.
  - **Why:** FR-3 asks for reviews genuinely in the translated state; only the status field carries
    it. A future spec asserting Indonesian content would silently see the English fallback and could
    pass for the wrong reason.
  - **Fix:** Seed the `id` locale for the translated fixture reviews and assert in the unit test
    that a review declared translated always carries Indonesian content.
  - **Requirement:** FR-3, NFR-4
  - **Test gap:** the unit assertion above
- **F8 - The harness serves `next start` while production runs the standalone server**
  - **File:** `playwright.config.ts:95-110`
  - **What:** The web server is `bun --bun next start --port 3100`, but the deployed entry point is
    the standalone server (`.next/standalone/server.js`) and `next.config.ts` sets
    `output: "standalone"`; Next prints a warning that `next start` does not work with a standalone
    output.
  - **Why:** The harness exercises a different server than production runs, on a path Next 16 warns
    about. FR-1 and AC-1 mandate `next start`, so the divergence is spec-sanctioned, but it should
    be a recorded decision rather than an accident.
  - **Fix:** Serve the standalone artifact in the web server, or record the divergence in the spec.
  - **Requirement:** FR-1, AC-1
  - **Test gap:** none

## Overrides

- <none>

## Plan compliance

All five phases ran with their own verification and evidence, and every task was checked
independently by the primary against the phase's Touches list. The one deviation the primary
rejected was the first delivery's `upload.filesRequiredOnCreate: false` on the `media` collection;
it was reverted, `src/collections/Media.ts` is byte-identical to its pre-track shape (the reviewer
confirmed this independently), and its test was deleted. The other recorded deviations were
accepted: the `revalidatePages` guard (now narrowed, see F6), the optional `coverImage` (now
reverted, see F4), the regenerated `src/payload-types.ts`, and the child-process seed.

Two product-visible changes had been made for the harness without a decision: the optional cover
(F4) and the storage/authoring contract they implied. The user was asked and chose to restore the
required cover with a local-disk storage adapter for the e2e run.

## Out of scope

- The e2e layer's own coverage of browsers other than Chromium.
- The reading-lists showcase and the featured carousel keeping their current ordering (they become
  deterministic through the dedicated database, not through a product change).
- The pre-existing `locale as "en" | "id"` cast in the public review page, and the missing
  site-wide i18n dictionary - both belong to the planned UI localization track.

## Debt

- The `expect() calls` counter wobble the primary observed on an earlier tree does not reproduce on
  the reviewed tree (939, stable across `bun test` and `bun test --coverage`), so nothing is
  recorded against it. The reviewer dismissed it as well.
- The poller spec waits out the application's 20-second poll tick, which makes that one spec
  slower than the rest. NFR-4's "no wall-clock dependence" is met in substance - the assertion is
  on the outcome, not on a timing threshold - but the wait is real.

## Doc sync

`updated` - the tech stack was updated before the review (the e2e harness and the CI job), and
the post-review sync covered the dedicated e2e database, the selectable storage adapter, the
restored cover requirement and the four documentation findings of round 3.

## Round 3

- **Range:** `a456516..7acef44` (the round-2 record to the end of the R2 fix phase)
- **Verdict:** `PASS WITH FINDINGS` - all five round-2 findings closed, four Low findings remain,
  none of them blocking

### The round-2 findings

| Finding | Severity | Status | What the reviewer checked |
| --- | --- | --- | --- |
| F1 - the fixture duplicated its cover document | Low | closed | The surviving document is updated in place and keeps its id; the regression test drives the real `upsertCover` and fails against the pre-fix code. |
| F2 - the README overstated what the e2e database goes through | Low | closed | The "never dropped" claim is gone. The remaining wording inaccuracy is the subject of round 3's F1. |
| F3 - the spec was only partially amended | Low | closed | The assumption, NFR-5 and the port edge case read correctly. |
| F4 - `.env.example` did not list `STORAGE_ADAPTER` | Low | closed | The switch is listed with both adapters and the default. |
| F5 - nothing checked Redis | Low | closed | The probe is pure and unit tested, the connection never reconnects, the URL never reaches the message, and the check runs before the first step. |

The reviewer also checked two decisions the phase made rather than taking them on trust: treating a
missing `REDIS_URL` as a missing prerequisite is right, because the suite's own behaviour depends
on the per-IP rate limit that Redis backs and the app fails open without it; and the migration
step's behaviour is the one the phase recorded.

### The remaining findings (all Low, all documentation)

- **F1 - the README still misdescribes the e2e database**
  - **File:** `README.md:137-141`
  - **What:** It said the schema comes from the migrations and that the migrations rebuild the
    schema and discard the contents, and that nothing outside the e2e database is written. On an
    existing e2e database no migration runs at all - the applied ones are recorded and skipped -
    and the schema the run uses is the one Payload syncs when the seed connects in development
    mode. The fixture also writes its cover image into the repository's `media/` directory.
  - **Why:** This is the developer-facing answer to "what does this run do to my data".
  - **Fix:** Say what actually happens. **Closed in the post-review doc sync.**
  - **Requirement:** FR-3
  - **Test gap:** none
- **F2 - the fixture's Indonesian-content comment states an invariant it does not keep**
  - **File:** `e2e/global-setup.ts:475-482`
  - **What:** The comment claimed a review that is not `translated` keeps its Indonesian content
    empty, but the bulk re-translate spec translates the failed and stale fixture candidates and
    the fixture never clears the `id` locale again.
  - **Why:** The next reader of the fixture is misled about the state the suite runs against. No
    assertion depends on it.
  - **Fix:** Correct the comment. **Closed in the post-review doc sync.**
  - **Requirement:** AC-3
  - **Test gap:** none
- **F3 - NFR-5's list of the harness's moving parts is still incomplete**
  - **File:** `conductor/tracks/20261022-e2e-production-harness/spec.md:107`
  - **What:** The list did not name `scripts/copy-standalone-assets.ts`, which the harness depends
    on, and did not say that the fixture and its helpers are covered by FR-3 and FR-5.
  - **Why:** The list is the requirement the track is reviewed against.
  - **Fix:** Name the copy script and the scope. **Closed in the post-review doc sync.**
  - **Requirement:** NFR-5
  - **Test gap:** none
- **F4 - the integrated verification is stale**
  - **File:** `conductor/tracks/20261022-e2e-production-harness/verification/integrated.md`
  - **What:** It was written before the two fix phases: the old head, the old test counts, `next
    start` instead of the standalone artifact, and the cover described as optional.
  - **Why:** It is the track's integrated evidence record, and the pull request body is built on it.
  - **Fix:** Rewrite it at the current head. **Closed in the post-review verification update.**
  - **Requirement:** none
  - **Test gap:** none

### The requirements, after round 3

Everything the track set out to do is covered and verified. The two requirements the reviewer
marked partial are partial for the same reason: NFR-4's "no wall-clock dependence" is met in
substance - the poller spec asserts the outcome, not a threshold - but it waits out the
application's 20-second poll tick; and NFR-5's list of moving parts was incomplete (F3, now
closed). The complete table is in the reviewer's report.

## Round 2

- **Range:** `da4142d..1c19487` (the round-1 record to the end of the R1 fix phase)
- **Verdict:** `PASS WITH FINDINGS` - all eight round-1 findings closed, five Low findings remain

### The round-1 findings

| Finding | Severity | Status | What the reviewer checked |
| --- | --- | --- | --- |
| F1 - the fixture shared the developer's database and the admin specs asserted collection-wide counts | High | closed | The e2e run creates and uses `chasing-chapters_e2e`; the reviewer's own run shows the build's prerendered output carrying the fixture's reviews and its cover - data that exists only in the e2e database - proving the build and the server both ran against it. The bulk spec ticks the two fixture candidates one by one. |
| F2 - the browse page's window pushed the fixture review to page 2 | Medium | closed | The dedicated database: the window cannot overflow. |
| F3 - the featured carousel and the featured reading lists dropped the fixture rows | Medium | closed | The dedicated database. |
| F4 - the cover was optional and the fixture wrote no object storage | Medium | closed | `coverImage` is required again, `STORAGE_ADAPTER` selects the plugin (default `s3`), and the fixture uploads a real PNG rendered with `sharp`. |
| F5 - the preference owner was hidden behind a type assertion | Low | closed | The owner is part of the data again; the assertion and the type import are gone. |
| F6 - the revalidation guard swallowed every error | Low | closed | It tolerates exactly the static-generation invariant and rethrows the rest. |
| F7 - the translated fixture reviews carried no Indonesian content | Low | closed | The fixture data carries an Indonesian payload, written with a locale-scoped update. |
| F8 - the harness served `next start` while production runs the standalone server | Low | closed | The web server serves `.next/standalone/server.js`, the artifact the deployment runs. |

The reviewer also confirmed independently that the `ci` job in `.github/workflows/ci.yml` is
byte-identical to the state before the track's CI work, and that the copy-script test the primary
moved under `src/` is now collected by `bun test`.

### The remaining findings (all Low)

- **F1 - `upsertCover` duplicates the media row instead of repairing it**
  - **File:** `e2e/global-setup.ts:340-362`
  - **What:** When the fixture's media document survives but its file is gone from disk, the fixture
    creates a second media document instead of updating the existing one, so the media row count
    grows by one per run in exactly the state the function's own comment names.
  - **Why:** FR-3's idempotent upsert and AC-3's "same row count and the same identifiers" then no
    longer hold in the suite's own database.
  - **Fix:** Update the existing document with the file and keep its id.
  - **Requirement:** FR-3
  - **Test gap:** seed twice with the file removed in between; assert the row count and id are
    unchanged.
- **F2 - the README overstates what the e2e run does to the e2e database**
  - **File:** `README.md:126-131`
  - **What:** It says the database is never dropped and the fixture never deletes anything, while
    the orchestrator answers Payload's dev-mode drift prompt on the migration step, so the e2e
    database's contents are discarded and its schema rebuilt on every run.
  - **Why:** The loss is confined to the dedicated e2e database, but the documented behaviour is
    inaccurate.
  - **Fix:** State the actual behaviour.
  - **Requirement:** FR-3
  - **Test gap:** none
- **F3 - the spec was only partially amended**
  - **File:** `conductor/tracks/20261022-e2e-production-harness/spec.md:107,126-128,151`
  - **What:** The assumption about the fixture's database still said the fixture writes to the
    database the app uses, NFR-5 still named only the Playwright configuration and the fixture as
    the new moving parts, and the port edge case still described reusing a production `next start`.
  - **Why:** The spec is the contract the track is reviewed against.
  - **Fix:** Amend the three places. **Closed by the primary** before the R2 phase started.
  - **Requirement:** FR-3
  - **Test gap:** none
- **F4 - `.env.example` does not list the new `STORAGE_ADAPTER`**
  - **File:** `.env.example:5-10`
  - **What:** The switch that decides whether the S3 storage plugin is registered at all is
    documented in the README but missing from the environment template.
  - **Why:** A deploy owner reading the template cannot learn the knob exists.
  - **Fix:** Add it to the R2 block of the template.
  - **Requirement:** FR-8
  - **Test gap:** none
- **F5 - the "Postgres or Redis unavailable" edge case is only half implemented**
  - **File:** `conductor/tracks/20261022-e2e-production-harness/spec.md:134-135`
  - **What:** The harness checks Postgres, but nothing checks Redis: with Redis down the app
    degrades to no-cache and the suite runs on instead of failing fast.
  - **Why:** A developer whose Redis is down gets a green run with connection errors in the output
    rather than the documented clear failure.
  - **Fix:** Add a Redis readiness probe to the orchestrator, before it seeds.
  - **Requirement:** NFR-2
  - **Test gap:** none

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 1 | 3 | 4 | 8 |
| 2 | PASS WITH FINDINGS | 0 | 0 | 0 | 5 | 5 |
| 3 | PASS WITH FINDINGS | 0 | 0 | 0 | 4 | 4 |
