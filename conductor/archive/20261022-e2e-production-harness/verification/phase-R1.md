# Phase R1 Verification: Review Fixes, Round 1

- **Track**: 20261022-e2e-production-harness — "E2E Production Harness"
- **Phase**: R1 — "Review Fixes round 1" (FR-1, FR-3, FR-4, FR-5, FR-8, AC-1, AC-3, AC-4, AC-5, AC-8)
- **Date**: 2026-10-22
- **Branch**: `chore/20261022-e2e-production-harness`
- **Base**: `a3de1c7` — "conductor(plan): Mark phase 'Review Fixes' as in progress" (the phase base
  named in the brief; the branch head when the phase started was `da4142d`, the review commit)
- **Head**: `8e68832` — "refactor(e2e): use Bun's SQL client directly" (the head of the implementation
  work; this evidence file is committed on top of it)

## Result

**Verified.** All eight findings of review round 1 are closed. The suite no longer shares the
developer's database: it creates and uses its own database, and it stores its media on the local
disk instead of in object storage, so the cover image is required again. The phase verification
command is green end to end: typecheck, lint, **428 unit tests**, and **41 browser tests (0 failed,
0 skipped)**.

The behaviour of the two product decisions the user took (a dedicated e2e database, a required
cover with local-disk media) is implemented as decided; the wording of AC-1 and FR-3 in the spec
now describes a slightly different suite and needs the primary's amendment (see "Notes for the
primary").

## Commands

Phase verification command (from the brief), run in one go:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e
```

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` → `✓ No type errors in 204 files` |
| static | `bun run lint` | 0 | `biome check .` → "Checked 197 files in 273ms. No fixes applied." |
| unit | `bun test` | 0 | **428 pass / 0 fail**, 34 files, 961 expect() calls (the translation / rate-limit / lock error-path logs in the output are expected) |
| e2e | `bun run test:e2e` | 0 | create the e2e database → apply the schema → seed the fixture → build (109 s compile, 50 s static generation) → "Running 41 tests using 3 workers" → **41 passed (2.6m)**, 0 failed, 0 skipped |

The e2e segment ran the command exactly as written. `bun run test:e2e` now goes through the
orchestrator (`src/scripts/e2e-run.ts`), which runs five steps in order, each in its own child
process with the resolved environment: create the e2e database, apply the schema, seed the fixture,
build the app, run Playwright. The husky pre-commit hook (typecheck + lint + `bun test`) ran on all
seven of this phase's commits and passed each time.

### Browser suite

| Project | Tests | Result |
| --- | --- | --- |
| `chromium` (the public suite, `testIgnore: "**/admin/**"`) | 37 | 37 passed |
| `admin-attention-bell` | 1 | passed (5.0 s) |
| `admin-bulk-retranslate` | 1 | passed (5.8 s) |
| `admin-translation-poller` | 1 | passed (24.8 s) |
| `admin-locale-preference` | 1 | passed (4.9 s) |

The suite served the **standalone artifact** this round (`.next/standalone/server.js` on port 3100),
the same server the production deployment runs. The web server logged one informational line —
`[WebServer] [Warmup] Server did not become ready; skipping warm-up` — and then served the
readiness check and all 41 tests. The suite no longer runs the `next start` command the review
reported as warned about `output: "standalone"`.

## The findings

