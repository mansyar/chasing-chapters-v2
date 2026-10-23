# Phase 4 — Content Localization for Taxonomy and Reading Lists

| | |
| --- | --- |
| Track | `20261023-bilingual-site-experience` |
| Phase | 4 of 5 |
| Date | 2026-10-24 |
| Branch | `feat/20261023-bilingual-site-experience` |
| Base | `04d7976` |
| Head | `b68faec` |
| Result | **pass** — typecheck, lint, 515 unit tests, 80 e2e specs green |

Covers FR-10, AC-9, NFR-5.

## Commands

The verification command is run as one chain, exactly as the brief names it:

`bun run typecheck && bun run lint && bun test && bun run test:e2e`

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | `✓ No type errors in 227 files` (1210 ms) |
| `bun run lint` | 0 | `Checked 219 files in 252ms. No fixes applied.` |
| `bun test` | 0 | 515 pass, 0 fail, 1190 expect() calls, 42 files (3.10 s) |
| `bun run test:e2e` | 0 | **80 passed** (2.0 m) — build 42 s compile, TypeScript 2.1 s, 25 static pages in 34.4 s, then 80 specs on the standalone artifact at `:3100` against `chasing-chapters_e2e` |

The `[Translation]` / `[TranslationLock]` / `[RateLimit]` stacks in the unit output are the
pre-existing failure-path noise. The e2e seed prints `[Revalidation] Could not revalidate …`
(`Invariant: static generation store missing`) for every locale path — pre-existing, and the
same lines Phase 2 and Phase 3 recorded.

Growth against Phase 3's baseline: `bun test` 497 → **515** (18 new specs in
`src/collections/__tests__/localization.test.ts`), Playwright 70 → **80** (10 new specs in
`e2e/content-localization.spec.ts`).

### Run history (the chain needed three runs)

| Run | Outcome |
| --- | --- |
| 1 | Unit green (513 at the time); `test:e2e` **failed** at *seed the fixture*: `ValidationError: The following field is invalid: Title` (status 400) from `writeIndonesianContent`'s `locale: "id"` update. |
| 2 | Unit green (515); `test:e2e` **79 passed, 1 failed** — `renders the localized tag and mood tag on the Indonesian review page`, locator `getByText('Hangat', { exact: true })`. |
| 3 | **All green** — the run recorded in the table above. |

Run 1's failure is the empirical answer to the brief's open question about `required: true`
on a localized field: Payload enforces it **in every locale**, so the translation pipeline's
own partial Indonesian write (rich text only, no `title`) was rejected. The brief's stated
contingency — relax `required`, validate the default locale in a hook — is what shipped
(`src/collections/requireDefaultLocaleValue.ts`, commit `f7be88d`), and it is reported here
rather than dropped silently.

Run 2's failure was the spec's own matcher: the mood badge renders its emoji and its name in
one element (`☕Hangat`), so an exact-text match can never find it (commit `b68faec`).

Run 1 also proved the migration on a database that predated the phase: `payload migrate`
logged `Migrating: 20261023_193922_localize_taxonomy_and_reading_list_content` →
`Migrated: (284 ms)` → `Done.` The e2e database is disposable but not dropped between runs,
so this is a real apply-from-older-state, not a fresh create.

## AC-9 — Indonesian value renders, empty value falls back

Seeded through `e2e/global-setup.ts` (data in `src/lib/e2e-harness.ts`), written as a
`locale: "id"` update after the upsert, so re-running the seed is idempotent and never
deletes. `Fantasy`, `Classic` and `Adventurous` are left without an Indonesian value on
purpose, so the fallback half of FR-10 is assertable.

