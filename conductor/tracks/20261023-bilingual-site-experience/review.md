# Review: Bilingual Site Experience

- **Track:** `20261023-bilingual-site-experience`
- **Type:** `feature`
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Range:** `98351d54d692ea8842468df5705cc2c0be0a5c60..a5df8cc`
- **Date:** `2026-10-24`
- **Verdict:** `BLOCK`

## Summary

The track delivers a real bilingual site rather than a translated island: every
public page lives under `/en` or `/id`, the interface comes from one typed
dictionary whose Indonesian copy is genuinely translated, metadata, canonical,
hreflang, sitemap and a feed per locale all follow the served language, authors
can supply Indonesian taxonomy, reading-list and review-title values with an
empty value falling back to English, and the detail routes are still pre-rendered
per locale. The suite is honest — `dictionary-source.test.ts` would fail on a
reintroduced English literal, the accessibility spec measures *rendered* colours
through a canvas, and the bundle guard proves the Indonesian strings never reach a
client chunk. All configured checks pass (515 unit tests, 91 browser specs, 25/25
static pages).

Two findings block. Both are consequences of the track's own scope rather than of
its idea: the navbar's internal links are still unprefixed, so a reader who
arrives on a shared `/id/...` link (exactly the case AC-2 protects) is dropped
back to English by their first navigation click; and the new localization
migration's `down()` cannot run and would discard every taxonomy value if it did.
Three smaller findings follow — a missing end-to-end proof for a localized review
title, a dot-in-path heuristic that now interacts with an unformatted slug, and a
docblock that contradicts its own function.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 515 pass / 0 fail, 1190 expect() calls, 42 files |
| coverage | `bun test --coverage` | pass | all files 79.91 % funcs / 89.52 % lines; new-code gate 80 met, every new module 100 % except `src/lib/e2e-harness.ts` 92.31/97.88 |
| lint | `bun run lint` | pass | 220 files, no fixes |
| typecheck | `bun run typecheck` | pass | `No type errors in 228 files` |
| build | `bun run build` | pass | 25/25 static pages, standalone artifact |
| e2e | `bun run test:e2e` | pass | 91 passed, 0 failed, 0 skipped, 2.2 m |

The reviewer re-ran every layer independently and reproduced 91/91. The build and
the browser suite ran against the harness database; the local dev database cannot
build until it is repaired (see `verification/integrated.md` → *Environment*), which
is a local-environment defect, not a track finding.

The all-files coverage figure fell from 86.87 % (before this track) because
`src/lib/__tests__/e2e-harness.test.ts` value-imports `upsertCover` from
`e2e/global-setup.ts`; the gate is scoped to new code and is met. Recorded as debt
below rather than a finding.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P1.T1, P1.T2 | `e2e/locale-routing.spec.ts` (12), route table | covered |
| FR-2 | P2.T3 | locale-routing preference cases | covered |
| FR-3 | P2.T3 | AC-3 case | covered |
| FR-4 | P2.T1, P2.T2 | `dictionary.test.ts`, `dictionary-source.test.ts` | covered |
| FR-5 | P3.T1 | `e2e/locale-metadata.spec.ts` (4), `metadata.test.ts` | covered |
| FR-6 | P3.T2 | reciprocal-alternates spec, `metadata.test.ts` | covered |
| FR-7 | P1.T2 | `?locale=` 308 cases | covered |
| FR-8 | P3.T3 | 2 sitemap specs, `sitemap.test.ts` | covered |
| FR-9 | P3.T3 | 4 feed specs, `feed.test.ts` | covered |
| FR-10 | P4.T1, P4.T2 | `e2e/content-localization.spec.ts` (10), `localization.test.ts` | partial — F3 (title rendering unproven end to end) |
| FR-11 | P1.T1, P4.T1 | `locale.test.ts`, `/fr` 404 cases | covered |
| FR-12 | P5.T1 | route table at `5a5031a` and at `974c2f4` | covered |
| NFR-1 | P5.T2 | `e2e/language-control-a11y.spec.ts` | covered |
| NFR-2 | P2.T2, P5.T2 | 1,532,683 B + dictionary absent from every chunk | covered |
| NFR-3 | P3.T1, P3.T2 | `metadata.test.ts`, phase-3 metadata table | covered |
| NFR-4 | P1.T2 | `locale.test.ts` (100 %) | covered |
| NFR-5 | P4.T1 | e2e run migrated a pre-track database | partial — F2 (`down()` is not a safe rollback) |
| NFR-6 | P1.T2, P3.T1 | Next 16.4.2 `proxy.ts`, installed guide | covered |
| AC-1 … AC-11 | P1–P5 | the AC sweep table in `verification/phase-5.md`, re-run by the reviewer | covered |