| Finding | What changed | Where |
| --- | --- | --- |
| **F1 (High)** the fixture shared the developer's database and competed with their rows inside the fixed-size windows, and the admin specs asserted collection-wide counts | The e2e run derives its own connection string from the ambient `DATABASE_URI` (same host, same credentials, database name suffixed `_e2e`), creates that database, applies the schema to it, seeds it, and builds the app against it. The developer's database is never written to. The bulk spec no longer clicks "Select all" — it ticks the two fixture candidates one by one, so the selection does not depend on the other rows in the collection. The bell and bulk specs keep their absolute counts, which are now exact. | `src/lib/e2e-harness.ts` (`resolveE2EDatabaseUri`), `src/scripts/e2e-database.ts` (new), `src/scripts/e2e-run.ts` (new), `e2e/global-setup.ts`, `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`, `e2e/admin/bulk-retranslate.spec.ts`, `src/lib/__tests__/e2e-harness.test.ts` |
| **F2 (Medium)** the browse page's `limit: 9` window pushed the fixture review to page 2 | Closed by the dedicated database: the e2e database holds the fixture's four reviews and nothing else, so the fixture review is always inside the window. No spec change was needed. | `src/scripts/e2e-run.ts`, `src/scripts/e2e-database.ts` |
| **F3 (Medium)** the featured carousel (`limit: 5`, no sort) and the featured reading lists (`limit: 4`, sorted by `createdAt`) dropped the fixture rows | Closed by the dedicated database for the same reason. The fixture's rows are the only rows in the e2e database, so the windows cannot overflow. | `src/scripts/e2e-run.ts`, `src/scripts/e2e-database.ts` |
| **F4 (Medium)** the cover image was optional, and the fixture wrote no object storage | The cover is required again. The storage adapter is selectable: `STORAGE_ADAPTER` picks `s3` (the default, unchanged) or `local`; with `local` no storage plugin is registered, so Payload falls back to its own disk storage (`staticDir: "media"`). The e2e run sets `local` and the fixture uploads a real PNG (rendered with `sharp`) through the local API, so the reviews render the cover-first layout production renders. | `src/collections/Reviews.ts`, `src/lib/env.ts`, `src/payload.config.ts`, `e2e/global-setup.ts` (`drawFixtureCover`, `upsertCover`), `src/lib/e2e-harness.ts` (`E2E_FIXTURE_COVER`), `src/collections/__tests__/Reviews.test.ts`, `src/payload-types.ts` (regenerated) |
| **F5 (Low)** the locale preference was created with a type assertion that hid the missing owner | The owner is part of the data again (`user: { relationTo: "authors", value: user.id }`); the assertion and the type import are gone. The `user` and `req` options stay — they are the deadlock and validation fix from phase 5. | `src/collections/Authors.ts`, `src/collections/__tests__/Authors.test.ts` |
| **F6 (Low)** the revalidation guard swallowed every error | The guard tolerates exactly one failure — the static generation store is missing outside a request — and rethrows everything else. A new test covers the rethrow branch. | `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts` |
| **F7 (Low)** the fixture wrote rich text only in the default locale, so the `translated` reviews fell back to English on `?locale=id` | The fixture data carries an Indonesian payload for the two `translated` reviews, and the seed writes it with a locale-scoped update. A unit assertion fails when a review declared `translated` has no Indonesian payload. | `src/lib/e2e-harness.ts` (`E2EFixtureLocalizedContent`, `review.id`), `e2e/global-setup.ts` (`writeIndonesianContent`), `src/lib/__tests__/e2e-harness.test.ts` |
| **F8 (Low)** the suite served `next start` while production runs the standalone server | The suite serves the standalone artifact now: the web server copies the static assets and the media directory into the standalone output and starts `.next/standalone/server.js` with `PORT` and `HOSTNAME` set. The suite no longer runs the `next start` command Next warns about with `output: "standalone"`. The spec's AC-1 wording still names `next start` and needs the primary's amendment. | `playwright.config.ts`, `scripts/copy-standalone-assets.ts` (deviation), `scripts/__tests__/copy-standalone-assets.test.ts` (deviation) |

## The dedicated database

The connection string is derived, never hard-coded: `resolveE2EDatabaseUri` keeps the host, the
port, the credentials and the query string of the ambient `DATABASE_URI` and suffixes the database
name with `_e2e` (`chasing-chapters` → `chasing-chapters_e2e`; a URI that already ends in `_e2e` is
returned unchanged, so the resolution is idempotent). A missing, blank or unparsable URI resolves
to `undefined` and the run stops with a message instead of falling back to the developer's
database. The unit tests cover all four cases.

`src/scripts/e2e-database.ts` creates the database through Bun's own SQL client (`Bun.SQL`, no
`pg` dependency) against the maintenance database `postgres`: it checks `pg_database` first, so
running it again is a no-op, and it never drops or truncates anything. The create path was
exercised on a throwaway database name as well as the "already exists" path.

