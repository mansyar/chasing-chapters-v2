# Phase 3 verification — bilingual site experience

| | |
|---|---|
| Track | `20261023-bilingual-site-experience` |
| Phase | 3 of 5 — locale-correct document, metadata, sitemap and RSS |
| Date | 2026-10-24 |
| Branch | `feat/20261023-bilingual-site-experience` |
| Base | `b90c7ef` |
| Head | `1dc5372` |
| Result | **pass** — typecheck, lint, 497 unit tests and 70 e2e specs green |

## Commands

Run exactly as the brief asks: `bun run typecheck && bun run lint && bun test && bun run test:e2e`.

| Command | Exit | Result |
|---|---|---|
| `bun run typecheck` | 0 | `✓ No type errors in 222 files` |
| `bun run lint` | 0 | `Checked 216 files. No fixes applied.` |
| `bun test` | 0 | `497 pass, 0 fail, 1127 expect() calls, 41 files` (4.3 s) |
| `bun run test:e2e` | 0 | **70 passed** (2.5 m), incl. the 14 new `locale-metadata` specs |

The unit run's `[Translation]` / `[TranslationLock]` / `[RateLimit]` stacks are the
pre-existing failure-path noise described in the brief; nothing failed.

`test:e2e` rebuilt the app from scratch (`next build --webpack`: 963 ms config, 58 s
compile, 2.4 s TypeScript, 62 s for 25 static pages) and served the standalone
artifact on port 3100 against the `chasing-chapters_e2e` database.

## Acceptance criteria

| AC | What it requires | Proven by |
|---|---|---|
| AC-5 | `/id/reviews/<slug>` renders `lang=id` with Indonesian metadata, a self-referencing canonical and `og:locale=id_ID`; `/en` the mirror | `e2e/locale-metadata.spec.ts` — *declares the document language per locale*, *canonicalizes each review page to its own locale*, *describes the Indonesian review page in Indonesian* (exact Indonesian description + `id_ID` + `en_US` alternate), *describes the English review page in English* |
| AC-6 | `hreflang` en/id/`x-default` on each page, pointing at path-based URLs | `e2e/locale-metadata.spec.ts` — *emits reciprocal hreflang alternates from both locales* (loops over `/en` and `/id`, asserts all three links each time), *keeps the browse page's alternates on the path, not the query*, *localizes the static About page*. Unit layer: `src/lib/seo/__tests__/metadata.test.ts` → *advertises the same reciprocal set from either locale* |
| AC-8 | Sitemap lists both variants with `alternates.languages`; `/feed.xml` 308s to `/en/feed.xml`; `/id/feed.xml` declares Indonesian | `e2e/locale-metadata.spec.ts` — *redirects the pre-locale feed to English permanently* (308 + `Location`), *serves the Indonesian feed with Indonesian item text* (`<language>id</language>`, self link, `/id/reviews/` href, Indonesian excerpt), *lists every fixture review in both locales with hreflang*, *lists both locales of the static pages and the reading list*. Unit layer: `src/lib/seo/__tests__/sitemap.test.ts`, `src/lib/__tests__/feed.test.ts` |

Supporting requirements:

| Requirement | Implementation | Test |
|---|---|---|
| FR-5 localized `title`/`description`, `og:locale`, self canonical | `src/lib/seo/metadata.ts` (`buildPageMetadata`), dictionary keys `meta*` in `src/lib/i18n/dictionary.ts`, `generateMetadata` on every public page | `metadata.test.ts` (*canonicalizes to the page's own locale*, *sets og:locale per locale*), e2e *declares the document language per locale* (localized home titles), *localizes the static About page* |
| FR-6 reciprocal hreflang | `localeLanguageAlternates` in `metadata.ts` | `metadata.test.ts`, e2e *emits reciprocal hreflang…* |
| FR-8 sitemap | `src/lib/seo/sitemap.ts` (`buildSitemapEntries`) + `src/app/sitemap.ts` | `sitemap.test.ts`, e2e sitemap specs |
| FR-9 per-locale feeds, 308, advertised feed | `src/lib/feed.ts` (`locale` option), `src/app/(public)/[locale]/feed.xml/route.ts`, `src/app/feed.xml/route.ts`, `alternates.types` in `metadata.ts`, `Footer` link | `src/lib/__tests__/feed.test.ts` (*declares the locale and links its own feed and items*, *localizes the channel title and description*, *normalizes an unsupported locale to English*), e2e feed specs |
| NFR-3 SEO correctness | absolute canonical + hreflang, no query in alternates, no locale in query | e2e *keeps the browse page's alternates on the path, not the query* |
| FR-11 (unchanged) | `[locale]/layout.tsx` guard still 404s an unsupported segment; feeds 404 too (`hasLocale`) | `e2e/locale-routing.spec.ts` `/fr/...` cases still green |

Where the 308 lives: **in the route handler** `src/app/feed.xml/route.ts`, and
nowhere else. `/feed.xml` stays in the proxy's `UNLOCALIZED_PATHS`, so the proxy
passes it through untouched and exactly one layer answers.

List pages with query state (`/reviews?q=…&genre=…&page=…`) advertise and
canonicalize the **path**, not the query: `buildPageMetadata` never receives
`searchParams`, and the e2e spec asserts `/en/reviews?sort=rating` still
canonicalizes to `https://chasing-chapters.com/en/reviews`.

## Route table (from the e2e build)

```
○ /_not-found
● /en                                  ● /id
● /en/about                            ● /id/about
● /en/feed.xml                         ● /id/feed.xml
● /en/reading-lists                    ● /id/reading-lists
● /en/reading-lists/e2e-fixture-rainy-season-reading-list
● /id/reading-lists/e2e-fixture-rainy-season-reading-list
● /en/reviews/nine-kinds-of-weather …  ● /id/reviews/nine-kinds-of-weather …
  (+ the other published fixture reviews × both locales)
ƒ /[locale]/reading-lists/[slug]/opengraph-image-9de6a
ƒ /[locale]/reviews
ƒ /[locale]/reviews/[slug]/opengraph-image-1v12u2
ƒ /admin/[[...segments]]
ƒ /api/[...slug]
ƒ /api/translation/bulk-retranslate
ƒ /feed.xml
○ /robots.txt
ƒ /sitemap.xml
ƒ Proxy (Middleware)
```

**No static page became dynamic.** Every `●` page in Phase 1 is still `●`, and the
new `● /en/feed.xml` / `● /id/feed.xml` are pre-rendered by `generateStaticParams`
with `revalidate = 3600`. The only additions to `ƒ` are the route handler
`/feed.xml` (a constant 308 with no `revalidate`, hence not cached as a static
response — it is a handler, not a page) and the pre-existing dynamic entries
(`/[locale]/reviews`, `/sitemap.xml`, admin, API). No page reads `cookies()` or
`headers()`.

## Metadata observed in the built HTML

Values below are the ones the new specs assert with `toHaveAttribute` against the
**built standalone server over HTTP** — i.e. read back out of the rendered
`<head>`, not transcribed from source. Host is `NEXT_PUBLIC_APP_URL`
(`https://chasing-chapters.com`) in `.env`, which the e2e build inherits.

| Page | Locale | `canonical` | `hreflang=en` | `hreflang=id` | `x-default` | `og:locale` | `og:locale:alternate` |
|---|---|---|---|---|---|---|---|
| `/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | en | `https://chasing-chapters.com/en/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | same as canonical | `https://chasing-chapters.com/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | `…/en/reviews/…` | `en_US` | `id_ID` |
| same review | id | `https://chasing-chapters.com/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac` | `…/en/reviews/…` | same as canonical | `…/en/reviews/…` | `id_ID` | `en_US` |
| `/reviews` (list) | en | `https://chasing-chapters.com/en/reviews` | same | `https://chasing-chapters.com/id/reviews` | `…/en/reviews` | `en_US` | `id_ID` |
| `/reviews` (list) | id | `https://chasing-chapters.com/id/reviews` | `…/en/reviews` | same | `…/en/reviews` | `id_ID` | `en_US` |
| `/about` (static) | en | `https://chasing-chapters.com/en/about` | same | `https://chasing-chapters.com/id/about` | `…/en/about` | `en_US` | `id_ID` |
| `/about` (static) | id | `https://chasing-chapters.com/id/about` | `…/en/about` | same | `…/en/about` | `id_ID` | `en_US` |

Localized titles confirmed in the same run:

| Page | en `<title>` | id `<title>` |
|---|---|---|
| `/` | `Book Reviews and Reading Lists \| Chasing Chapters` | `Ulasan Buku dan Daftar Bacaan \| Chasing Chapters` |
| `/about` | `About \| Chasing Chapters` | `Tentang \| Chasing Chapters` |

Book titles and author names stay in the source language, as specified — the review
detail title is the book title in both locales, while its **description** is
translated (`Read our review of … by … Rating: 5/5 stars.` /
`Baca ulasan … karya …. Rating: 5/5 bintang.`). The root layout's
`title.template` (`%s | Chasing Chapters`) is intact — both rows above go through
it.

Structured data (`src/lib/seo/structured-data.ts`) now takes a locale and emits
`inLanguage` on `WebSite`, `Review`, the reviewed `Book`, `BreadcrumbList` and
`ItemList`; its URLs (`@id`, `url`, search target, list items) are the locale's
own. The synthetic English `reviewBody` was **dropped** rather than translated:
the only text available for it was a hardcoded English sentence, so on an
Indonesian page it would have declared Indonesian content in English prose
(`src/lib/seo/__tests__/structured-data.test.ts` → *drops the synthetic review
body instead of shipping English prose*).

## Feeds

| URL | Status | `<language>` | Sample item link |
|---|---|---|---|
| `/feed.xml` | **308** → `/en/feed.xml` | — (redirect) | — |
| `/en/feed.xml` | 200 `application/rss+xml` | `en` | `https://chasing-chapters.com/en/reviews/e2e-fixture-the-lighthouse-keepers-almanac` |
| `/id/feed.xml` | 200 `application/rss+xml` | `id` | `https://chasing-chapters.com/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac` |

The Indonesian feed also asserts its own self link
(`https://chasing-chapters.com/id/feed.xml`) and that the item body is the
fixture's Indonesian text (`Buku Almanak Penjaga Mercusuar karya …`), which proves
the route's `payload.find` passes `locale` — the previous feed read English
content and served it under `<language>en</language>` from the one unprefixed URL.

Document discovery and the footer follow the active locale: `/id/reviews/<slug>`
emits `<link rel="alternate" type="application/rss+xml" href="…/id/feed.xml">`
and a footer link to `/id/feed.xml`.

## Sitemap

`src/app/sitemap.ts` keeps `dynamic = "force-dynamic"` and now runs both queries
with an explicit `_status = published` filter (the reading-list query had none),
then hands one `SitemapSource` per logical page to `buildSitemapEntries`, which
emits **one `<url>` per locale**, each carrying the full `alternates.languages`
set (`en`, `id`, `x-default` → English). Verified in the e2e run:

- all four fixture slugs (`…the-lighthouse-keepers-almanac`,
  `…salt-and-paper-lanterns`, `…the-cartographers-error` — `failed`,
  `…nine-kinds-of-weather` — `stale`) appear as both `/en/reviews/<slug>` and
  `/id/reviews/<slug>`, each with `hreflang` en/id and an English `x-default`;
- the static pages (`/en`, `/id`, `/en/about`, `/id/about`, `/en/reviews`,
  `/id/reviews`, `/en/reading-lists`, `/id/reading-lists`) and both locales of the
  fixture reading list are present.

## Deviations

| File | Why |
|---|---|
| `src/components/layout/Footer.tsx` | Outside `Touches`; the footer names the feed, so it needed the active locale. Took a `locale: Locale` prop and links `localizePath("/feed.xml", locale)` instead of the hardcoded `/feed.xml`. |
| `src/app/not-found.tsx` | Outside `Touches`; one line, required by the new `Footer` prop (`locale={DEFAULT_LOCALE}`), so the root 404 keeps its English shell. |
| `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts` | Outside `Touches`; the review hook's single `safeRevalidatePath("/feed.xml")` became the per-locale set (it now revalidates `/en/feed.xml` and `/id/feed.xml`), matching the new feed routes. |
| `src/app/layout.tsx` | In `Touches`, but note the root feed discovery moved from `/feed.xml` to `/en/feed.xml` — the root layout cannot know the locale, so it advertises the English feed and every page overrides it per locale. |

## Notes for the primary

- **P3.T1 and P3.T2 share one commit** (`b34da64`). A single helper,
  `buildPageMetadata`, produces the canonical, the hreflang set, `og:locale` and
  the feed link together; splitting them would have produced an intermediate
  commit whose pages advertise no alternates. Task 3 landed in `ffe7897`
  (sitemap + feeds) and `1dc5372` (e2e).
- The dictionary grew a `Document metadata and feeds` section (24 keys, both
  languages), including `browseItemListName` and `breadcrumbHome` so the
  `ItemList` and breadcrumb names are translated rather than hardcoded.
  `dictionary-source.test.ts` is untouched and green; no `"use client"` file
  value-imports the dictionary.
- `Footer` now *requires* `locale`, so any future caller must pass one —
  `[locale]/layout.tsx` passes the active locale, `src/app/not-found.tsx` passes
  `DEFAULT_LOCALE`.
- The 404 pages still carry the root layout's English `og:locale` unless the
  locale shell overrides it; `buildLocaleShellMetadata` handles that per locale,
  but a genuinely localized 404 body is still Phase 5 debt (as recorded in
  Phase 2).
- Still outstanding for Phase 4: `RelatedReviews` omits `locale` in its
  `payload.find`, so related reviews are read from the default locale.

## Primary verification

Re-run by the primary on the same tree, after the phase reported, before acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | `No type errors in 222 files` |
| `bun run lint` | 0 | `Checked 216 files. No fixes applied.` |
| `bun test` | 0 | **497 pass / 0 fail**, 41 files |
| `bun run test:e2e` | 0 | **70 passed (2.0m)**, 0 failed, 0 skipped |
| configured phase command | 0 | as above |

**Diff against Touches.** `b90c7ef..HEAD` is 26 paths, all inside Touches, plus the
four deviations the phase reported: `src/components/layout/Footer.tsx` (the footer
names the feed, so it needs the active locale to link `/<locale>/feed.xml`),
`src/app/not-found.tsx` (one line, forced by `Footer`'s new required `locale`),
and `src/hooks/revalidatePages.ts` + its test (the single `/feed.xml` revalidation
became the per-locale set). All four are the direct consequence of FR-9 and none
widens scope; accepted. No unreported file.

**Checked in the code, not the report.**

- `src/app/feed.xml/route.ts` is now a 15-line handler returning a bare
  `308` with `Location: /en/feed.xml`, and it is the *only* place that answers
  that path — `/feed.xml` stays in the proxy's pass-through list, so no second
  redirect layer competes with it (FR-9).
- `src/lib/seo/metadata.ts` makes the metadata claims structural rather than
  per-page: `buildPageMetadata` derives canonical and alternates from
  `absoluteLocaleUrl`/`localeLanguageAlternates`, so a page cannot ship a
  canonical pointing at the other locale, and `x-default` is English by
  construction (FR-5, FR-6). The previous review page's canonical was already
  locale-scoped, so this replaced hand-written blocks rather than fixing one
  page only.
- `src/lib/seo/sitemap.ts` emits one entry per locale with the full
  `alternates.languages` map on each, and `src/app/sitemap.ts` now filters the
  reading-list query by `_status = published` — a gap that predates this track
  and would have published drafts to crawlers once the list pages became
  per-locale (FR-8).
- `generateReviewSchema`/`generateWebSiteSchema` take the locale and emit
  `inLanguage` with locale-scoped `@id`s and URLs, and the synthetic English
  `reviewBody` is gone rather than translated. Agreed: emitting
  "Read our comprehensive review of …" on an Indonesian page would describe the
  page in the wrong language, while rating, book and author carry the same
  structured meaning (NFR-3).
- Route table: every page that was `●` in Phase 1 and Phase 2 is still `●`,
  `/en/feed.xml` and `/id/feed.xml` are pre-rendered via `generateStaticParams`
  with `revalidate = 3600`, and the only new `ƒ` entry is the redirect handler.
  Nothing became dynamic, so FR-12 and NFR-2 still hold.
- `dictionary-source.test.ts` is untouched and green, so AC-4's guard still
  covers the twenty-four new metadata keys.

Deviations accepted as reported.

Squashed `b34da64..1dc5372` into one phase commit.
- `src/app/(public)/[locale]/reviews/page.tsx` remains `ƒ` (it reads
  `searchParams`); that predates this phase and is not a regression from the
  metadata work.
