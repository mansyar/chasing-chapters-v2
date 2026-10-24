# Phase R2 — Review Fixes (round 2)

- **Track:** `20261023-bilingual-site-experience`
- **Phase:** R2 — Review Fixes (round 2)
- **Date:** 2026-10-24
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Base:** `a3422072692bd95d534f8c440769d91b7a7df057` (phase base)
- **Head:** `4f9c7ef` (last source/test commit; this evidence file is the commit after it)
- **Result:** pass. Both round-2 findings are closed and each one is proven, not just edited:
  F1 by a rollback of the whole migration batch on a scratch database that held a
  non-default locale with a blank name (the state the old `down()` rejected), F2 by a second
  `bun run test:e2e` against a database that the first run had left holding a stubbed Indonesian
  translation. The full verification chain is green (520 unit, 95 browser). One deviation is
  recorded: `bun run payload migrate:down` was refused by the shell's permission layer, so the
  batch reversal was proven by invoking the two `down()` functions in reverse order inside one
  transaction — the fallback the phase brief sanctions.

Covers round-2 findings **F1** (High) and **F2** (Low) of
`conductor/tracks/20261023-bilingual-site-experience/review.md`; the code paths they touch serve
FR-10 (localized taxonomy and review titles) and NFR-5 (no document loses its English text when
the schema moves).

## Commits

| Task | Commit | Subject |
| --- | --- | --- |
| R2.T1.1 | `dff3574` | `fix(migrations): stop down() from restoring NOT NULL on localized names` |
| R2.T2.1, R2.T2.2 | `4f9c7ef` | `test(e2e): heal the stale review's Indonesian body on re-seed` |
| R2.T3 | this file | `docs(conductor): record phase R2 verification` |

## Commands

```
$env:DATABASE_URI="postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e"; \
$env:STORAGE_ADAPTER="local"; $env:NEXT_PUBLIC_R2_PUBLIC_URL=""; \
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| Types | `bun run typecheck` | 0 | `✓ No type errors in 228 files` |
| Lint | `bun run lint` (`biome check .`) | 0 | `Checked 220 files in 246ms. No fixes applied.` |
| Unit | `bun test` | 0 | **520 pass, 0 fail**, 1214 `expect()` calls, 42 files |
| Browser | `bun run test:e2e` | 0 | **95 passed (3.5m)**, three workers, standalone server on `:3100` |
| Build | `bun run build` | 0 | `▲ Next.js 16.4.2 (webpack)`, 25/25 static pages, full route table, no error |

Whole chain exit code: **0**.

### `bun run build` environment

The chained command above exports `DATABASE_URI` pointing at the `_e2e` database,
`STORAGE_ADAPTER=local` and an empty `NEXT_PUBLIC_R2_PUBLIC_URL` for the build as well. The local
dev database cannot build (`column reviews_locales.title does not exist`: it has not had the two
20261023 migrations applied), so the build reads the database the migrations created — the same
database the browser layer uses. Pre-existing noise, unchanged by this phase: the two
`google-gax … Can't resolve '../../package.json'` webpack warnings, `No email adapter provided`,
and the seed's `[Revalidation] … static generation store missing` lines.

## Findings → fix → proof

| Finding | Sev. | Fix | Proof |
| --- | --- | --- | --- |
| F1 — `down()` of `20261023_195302` re-applies `SET NOT NULL` to `genres_locales.name`, `tags_locales.name`, `mood_tags_locales.name`, which fails on any database holding a blank non-default name and aborts the batch before `20261023_193922`'s corrected `down()` runs | High | `src/migrations/20261023_195302_relax_localized_name_columns.ts`: the three `SET NOT NULL` statements deleted; `down()` keeps its async signature and runs nothing, with a comment saying why (a table in the state `up()` documents holds rows the constraint rejects; the batch aborts at the first failing statement, so the next step never runs; that next step drops the three `*_locales` tables anyway; backfilling English names would invent translations). `up()` and `20261023_193922` untouched | The rollback proof below: the old three statements raise `column "name" of relation "genres_locales" contains null values` on the populated scratch database, and the new chain commits |
| F2 — the "body stays English" clause in `e2e/content-localization.spec.ts` checks a prefix of the English body, which the offline stub also satisfies because it echoes the source text wrapped in `[stub-id] … [/stub-id]`, and the admin bulk-re-translate spec translates that same fixture review, so a second run against the same database passed against a stubbed translation | Low | `e2e/global-setup.ts` — `writeIndonesianContent` now clears the `id` locale's four rich-text fields and `favoriteQuotes` on every seed when a review carries a localized title but is not `translated`, so a re-seed heals a previous run; translated reviews keep their authored bodies; every write still carries `context: { skipTranslation: true }`. `e2e/content-localization.spec.ts` — the clause now asserts the English opening **and** the absence of `[stub-id]` in the article body (a literal, no server code imported into the spec) | Two consecutive `bun run test:e2e` runs, both **95 passed**; run 2 started from the state run 1's bulk re-translate left behind |