Every child of the pipeline inherits the resolved environment: `DATABASE_URI` points at the e2e
database, `STORAGE_ADAPTER` is `local`, and `NEXT_PUBLIC_R2_PUBLIC_URL` is emptied so the cover
images keep pointing at the app's own media proxy. The build runs against the e2e database on
purpose — `/` and `/reading-lists/[slug]` are prerendered, so the build has to see the fixture.
`e2e/global-setup.ts` resolves the same connection string itself, so a manual `bun run seed:e2e`
cannot pollute the developer's database either.

## Acceptance criteria

| AC | Requirement | Status | How |
| --- | --- | --- | --- |
| **AC-1** | FR-1 | Met, wording needs an amendment | The suite serves the app from a production build and the run completes with zero failures. The web server now starts the **standalone** server (`.next/standalone/server.js`) instead of `next start` — the artifact production actually runs. The spec's parenthetical ("the Playwright `webServer` starts `next start`, not `next dev`") is no longer accurate; see "Notes for the primary". |
| **AC-3** | FR-3 | Met | The fixture is still an idempotent upsert keyed on its own identifiers. Measured on the e2e database: the row counts before and after a second seed run are identical — `authors 1, reviews 4, reading_lists 1, media 1, genres 2, tags 2, mood_tags 2` — so running the fixture twice leaves the same row count and the same identifiers (the cover upload is reused instead of re-uploaded). The fixture creates the test author with the fixed test credential and the four reviews in the `translated`, `failed` and `stale` states — now with a cover image and with the Indonesian content of the translated reviews. The determinism the requirement asks for no longer depends on the surrounding database: the fixture has a database of its own. |
| **AC-4** | FR-4 | Met | No public spec reports itself skipped for missing data (0 skipped in 41 tests). The reading-lists, featured-hero and structured-sections assertions execute against the fixture's data, and the fixture's rows now hold the fixed-size windows on their own — the featured carousel shows both fixture reviews, the browse page shows the fixture review, the reading list page is prerendered for the fixture's slug. |
| **AC-5** | FR-5 | Met | The three admin surfaces log in, act and assert the visible outcome: the attention bell counts the reviews needing attention and links to their documents, the bulk action lists the candidates, runs the selection and reports a per-review outcome, and the edit view polls the translation status and raises the toast. The bulk selection is now explicit (the two fixture candidates are ticked one by one), so the outcome does not depend on the other rows in the collection. |
| **AC-8** | FR-8 | Met | The app defects the suite exposed in this track keep their regression tests: the admin locale preference (phase 5) is covered by `src/collections/__tests__/Authors.test.ts` and the `admin-locale-preference` spec, and the preference's owner is now part of the write (F5) with the unit test asserting the exact data. No test was weakened in this phase: the cover test was inverted (optional → required), the revalidation test gained a rethrow branch, and the fixture dataset gained five new assertions. |

## Deviations

| File | Reason |
| --- | --- |
| `scripts/copy-standalone-assets.ts` | Outside the phase's Touches. R1.T7 asks for the standalone server, and the standalone server changes its working directory to `.next/standalone` (`process.chdir(__dirname)` in Next's own server template). Payload resolves the media collection's `staticDir: "media"` against the working directory, so the fixture's cover would be looked up in `.next/standalone/media` while the seed writes it into the project's `media/`. The copy script already moves `.next/static` and `public/` into the standalone output; it now also moves the media directory when one exists. Without it the cover images 404 and the homepage spec's "no console errors" assertion fails. The production start script (`bun run start`) uses the same script, so the production standalone server gets the same treatment. |
| `scripts/__tests__/copy-standalone-assets.test.ts` | Outside the phase's Touches. One test case for the media copy that the change above adds. Note that `bunfig.toml` roots the unit tests at `./src`, so this file is **not** collected by the default `bun test` — it runs with `bun test ./scripts/__tests__/copy-standalone-assets.test.ts` (4 pass / 0 fail). The three pre-existing cases in that file have never been part of the suite either. |
| R1.T5's write shape | The brief asked for the upsert to pass `data.localized.<locale>.<field>`. Payload 3.90 has no support for that shape: a localized write is one locale per call, and the production-proven equivalent is a separate `payload.update({ ..., locale: "id", data: { ... } })` — the same call `src/hooks/translateReview.ts` makes. The seed uses that call. The unit assertion covers the data, not the call shape. |

## Notes for the primary