## Findings

### Critical

- none

### High

- **F1 - The navbar's internal links are unprefixed, so a shared `/id/...` page loses its language on the first navigation click**
  - **File:** `src/components/layout/Navbar.tsx:70,76,82,88` (mobile menu `:145,152,159`)
  - **What:** the logo and the Reviews / Reading Lists / About links are `href="/"`, `/reviews`, `/reading-lists`, `/about`. The component already receives `locale` and uses it only for the search target (`:60-62`). Every other internal-link surface in the track was prefixed (`ReviewCard`, `ReadingListCard`, `Footer`, `GenreMarquee`, `FeaturedHero`, `ModernBookCarousel`, `GenreSelect`, pagination, `RelatedReviews`); the navbar was missed.
  - **Why:** an unprefixed path is resolved by `src/proxy.ts:72-86` from the `NEXT_LOCALE` cookie, and FR-2/AC-2 deliberately guarantee that cookie is *not* written when a reader follows a shared `/id/...` link. A reader whose stored preference is English (or who has none) opens `/id/reviews` and clicks "Ulasan", landing on `/en/reviews` — the language is silently lost on the first click, which is the failure mode this track exists to remove. No spec clicks a navbar link from an `/id` page, so the suite cannot see it. Phase 1's note 3 deferred this class to Phase 2 on the premise that "the remembered preference stays English until Phase 2 writes the cookie"; Phase 2 fixed five of the six components and the premise does not hold on the AC-2 path.
  - **Fix:** prefix the four public links (and the logo) with `/${locale}` and leave `/admin` bare, in both the desktop and the mobile-menu blocks.
  - **Requirement:** FR-1, FR-2
  - **Test gap:** in `e2e/locale-routing.spec.ts`, with `NEXT_LOCALE=en`, visit `/id/reviews`, click the nav link and assert the URL is still `/id/reviews` with the Indonesian heading; once more for the logo.

- **F2 - The localization migration's `down()` cannot run and would destroy every taxonomy value if it did**
  - **File:** `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts:102-121`
  - **What:** `down()` drops the five `*_locales` tables first (`:104-108`) and only then re-adds the original columns, with `ADD COLUMN "name" varchar NOT NULL` on `genres`, `tags` and `mood_tags` (`:109,110,112`). No value is copied back from the locale tables into the restored columns.
  - **Why:** two defects in one path. (a) Adding a `NOT NULL` column to a populated table fails, so `payload migrate:down` always aborts — Payload wraps the migration in a transaction and rolls it back (`@payloadcms/drizzle/dist/migrate.js:88-94`), leaving the rollback unusable. (b) If it did reach the end, the English names would already have been destroyed with the dropped tables. NFR-5 asks for a non-destructive pair, and the repository's own precedent does it correctly (`src/migrations/20251214_135240.ts:88-147`). The `up()` half is sound: every value is inserted or updated into the locale rows before the generated `DROP COLUMN`s (`:64-99`).
  - **Fix:** mirror `20251214_135240` — add the ten columns as nullable, `UPDATE … FROM <table>_locales WHERE _locale = 'en'` for genres.name, tags.name/description, mood_tags.name, reading_lists.title/description, `_reading_lists_v.version_title/version_description`, and the two review-title columns; then drop the five locale tables, their indices, and the two `reviews_locales` columns. Optionally assert no NULL remains before adding `NOT NULL`.
  - **Requirement:** NFR-5
  - **Test gap:** not unit-testable; prove it once by hand on a scratch copy (`migrate` → `migrate:down` → count non-null values) and record the output in the evidence.

### Medium