`src/collections/Reviews.ts` and `src/collections/__tests__/localization.test.ts` changed with F2 —
see **Deviations**, item 1 and 2: without them the fixture cannot clear a localized body at all.

## The F1 rollback proof

Scratch database `chasing-chapters_rollback_probe_e2e`, created and dropped with `Bun.SQL` against
the `postgres` maintenance database (the `src/scripts/e2e-database.ts` pattern, which validates the
identifier against `SAFE_DATABASE_NAME` before interpolating it). Neither the dev database
(`chasing-chapters`) nor the e2e database (`chasing-chapters_e2e`) was touched: no command in this
section names either of them, and the probe script refused to run unless `DATABASE_URI` pointed at
`chasing-chapters_rollback_probe_e2e` exactly.

**1. Create the scratch database** — `bun run src/scripts/e2e-database.ts` with `DATABASE_URI` set
to `postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_rollback_probe_e2e`
(the name already ends in `_e2e`, so `resolveE2EDatabaseUri` returns it unchanged):

```
[e2e] Created the database "chasing-chapters_rollback_probe_e2e".
```
Exit 0.

**2. Apply every migration** — `DATABASE_URI=<scratch> bun run payload migrate`. Twelve
migrations, one batch, each `Migrating:` followed by `Migrated:`, ending:

```
[10:34:53] INFO: Migrating: 20261023_193922_localize_taxonomy_and_reading_list_content
[10:34:53] INFO: Migrated:  20261023_193922_localize_taxonomy_and_reading_list_content (148ms)
[10:34:53] INFO: Migrating: 20261023_195302_relax_localized_name_columns
[10:34:53] INFO: Migrated:  20261023_195302_relax_localized_name_columns (7ms)
[10:34:53] INFO: Done.
```
Exit 0. No prompt (a database built only by migrations has no schema drift), and no tracked file
changed (`git status --short` empty afterwards — `src/payload-types.ts` was not rewritten).

**3. Populate it with the state that breaks the old `down()`** — `Bun.SQL` inserts through a
throwaway probe script (`src/scripts/rollback-probe.ts`, never committed, deleted in step 6): one
parent row per collection, one `en` row with a real value and one `id` row with a blank (NULL) name
per taxonomy, a reading list with its version, and a review with its version, both titled in `en`.
The `/api` was not involved.

```
genres_locales: [{"name":"Science Fiction",…,"_locale":"en"},{"name":null,…,"_locale":"id"}]
tags_locales:   [{"name":"Hidden Gem","description":"A book nobody talks about",…,"_locale":"en"},{"name":null,"description":null,…,"_locale":"id"}]
mood_tags_locales: [{"name":"Cozy",…,"_locale":"en"},{"name":null,…,"_locale":"id"}]
reading_lists_locales: [{"title":"Rainy Season Reading","description":"Four reviews for slow afternoons",…,"_locale":"en"}]
_reading_lists_v_locales: [{"version_title":"Rainy Season Reading",…,"_locale":"en"}]
genres.name: column dropped      tags.name: column dropped    mood_tags.name: column dropped
reviews.title: column dropped    _reviews_v.version_title: column dropped
reviews_locales.title: varchar nullable
```

