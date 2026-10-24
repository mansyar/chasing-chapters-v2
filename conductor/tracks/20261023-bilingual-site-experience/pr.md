# feat(i18n): make the bilingual site real - path locales, one dictionary, locale-correct metadata

## Summary

The site promised two languages and delivered one and a half: Indonesian existed only as five
fields on a review detail page reached by `?locale=id`, every other page was English, `<html lang>`
was hardcoded, metadata and canonicals always described the English page, and the language control
existed on exactly one page.

This track makes the second language a first-class address. Every public page is served at `/en/…`
or `/id/…`, the interface renders from one typed dictionary, each page declares its own language,
canonical and reciprocal hreflang, the sitemap and RSS expose both locales, and authors can enter
Indonesian names, titles and descriptions that fall back to English when empty.

- **94 files** changed outside `conductor/` (+14,532/−698), **9 phases**, 4 review rounds, 11
  findings fixed
- Verification: **524 unit tests**, **95 browser specs**, typecheck 228 files, lint 220 files,
  coverage 79.91 % funcs / 89.32 % lines, production build with 25/25 static pages

## Track

- Spec: `conductor/archive/20261023-bilingual-site-experience/spec.md`
- Plan: `conductor/archive/20261023-bilingual-site-experience/plan.md`
- Review: `conductor/archive/20261023-bilingual-site-experience/review.md`
- Integrated verification: `conductor/archive/20261023-bilingual-site-experience/verification/integrated.md`

## What happened

| Phase | Checkpoint | What it delivered |
| --- | --- | --- |
| 1. Locale Routing Foundation | `ea7832f` | The public tree moved under `[locale]`, `[locale]/layout.tsx` owns `<html lang>`, `src/proxy.ts` redirects bare public paths (307, remembered locale) and legacy `?locale=` (308, query preserved), unsupported locales 404, the suite speaks locale-prefixed URLs |
| 2. Interface Dictionary and Language Control | `f3390e2` | `src/lib/i18n/dictionary.ts` (flat keys, `id` typed against `en`, key-set parity test), ~70 strings per language moved off literals, the control on every page, `NEXT_LOCALE` written only by the toggle, a source scan that fails if a literal creeps back |
| 3. Locale Metadata, Alternates and Feed | `c1b83e6` | `buildPageMetadata` (self-referencing canonical, reciprocal `en`/`id`/`x-default`, `og:locale`), sitemap entries with hreflang, `/en/feed.xml` + `/id/feed.xml`, `/feed.xml` → 308 |
| 4. Content Localization | `dfcede1` | `Genres`/`Tags`/`MoodTags` names, `ReadingLists` title+description and `Reviews` title localized, two generated migrations with an English backfill, `requireDefaultLocaleValue`, the slug guard |
| 5. Pre-rendering and Track Verification | `5a5031a` | Pre-rendering proved, an accessibility spec that measures rendered contrast and drives the control by keyboard, bundle measurement, the AC sweep |
| R1. Review fixes | `c33af4b` | Navbar links prefixed, the migration batch made reversible, a localized title proved end to end, dotted slugs, a docstring |
| R2. Review fixes | `6450256` | The sibling migration's `down()` made honest, the fixture heals the Indonesian body it cannot trust |
| R3. Review fixes | `3d7a1eb` | The rich-text blank check restored, types regenerated with the render guarded, the healing widened to every review the suite translates |
| R4. Review fixes | `00653de` | A body made only of an atomic leaf counts as content |

## Requirements