- **F3 - No end-to-end proof that a localized review title wins**
  - **File:** `e2e/content-localization.spec.ts:145-157`
  - **What:** FR-10 makes the review `title` localizable and the phase added five nullable-title guards across pages, OG handlers and cards for it, but no fixture sets an Indonesian title and no spec asserts one renders. The suite proves the English-title-plus-Indonesian-body case and the no-Indonesian-body fallback only.
  - **Why:** the one clause of FR-10 whose rendering path (a non-empty localized title winning on the `h1` and in metadata) is never executed. A localized title that rendered blank, or that a guard replaced with the English value, would pass every current test — and `reviews.title` is the only localized field those guards exist for.
  - **Fix:** give one fixture review an Indonesian title through a locale-scoped `payload.update({ collection: "reviews", id, locale: "id", data: { title } })` in the seed, export it, and assert the `/id/reviews/<slug>` heading and description carry it while `/en/reviews/<slug>` carries the English title. Pick a review no other spec asserts on (the `stale` fixture, `e2e-fixture-nine-kinds-of-weather`), so the existing English-title case stays true.
  - **Requirement:** FR-10, AC-9
  - **Test gap:** the case described in the fix.

### Low

- **F4 - A dot anywhere in a path is treated as a static file, and a slug can now be stored unformatted**
  - **File:** `src/proxy.ts:35`, `src/hooks/formatSlug.ts:34-35`
  - **What:** `pathname.includes(".")` classifies any path containing a dot as a file request. The new non-default-locale branch in `formatSlug` returns `value ?? originalDoc?.slug` verbatim instead of formatting it, so a slug typed while editing Indonesian can keep dots or capitals.
  - **Why:** a legacy unprefixed deep link to such a slug (`/reviews/my.book`) is passed through as a file and 404s instead of redirecting to `/en/reviews/my.book`. Latent today only because the default-locale path still runs `format()`, but this diff is what makes an unformatted slug storable.
  - **Fix:** test only the final segment (e.g. `/^\/(?:[^/]+\/)*[^/]+\.[a-z0-9]+$/i` against the basename) and return `originalDoc?.slug ?? format(value)` for a non-default-locale write.
  - **Requirement:** FR-1, FR-7
  - **Test gap:** a `locale.test.ts` case for the predicate and an e2e case that a bare `/reviews/<slug>` still 307s.

- **F5 - `format.ts` docblock contradicts its own behaviour**
  - **File:** `src/lib/i18n/format.ts:10-16`
  - **What:** the docblock claims "a missing value renders an empty string instead of `undefined`", while the implementation (and `dictionary.test.ts:84-86`) leaves an unknown placeholder visible and would render the literal `undefined` for a key whose value is undefined.
  - **Why:** the false sentence invites a caller to rely on a blank where the UI will actually show `{name}` or `undefined`.
  - **Fix:** delete the sentence, or restate it as "a placeholder with no corresponding value is left as written, so the miss is visible rather than silently blank".
  - **Requirement:** none
  - **Test gap:** none

## Overrides

- none

## Plan compliance

All five phases ran, each with a `Result`, a `Checkpoint` and an evidence file:
`ea7832f`, `f3390e2`, `c1b83e6`, `dfcede1`, `5a5031a`. No task was dropped; every
checked task was found implemented in the diff. Phase 1 needed one rework round
(revalidation still named the pre-restructure paths; two competing locale modules)
which was fixed inside the phase before acceptance. The final diff stays within the
union of the phases' `Touches` plus the deviations each phase reported and the
primary accepted — the largest being the hand-written backfill inside the generated
migration (Phase 4), which `up()` needs and which NFR-5 justifies.

No review-fix phase exists yet; this is round 1.

## Out of scope

- The English 404 **body** (its document `lang` is now correct per served locale).
  `not-found.js` receives no props and reading the cookie in the root boundary made
  every `[locale]` route dynamic, so the body is recorded as debt, not a finding.
- `/[locale]/reviews` remains `ƒ` because it reads `searchParams` for its filters —
  pre-existing and bounded to one page.
- The two `opengraph-image` handlers remain dynamic; pre-existing.
- The reviewing of `?locale=` as a long-term interface is closed by FR-7's 308.
- Comments, bylines and any collection outside the five the spec names.

## Debt

- The all-files coverage figure (79.91 % funcs) is dragged down by
  `src/lib/__tests__/e2e-harness.test.ts` importing `upsertCover` from
  `e2e/global-setup.ts`, which loads the Playwright setup into the unit run. Moving
  `upsertCover` into `src/lib/e2e-harness.ts` would fix it. Gate is new-code scoped
  and met, so deferred.