**4. The old `down()` fails here** (F1, reproduced) — the three statements it used to run, inside a
transaction that is rolled back either way, so the database is left as step 3 left it:

```
old down(): column "name" of relation "genres_locales" contains null values
```
That is the review's message. Payload runs a batch in one transaction, so a statement failing here
discards everything the batch would have done next — `20261023_193922`'s `down()` included, which
is why the batch could never be rolled back at all.

**5. The new chain reverses the batch** — `bun run payload migrate:down` was **refused by the
shell's permission layer** (`{"type":"permission.rejected","message":"Permission denied: shell"}`,
nothing executed). The proof therefore uses the route the brief names as the fallback: the two
`down()` functions, invoked in reverse migration order inside a single transaction (Payload's own
shape), against the same populated database —

```
down(): committed 195302 then 193922 in one transaction
```
Exit 0.

**6. Post-state — the pre-`up()` schema, with the English text back, and no invented translation:**

```
genres_locales: gone            tags_locales: gone           mood_tags_locales: gone
reading_lists_locales: gone     _reading_lists_v_locales: gone
genres.name: varchar NOT NULL   tags.name: varchar NOT NULL  mood_tags.name: varchar NOT NULL
reviews.title: varchar nullable _reviews_v.version_title: varchar nullable
reviews_locales.title: column dropped
_reviews_v_locales.version_title: column dropped
genres:     [{"id":1,…,"name":"Science Fiction"}]
tags:       [{"id":1,…,"name":"Hidden Gem","description":"A book nobody talks about"}]
mood_tags:  [{"id":1,…,"name":"Cozy"}]
reading_lists: [{"id":1,…,"title":"Rainy Season Reading","description":"Four reviews for slow afternoons"}]
reviews:    [{"id":1,…,"title":"Nine Kinds of Weather"}]
_reviews_v: [{"id":1,…,"version_title":"Nine Kinds of Weather"}]
```

The three name columns are `NOT NULL` again (they were `NOT NULL` before `up()`, and `up()` dropped
that because `requireDefaultLocaleValue` enforces the requirement in the default locale only);
`reviews.title` and `_reviews_v.version_title` stay nullable, exactly as they were before `up()`;
the `id` rows that held no name were dropped with their tables, and no English value was invented
for them.

**Cleanup:** the scratch database was dropped (`dropped chasing-chapters_rollback_probe_e2e`, via
`DROP DATABASE … WITH (FORCE)` on a `Bun.SQL` connection to `postgres`), and the probe script was
removed (`git add` + `git rm -f`) so it is not in any commit — `git status --short` is empty.

## Double e2e (F2)

| Run | Database state at start | Result |
| --- | --- | --- |
| 1 | the R1 fixture state | **95 passed (2.6m)** — and the run itself re-translated the stale review, writing `[stub-id] … [/stub-id]` Indonesian bodies into it |
| 2 | exactly that state: a stubbed Indonesian body under an Indonesian title | **95 passed (2.5m)** — the re-seed cleared the `id` locale, so `renders the Indonesian review title over the English body` passed the new `not.toContainText("[stub-id]")` clause against the real English body |

The chained verification above ran the suite a third time and passed 95 again. Without the seed
change, run 2 is the run that fails: the marker assertion sees the stub's output.

## Counts against the review baseline (**520 unit / 95 browser**)

- `bun test` — **520 pass / 0 fail** (baseline 520, unchanged).
- `bun run test:e2e` — **95 passed** on every run (baseline 95, unchanged: F2 changed a clause in an
  existing case, it did not add a case).
- `bun run typecheck` — 228 files, no errors.
- `bun run lint` — 220 files, no findings.

## Deviations

1. **`src/collections/Reviews.ts`** (outside `Touches`) — `reviewContent` moved from
   `required: true` to `validate: requireDefaultLocaleValue("Review content")`. Required to make the
   F2 fix possible at all: Payload reads `required` on a *localized* field as required in every
   locale, so clearing the `id` body raised `ValidationError: The following field is invalid: Review
   Content` and a re-seed could not heal anything. The default locale is still enforced, by the same
   helper the localized titles use, and `src/collections/__tests__/localization.test.ts` covers it.