- [x] FR-1 path locales (`/en`, `/id`), unprefixed admin/api/robots/sitemap, 307 for bare public paths
- [x] FR-2 remembered choice, written only by the toggle, never by following a share link
- [x] FR-3 control on every page, preserving slug, depth and query
- [x] FR-4 one typed dictionary with identical key sets
- [x] FR-5 `<html lang>`, localized metadata, `og:locale`, self-referencing canonical
- [x] FR-6 reciprocal `en`/`id`/`x-default` hreflang on every page
- [x] FR-7 `?locale=` permanently redirected, other params preserved
- [x] FR-8 sitemap lists both locales with alternates, English `x-default`
- [x] FR-9 `/en/feed.xml` and `/id/feed.xml`, `/feed.xml` → 308, the active feed advertised
- [x] FR-10 localizable taxonomy, reading lists and review titles, empty → English, never blank
- [x] FR-11 locale normalized on every public read, unsupported segment 404
- [x] FR-12 detail pages pre-render per locale
- [x] NFR-1 accessible control (measured contrast, keyboard, `lang`, not colour alone)
- [x] NFR-2 no dictionary copy in the client bundle
- [x] NFR-3 SEO correctness
- [x] NFR-4 pure, tested helpers
- [x] NFR-5 reversible, additive migrations that keep the English text
- [x] NFR-6 Next 16 conventions (`proxy.ts`)

## Verification

| Layer | Command | Result |
| --- | --- | --- |
| Unit | `bun test` | 524 pass / 0 fail, 42 files |
| Coverage | `bun test --coverage` | 79.91 % funcs / 89.32 % lines; every new module 100 % except one at 91.49 % |
| Lint | `bun run lint` | 220 files, no findings |
| Typecheck | `bun run typecheck` | no errors in 228 files |
| Build | `bun run build` | production build, 25/25 static pages |
| E2E | `bun run test:e2e` | 95 passed / 0 failed / 0 skipped (3.1 m) |

The browser suite runs against a production standalone build and its own database, and the
translation provider is stubbed offline, so the locale specs need no credentials.

## Review

`PASS WITH FINDINGS`, 4 rounds, 11 findings fixed, 0 deferred:

- **Round 1** caught two real defects: the navbar still linked to unprefixed paths, so a reader who
  arrived through a shared `/id/...` link was silently thrown back to English on the first click; and
  the first migration's `down()` could never run, which meant the track had no rollback.
- **Round 2** caught the sibling migration with the same defect, and an assertion that could not fail.
- **Round 3** caught the side effect of its own fix: relaxing `required` on the body dropped the rich
  text validation, so a textless review could be saved.
- **Round 4** caught that the replacement check rejected a body whose only content was an image.

All four are fixed and pinned by tests.

## Deviations and risks

- **The authoring contract changed.** A localizable value must exist in the default locale; any other
  locale may be empty and falls back. That is enforced by `requireDefaultLocaleValue` rather than
  Payload's `required`, because `required` on a localized field demands a value in *every* locale and
  would make the translation pipeline's Indonesian write impossible. `reviewContent` now generates as
  `string | null` and its single render site is guarded.
- **Two migrations, one with a hand-written backfill.** They were generated with
  `payload migrate:create`; the only hand-written SQL copies each existing English value into the new
  locale tables before the English columns are dropped, following the precedent of
  `20251214_135240`. Reviewers should read that block.
- **`/feed.xml` is a 308** to the English feed; the proxy passes it through so exactly one layer
  answers.
- **The 404 body stays English.** `not-found.js` receives no props and reading the locale cookie
  there would turn every locale route dynamic.
- **`/[locale]/reviews` remains dynamic** because it reads `searchParams` for filters (pre-existing).
- **Local dev databases** created before this track cannot build (`column reviews_locales.title does
  not exist`) until they are rebuilt with `payload migrate:fresh` or one dev-mode push; CI and the e2e
  database migrate clean.
- **NFR-2 has no baseline.** No pre-track bundle measurement exists, so the guarantee is an absolute
  measurement plus proof that no dictionary string reaches a chunk, held by a pinned ceiling.

## Follow-ups

- Localize the 404 body once a locale signal can reach the root boundary without making routes
  dynamic.
- Record a bundle baseline so later tracks can report a delta.
- Prove `payload migrate:down` end to end through the CLI (the rollback itself is proven by invoking
  both `down()`s on a scratch database).
- Localize comments and bylines, and give genres and tags their own landing pages.

## Rollback

`git revert` the squashed merge. The route move, the proxy, the dictionary and the per-locale feeds
all revert with the code; the two migrations' `down()`s restore the English values and drop the locale
tables (proven on a scratch database holding a deliberately blank Indonesian name). Reverting
restores `?locale=id` behaviour and the English-only interface.