- No pre-track client-bundle baseline exists, so NFR-2 is an absolute measurement
  (1,532,683 B) plus proof of dictionary absence, guarded by a 1,600,000 B ceiling
  rather than a delta.
- A review page carries two language controls (navbar + hero) by choice.
- The local dev database's migration ledger cannot replay (documented in
  `verification/integrated.md`); repair is the owner's call because it discards
  local data.

## Doc sync

`pending` - the pre-review sync updated `README.md` (the language toggle and RSS
lines), `conductor/product.md` (the bilingual pillar) and `conductor/tech-stack.md`
(an i18n row). The post-review sync must cover whatever the fix phase changes and
`docs/PRD.md`, which still describes the toggle as a per-review feature.

## Round 2

- **Range:** `661e6c5..a5df8cc` (delta: the review-fix phase, code `578a0ab..a5df8cc`)
- **Verdict:** `BLOCK` - 0 Critical, 1 High, 0 Medium, 1 Low

All five round-1 findings are closed in the code, not just on report: the navbar prefixes the
logo and the three section links in both blocks with `/admin` left bare (a repo-wide `href="/…"`
sweep now returns only `/admin`); the rewritten `down()` copies the **English** values back and
restores the pre-`up()` nullability; the Indonesian title is proven on the `h1` and the meta
description for `/id` with the English page unchanged, and it survives the pipeline by construction
(`translateReview` writes the `id` locale without `title`); `isStaticAssetPath` re-admits
`/reviews/my.book` while `/og-image.jpg` still passes; `formatSlug` prefers the document's own slug.

Two findings remain.

### High

- **F1 - The sibling migration's `down()` cannot run either**
  - **File:** `src/migrations/20261023_195302_relax_localized_name_columns.ts:16-21`
  - **What:** `down()` re-applies `NOT NULL` to `genres_locales.name`, `tags_locales.name` and `mood_tags_locales.name` — the constraint its own `up()` removed because a non-default locale may legitimately leave the name empty (`:3-8`, and `requireDefaultLocaleValue` allows it). On any database holding one such row it raises `column "name" of relation "genres_locales" contains null values`, and Payload wraps the batch in a transaction, so `payload migrate:down` aborts at this migration and never reaches `20261023_193922`'s now-correct `down()`.
  - **Why:** a migration this track added cannot be reversed on a database in the state its own `up()` creates and documents as normal, which is the workflow's "migrations reviewed and reversible" gate. It is also why the F2 fix could only be proven by direct invocation rather than by the supported command, and it leaves a revert of this track with no rollback path. No data is lost (the transaction aborts), so it is not Critical.
  - **Fix:** delete the three `SET NOT NULL` statements and say why — the constraint cannot be restored without inventing translations, and those tables are dropped by `20261023_193922`'s `down`, the next step of the same batch. Do not backfill English values into non-default rows.
  - **Requirement:** NFR-5
  - **Test gap:** nothing guards either migration's `down()` and the probe script was deleted. Prove the whole batch rolls back once on a scratch database (create, migrate, insert an `id`-locale row with a NULL name, `payload migrate:down`, assert exit 0 and the restored values, drop) and record the output.

### Low

- **F2 - The new "body stays English" clause cannot fail**
  - **File:** `e2e/content-localization.spec.ts:178-183`
  - **What:** the clause asserts a prefix of the English body is visible, but the offline stub echoes the source text wrapped in `[stub-id] … [/stub-id]` and the admin bulk-re-translate spec translates that same stale review, while the seed never clears a previous run's `id` content. On a second run against the same database the assertion passes against a stubbed translation rather than the English fallback.
  - **Why:** it reads as proof of the FR-10 fallback but does not discriminate, and the fixture's state depends on what an earlier run wrote.
  - **Fix:** in the fixture's `writeIndonesianContent`, clear the `id` rich text when a review carries a localized title but is not `translated`, so each run starts from the true fallback state; then assert the body carries no test-mode marker as well as the English text.
  - **Requirement:** FR-10
  - **Test gap:** this is the test; re-run the suite twice to prove the second run agrees.

The reviewer could not run the checks itself (shell denied) and said so rather than assuming a pass;
the primary re-measured coverage at the reviewed head (`a5df8cc`): all files 79.91 % funcs /
89.52 % lines, 520 pass, every new module still 100 %, so the new-code gate holds.

## Round 3