2. **`src/collections/__tests__/localization.test.ts`** (outside `Touches`) — `[Reviews,
   "reviewContent"]` added to `REQUIRED_DEFAULT_LOCALE`, so the contract test keeps asserting that
   the body is required in `en` and accepted as blank in `id`. It follows from item 1; without it
   the localization contract test fails, correctly.
3. **`bun run payload migrate:down` denied** — see step 5 of the rollback proof. The rollback itself
   is proven; what is not proven is the CLI wrapper around it. Reported rather than routed around:
   the fallback is the one the brief names.
4. **`bun run build` needs the e2e environment** — the chained command exports `DATABASE_URI`,
   `STORAGE_ADAPTER` and `NEXT_PUBLIC_R2_PUBLIC_URL` for the build too, because the dev database has
   not had the 20261023 migrations applied (`column reviews_locales.title does not exist`). This is
   the condition the previous phase recorded, not a new one.

## Notes

1. The e2e database was kept, not recreated, across both runs — that is the condition F2 is about.
   The first run ran `payload migrate` (`Done.`), the second run ran it again (no pending
   migrations) and re-seeded.
2. The probe script (`src/scripts/rollback-probe.ts`) was created for this proof only; it is in no
   commit. It refused any `DATABASE_URI` whose database was not exactly
   `chasing-chapters_rollback_probe_e2e`, so no drop target was ever derived from a free-form string.
3. An earlier inspection attempt left `.conductor/evidence/r2-inspect-stale.ts` on disk (a
   `payload.find`-only reader, never run); `.conductor/evidence/` is gitignored, so it is in no
   commit, and the shell refused `Remove-Item` for it. It reads nothing that this phase's proof does
   not already show.
4. The seed's clearing write is scoped to reviews that carry a localized title and are not
   `translated`, which is exactly the one fixture review the bulk re-translate spec picks up; the
   translated fixture reviews are untouched, so the "Indonesian payload" assertions still see
   authored bodies.
5. `src/migrations/**` is outside the linter's `files.includes`, so the deleted statements leave no
   formatting decision behind; the file keeps its two-space indent.

## Primary verification

Re-run by the primary on the same tree, after the phase reported:

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 228 files` |
| static | `bun run lint` | 0 | `Checked 220 files. No fixes applied.` |
| unit | `bun test` | 0 | **520 pass / 0 fail**, 42 files |
| e2e | `bun run test:e2e` | 0 | **95 passed (2.5m)**, 0 failed, 0 skipped |
| static | `bun run build` | 0 | 25/25 static pages (route table unchanged) |

Chain exit code 0. The discriminating case ran by name:
`content-localization.spec.ts:163` "renders the Indonesian review title over the English body"
(4.4 s), now asserting the English opening **and** the absence of the `[stub-id]` marker.

**Diff against Touches.** `a342207..HEAD` is six files: the evidence file plus the five the phase
listed, and the two outside the original Touches (`src/collections/Reviews.ts` and its contract
test) are exactly the reported deviations. No unreported file.

**Checked in the code.** `20261023_195302`'s `down()` is now a documented no-op — relaxing a
constraint has no data to reverse, `SET NOT NULL` cannot be restored on a table the same `up()`
allows to hold blank names, and the tables it would constrain are dropped by the next step of the
batch — so the batch no longer aborts before `20261023_193922`'s rollback. `writeIndonesianContent`
clears the `id` rich text only for a review with a localized title that is not `translated`, leaves
translated reviews' authored bodies alone, and keeps `skipTranslation` on the write.
`reviewContent`'s requirement moved to `requireDefaultLocaleValue`, which is what the clear
requires: Payload reads `required` on a localized field as required in **every** locale, so the
English body is still mandatory and the Indonesian one is optional with fallback.

**Accepted deviations.** The `reviewContent` relaxation is a product-visible authoring contract
change, but it is entailed by FR-10's body fallback and matches the contract the title and the
taxonomy names already use; it goes into the post-review doc sync. The two `down()`s were invoked
directly rather than through `bun run payload migrate:down`, which the shell denied — the CLI
wrapper stays unproven and is recorded as such rather than claimed.