1. **AC-1 needs an amendment in the spec.** The requirement still says the suite "serves it with
   `next start`". The suite now serves the standalone artifact, which is what production runs and
   what the reviewer asked for in F8. Suggested wording: "serves it with the production server
   (the standalone artifact) — never an on-demand compiling dev server". The spec is not mine to
   edit.
2. **FR-3 could mention the dedicated database.** The requirement's wording ("safe against a
   populated database and deterministic against an empty one") was written for a fixture that
   shared the developer's database. The fixture now has a database of its own, which is stronger
   than the wording asks for.
3. **The cover requirement is visible in the admin.** The `cover_image` column was always
   nullable, so existing rows are untouched, but a published review without a cover now fails
   validation when it is edited until a cover is set. That is the consequence of the user's
   decision and should be in the doc sync.
4. **`bunfig.toml` roots the unit tests at `./src`.** Everything under `scripts/__tests__` is
   therefore never collected by `bun test` — including the three pre-existing cases of the copy
   script and the new one. Widening the root to `["./src", "./scripts"]` would collect them (4
   pass); that file is outside the phase's Touches, so it was left alone.
5. **The e2e database is never dropped.** `chasing-chapters_e2e` stays on the machine after a run
   (it is reused, and the fixture is an upsert). The developer's `chasing-chapters` database was
   not written to by any command of this phase.
6. **The mood tags needed a color.** The empty e2e database exposed the fixture's taxonomy
   creation, which had never run against a populated database: `mood_tags.color` is a required
   field, and the fixture created the row with the name only. The fixture data now carries the
   color and the icon for the mood tags it seeds (the same values the seed script writes).
7. **The `STORAGE_ADAPTER` default is unchanged** (`s3`). A deployment that does not set it keeps
   the R2 plugin; only the e2e run sets `local`. The R2 environment variables stay required — the
   e2e run supplies the same placeholders CI uses.
8. **CI**: the e2e job dropped its separate `payload migrate` step — the pipeline applies the
   schema to the database it created. The `ci` job's own migration step and the required
   `Typecheck, Lint, Test, Build` check are unchanged.

## Primary verification

The primary re-ran the phase's verification command independently on the phase head, then reviewed
the diff against the phase's Touches and against the report.

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | no type errors |
| static | `bun run lint` | 0 | no fixes applied |
| unit | `bun test` | 0 | **428 pass / 0 fail**, 34 files |
| e2e | `bun run test:e2e` | 0 | create database → schema → seed → build → "Running 41 tests using 3 workers" → **41 passed (3.0m)**, 0 failed, 0 skipped |

### The diff against Touches

The phase's range contains the files the brief listed, plus the two deviations the report declares
(`scripts/copy-standalone-assets.ts` and its test file). Every other file in the range is one the
brief named. The report and the diff agree on the file list; nothing is changed that the report does
not mention.

### One correction the primary made

The report's deviation row and its note 4 flag that `bunfig.toml` roots the unit tests at `./src`,
so the test file under `scripts/__tests__` is never collected - the new media-copy case, and the
three cases that predate this track, were dead code in the suite. The primary checked the
alternatives: widening the root to `["./src", "./scripts"]` makes bun ignore the root filter
entirely and collect the Playwright specs under `e2e/` as well, which would run them under bun.
The primary therefore moved the file to `src/scripts/__tests__/copy-standalone-assets.test.ts`
(fixing its import path) so it is collected. The unit suite now reports **432 tests across 35
files** instead of 428 across 34, and the four cases of that file pass.

### The spec amendments the report asked for

The primary amended the spec for the two wordings the report flagged: FR-1 and AC-1 now describe
the production standalone server instead of `next start`, and FR-3 and AC-3 now say the fixture
upserts into the suite's own database. The "Populated database" edge case was reworded to match.
Those amendments are the primary's, not the phase's.

### The acceptance criteria

AC-1, AC-3, AC-4, AC-5 and AC-8 are met, on the evidence in the table above. The two product
decisions the user took are implemented as decided: the e2e run has a database of its own, and the
cover image is required again with the e2e run storing media on the local disk.

### The squash note

The phase's work is eight task-level commits, none of them a merge, an unreported commit or a user
commit, so the range is squashed into one phase commit. The review commit that sits between the
phase base and the phase's first commit is left untouched.