- **Range:** `a5df8cc..ee04f23` (delta: Phase R2, code `a342207..6450256`)
- **Verdict:** `PASS WITH FINDINGS` - 0 Critical, 0 High, 1 Medium, 2 Low

Both round-2 findings are closed in the code. `20261023_195302`'s `down()` is a documented no-op,
and because it is registered after `20261023_193922` in `src/migrations/index.ts`, a batch rollback
runs the no-op and then `193922`'s restore, which re-adds the columns, copies the English values
back and drops the locale tables afterwards - so the batch reverses, and the no-op also leaves a
database with no blank names consistent (the constrained tables are dropped by the next reverse
step). `review_content` was already `notNull: false` in the committed snapshot, so the relaxation
introduces no schema drift. The `[stub-id]` marker in the new assertion is the offline stub's own
literal, so it discriminates.

Every requirement is now `covered` - including NFR-5, which the rollback backs. Three findings
remain, and `review.strict` requires they be fixed rather than deferred.

### Medium

- **F1 - Relaxing `required` on the body also threw away its rich-text validation**
  - **File:** `src/collections/Reviews.ts:117-128`, `src/collections/requireDefaultLocaleValue.ts:3-6`
  - **What:** Payload only installs a field type's own validator when `field.validate` is undefined (`sanitize.js`). Replacing `required: true` with `validate: requireDefaultLocaleValue("Review content")` therefore swapped the rich-text validator for a check whose `isBlank` rejects only `undefined`, `null` and `""`. A `richText` value is never a string: clearing the editor submits an editor state whose root carries no text - precisely the value the built-in validator treated as textless and rejected.
  - **Why:** an author can now save and publish a review with no English body at all; the page then renders an empty body in both locales and FR-10's fallback has nothing to fall back to. It also contradicts the field's own comment ("a document is created with its English body") and the validator's docblock, and the unit case that is meant to hold the line passes a shape a rich-text field can never receive.
  - **Fix:** make the check rich-text aware - treat an object value as blank when its root carries no text (no `root.children`, or only empty paragraphs/empty text nodes, mirroring `@payloadcms/richtext-lexical`'s `hasText`) while keeping the non-default-locale short-circuit so the `id` clear still passes.
  - **Requirement:** FR-10
  - **Test gap:** add a case passing a textless editor state in `en` (rejected) and in `id` (accepted).

### Low

- **F2 - The generated types are stale against the collection config**
  - **File:** `src/payload-types.ts:260`
  - **What:** Payload derives the schema's required list only from `field.required === true`, so with `required` gone `bun run payload generate:types` will make `Review.reviewContent` optional, while the committed file still declares it non-optional.
  - **Why:** the next regeneration - the documented step after a collection change - turns `typecheck` red at `[locale]/reviews/[slug]/page.tsx:261`, where `<RichText data={review.reviewContent} />` needs a non-null editor state, and it is the reason the fixture needs `null as unknown as Review["reviewContent"]`.
  - **Fix:** regenerate the types and guard the render (`{review.reviewContent ? <RichText … /> : null}`); drop the cast if the type becomes nullable.
  - **Requirement:** FR-10
  - **Test gap:** assert in the contract test that `reviewContent` is not `required`, so drift shows up in the suite rather than after a regeneration.

- **F3 - The same non-discriminating shape survives one review over**
  - **File:** `e2e/global-setup.ts:545-563`
  - **What:** the healing clear is scoped to `review.localizedTitle`, so only the stale review is healed. The `failed` fixture review has no localized title but is translated by the admin bulk spec, leaving `[stub-id] …` text in its `id` locale; a re-seed resets its status but never clears that body.
  - **Why:** on a second run, "renders the English body for a review with no Indonesian content" reads a stubbed translation - the stub echoes the source text, so the assertion still passes while its own premise is false. Same shape round 2 removed from the stale case.
  - **Fix:** scope the clear on "no authored Indonesian body" - every review whose `translationStatus !== "translated"` - which is what the seed's own docblock already promises, and add the marker assertion to that case too.
  - **Requirement:** AC-9
  - **Test gap:** the marker assertion is the test; run the suite twice from the same database to prove both reviews heal.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 2 | 1 | 2 | 0 |
| 2 | BLOCK | 0 | 1 | 0 | 1 | 5 |
| 3 | PASS WITH FINDINGS | 0 | 0 | 1 | 2 | 2 |