| Seeded Indonesian value | URL asserted | Spec case |
| --- | --- | --- |
| Genre `Sci-Fi` → `Fiksi Ilmiah` (review badge) | `/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | *renders the Indonesian genre name on the Indonesian review page* — and asserts the English name appears 0 times |
| Same genre, English side unchanged | `/en/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | *keeps the English genre name on the English review page* |
| **Fallback**: genre `Fantasy` has no Indonesian name | `/id/reviews/e2e-fixture-salt-and-paper-lanterns` | *falls back to the English name for a genre with no Indonesian value* — English name visible, not blank |
| Tag `Hidden Gem` → `Permata Tersembunyi`, mood tag `Cozy` → `Hangat` | `/id/reviews/e2e-fixture-salt-and-paper-lanterns` | *renders the localized tag and mood tag on the Indonesian review page* |
| Genre names in the browse filter | `/id/reviews` | *localizes the genre filter on the Indonesian browse page* — `Fiksi Ilmiah` link present, `Fantasy` still English |
| Reading list title `Daftar Bacaan Musim Hujan` + description | `/id/reading-lists` | *renders the Indonesian reading-list title and description* — English title absent |
| Same list on its detail page | `/id/reading-lists/e2e-fixture-rainy-season-reading-list` | *renders the Indonesian reading list on its detail page* — `h1` is the Indonesian title, Indonesian description visible |
| English side unchanged | `/en/reading-lists`, `/en/reading-lists/e2e-fixture-rainy-season-reading-list` | *keeps the English reading list on the English pages* |
| **Fallback**: no fixture review has an Indonesian title | `/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | *renders the English review title while the body is Indonesian* |
| Review with no Indonesian body at all (status `failed`) | `/id/reviews/e2e-fixture-the-cartographers-error` | *renders the English body for a review with no Indonesian content* |

Unit side (`src/collections/__tests__/localization.test.ts`) pins the same contract without a
database: the exact set of localized fields per collection, the default-locale requirement,
that slugs/colors/icons stay single-valued, the slug guard on a locale write, that a
title-only save is not a translation trigger, and that the fixture really seeds one Indonesian
value per taxonomy kind with `Fantasy` deliberately empty.

## Localized fields

Added by this phase (file:line of `localized: true`):

| Collection | Field | File:line | Notes |
| --- | --- | --- | --- |
| Genres | `name` | `src/collections/Genres.ts:25` | |
| Tags | `name` | `src/collections/Tags.ts:22` | |
| Tags | `description` | `src/collections/Tags.ts:28` | optional |
| MoodTags | `name` | `src/collections/MoodTags.ts:23` | `color` and `icon` stay unlocalized — not language |
| ReadingLists | `title` | `src/collections/ReadingLists.ts:44` | |
| ReadingLists | `description` | `src/collections/ReadingLists.ts:50` | optional |
| Reviews | `title` | `src/collections/Reviews.ts:93` | book title; **not** in the pipeline's content fields |

Unchanged and still localized (Phase 1 work, listed for completeness): `Reviews.reviewContent`
(:121), `whatILoved` (:127), `whatCouldBeBetter` (:133), `perfectFor` (:139),
`favoriteQuotes` (:144).

Deliberately **not** localized: every `slug` (a localized slug would fork URLs), `MoodTags.color`,
`MoodTags.icon`, all relationships, statuses, dates, booleans, and the author byline.

Fallback is Payload's (`localization.fallback: true` in `src/payload.config.ts`), satisfied by
passing the locale on every read — not by `??` chains in the pages. Every public read already
passed it except `RelatedReviews`; that one now does (`src/components/reviews/RelatedReviews.tsx`,
`locale` added to its `payload.find`, commit `6d2bc50`), which closes the debt Phases 2 and 3
both recorded. No page or component gained a manual language fallback.

## Migration

Two migrations, both generated, both additive in intent:

| File | What it does |
| --- | --- |
| `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts` (+ `.json`) | Creates `genres_locales`, `tags_locales`, `mood_tags_locales`, `reading_lists_locales`, `_reading_lists_v_locales` (each `_locale` + `_parent_id`, FK `ON DELETE cascade`, unique index on `(_locale, _parent_id)`); adds `reviews_locales.title` and `_reviews_v_locales.version_title`; **copies the existing English text into the `en` rows** (`INSERT … SELECT …, 'en', "id" FROM "<table>"`, plus `UPDATE "reviews_locales" SET "title" = "reviews"."title"`) before the generator's `DROP COLUMN` statements remove the old English columns. |
| `src/migrations/20261023_195302_relax_localized_name_columns.ts` (+ `.json`) | Drops `NOT NULL` from `genres_locales.name`, `tags_locales.name`, `mood_tags_locales.name`, so an author who fills only the Indonesian tag description is not forced to invent an Indonesian name. Generated after `required` moved to the validator. |

Generated, not hand-written: each table/constraint/index/column statement came out of
`bunx payload migrate:create <name>` (logged `Migration created at …/2026…ts` then `Done.`),
which also wrote the drizzle `.json` snapshot and appended the import plus the `migrations`
entry in `src/migrations/index.ts`. `src/payload-types.ts` came from
`bunx payload generate:types` (now `string | null | undefined` for the localized names/titles).
Nothing in a drizzle snapshot, `importMap.js` or `src/payload-types.ts` was hand-edited.

The one hand-added block is the backfill inside the first migration: unmodified generator
output creates the locale tables **empty** and then drops the English columns, which would
have destroyed every existing genre, tag, mood tag, reading-list title/description and review
title. That contradicts NFR-5 ("existing English content untouched"), and
`20251214_135240` — the migration that localized the review body — did the same INSERT for the
same reason. The DDL and the drops are generator output; the `INSERT … SELECT` / `UPDATE … FROM`
statements are the documented gap. Both migrations are inside `src/migrations/**` and the run
above applies them from an older schema.

## Translation pipeline safety (FR-10, T1.2)

`richTextFields = ["reviewContent", "whatILoved", "whatCouldBeBetter", "perfectFor"]` is
unchanged; `title` was **not** added to it.

| Claim | How it was established |
| --- | --- |
| (a) Editing only a review's title neither translates nor marks stale | **Exercised** (unit): `englishContentChanged` returns `false` for a title-only change, and `decideTranslationAction` returns `"none"` for a title-only save while a body rewrite still returns `"translate"`. **Read**: `recordEnglishChangeTime` compares only those four fields, so no `englishUpdatedAt` stamp. |
| (b) The pipeline's Indonesian write touches only its own fields, never `title` | **Exercised end to end**: the e2e seed performs exactly that write (`payload.update({ locale: "id", data: { reviewContent, whatILoved, whatCouldBeBetter, perfectFor, favoriteQuotes } })`) for all four fixture reviews and for the reading list, and it succeeds — the proof is the reverse of run 1, where the same write was rejected because `title` was per-locale `required`. **Read**: `runTranslationPipeline` / `runFormatSyncPipeline` write payloads contain only the four rich-text fields, `favoriteQuotes`, `translationStatus`, `translationError` and `translationUpdatedAt`. |
| (c) A review with empty Indonesian rich text still renders the English body | **Exercised** (e2e): *renders the English body for a review with no Indonesian content* on `/id/reviews/e2e-fixture-the-cartographers-error` (seeded `failed`, no `id` content). |

## Route table — nothing that was static became dynamic

From the final `next build` in the e2e run (identical shape to Phase 3's):

`○ /_not-found`; `●` for `/en`, `/id`, `/en/about`, `/id/about`, `/en/feed.xml`,
`/id/feed.xml`, `/en/reading-lists`, `/id/reading-lists`, both locales of
`/reading-lists/e2e-fixture-rainy-season-reading-list`, and both locales of every published
fixture review (9 paths under `/[locale]/reviews/[slug]`); `ƒ` for
`/[locale]/reading-lists/[slug]/opengraph-image-g9de6a`, `/[locale]/reviews`,
`/[locale]/reviews/[slug]/opengraph-image-1v12u2`, `/admin/[[...segments]]`,
`/api/[...slug]`, `/api/translation/bulk-retranslate`, `/feed.xml`, `/sitemap.xml` and
`Proxy (Middleware)`; `○ /robots.txt`.

No page reads `cookies()` or `headers()`; the pre-rendered set is unchanged, so AC-10's
baseline still holds for Phase 5.

## Deviations

| File | Why it was necessary |
| --- | --- |
| `src/hooks/formatSlug.ts` | Payload runs a field's hooks on every write, so the `id`-locale update reached the slug hook with no slug of its own and re-derived it from the Indonesian name (`fiksi-ilmiah`), re-pointing a published URL. The hook now leaves the stored slug alone on a non-default-locale write (`builder` unchanged for `en`). Unit-tested. |
| `src/collections/requireDefaultLocaleValue.ts` (new) | `required` on a localized field is enforced per locale, which made the pipeline's own Indonesian write impossible. The constraint moved into a validator: the default locale must carry a value, another locale may stay empty and fall back, and a document cannot be **created** in a non-default locale. |
| `src/app/(public)/[locale]/reviews/page.tsx`, `reviews/[slug]/page.tsx`, `reviews/[slug]/opengraph-image.tsx`, `reading-lists/page.tsx`, `reading-lists/[slug]/page.tsx`, `reading-lists/[slug]/opengraph-image.tsx` | Removing `required` makes the generated types nullable, so 19 call sites needed a TypeScript guard (`?? ""` / `?? undefined`). These are type guards, not locale fallback chains: at runtime the validator plus Payload's `fallback` guarantee a value. |
| `src/components/ReviewCard.tsx`, `FeaturedHero.tsx`, `ReadingListCard.tsx`, `ModernBookCarousel.tsx`, `GenreSelect.tsx` | The same nullable-title type guards (the `alt={coverImage.alt \|\| title}` expressions and the local `Genre` interface). |

## Notes for the primary

- **The open question in the brief is answered empirically: `required: true` on a localized
  field means required in *every* locale**, so the stated contingency shipped. If you prefer
  the constraint to live in config rather than in a validator, that is a Phase 5 decision;
  the current shape is what makes both the admin form and the pipeline work.
- Two migrations, one chain. `20261023_193922_…` is the localization itself;
  `20261023_195302_relax_localized_name_columns` exists only because `required` moved off the
  three taxonomy `name` fields, so the columns had to relax.
- The backfill block inside the first migration is the only hand-written SQL, and it is
  required by NFR-5: without it the generator's `DROP COLUMN` would have deleted every
  existing English value. Worth a reviewer's eye; it copies five tables' English text into
  `en` rows and then re-points the two review-title columns.
- `RelatedReviews` now reads in the page's locale — the debt from Phases 2 and 3 is closed
  (`6d2bc50`).
- `docs/ADMIN_GUIDE.md` gained one subsection, `### Names, titles and descriptions`, at the end
  of the Indonesian Translation section: where an author enters the Indonesian value for a
  genre/tag/mood tag, a reading list's title and description, and a review's title; that an
  empty Indonesian value shows the English one; that a book title is never auto-translated;
  and that slugs are never localized.
- Still open for Phase 5 (unchanged): 404 pages carry the root layout's English `og:locale`,
  and the 404 body is not localized.
- Phase 4 commits: `3acd5d0` (localize the fields, migration, slug guard), `6d2bc50`
  (RelatedReviews locale), `0983406` (unit contract), `c791f31` (e2e seed + specs),
  `8a0e9cc` (admin guide), `f7be88d` (validator + relax migration + type guards),
  `b68faec` (mood-badge matcher).

## Primary verification

Re-run by the primary on the same tree, after the phase reported, before acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | `No type errors in 227 files` |
| `bun run lint` | 0 | `Checked 219 files. No fixes applied.` |
| `bun test` | 0 | **515 pass / 0 fail**, 42 files |
| `bun run test:e2e` | 0 | **80 passed (2.0m)**, 0 failed, 0 skipped |
| configured phase command | 0 | as above |

**Diff against Touches.** All 30 paths are inside Touches, plus the four deviations the
phase reported: `src/hooks/formatSlug.ts`, the new
`src/collections/requireDefaultLocaleValue.ts`, the seven page components that needed a
nullable-title guard, and the five cards in `src/components/**`. No unreported file.

**Checked in the code, not the report.**

- `requireDefaultLocaleValue` expresses the constraint where the locale is visible — the
  default locale must carry a value, another locale may stay empty, and a document cannot be
  created in a non-default locale — and it is wired onto `Genres.name`, `Tags.name`,
  `MoodTags.name`, `ReadingLists.title` and `Reviews.title`. A validator rather than
  `required: true` is the correct shape: Payload's `required` cannot be satisfied by the
  translation pipeline, which writes Indonesian rich text and deliberately never a title.
- The one hand-written block is the backfill inside the generated migration, and it is
  correct: `INSERT … SELECT …, 'en', "id"` for the five locale tables and
  `UPDATE … FROM` for the two review-title columns, placed after the generated DDL and before
  the generated `DROP COLUMN` statements, so the English text is copied out before the source
  columns disappear. Verified statement-by-statement against the file.
- The backfill's assumption — that every review already has an `en` row in `reviews_locales` —
  was checked against the local database: zero reviews lack one. It is still an assumption
  about *production*, where a review created before `20251214_135240` and never updated since
  could lack the row; recorded as a residual risk rather than a blocker, since the local data
  and the e2e database both satisfy it.
- `formatSlug`'s guard is a genuine catch: without it the Indonesian write re-derives the slug
  from the translated name and re-points a published URL.
- The e2e specs assert behaviour, not markup: the Indonesian badge, the fallback genre still
  rendering English on `/id`, the English review title above an Indonesian body, and the
  English body of a review with no Indonesian content.

Deviations accepted as reported.

Squashed `3acd5d0..3cc9c13` into one phase commit.
