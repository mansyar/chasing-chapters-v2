# Bilingual Site Experience — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

Make Chasing Chapters genuinely bilingual for readers. Today the site's
Indonesian half is five translated fields on one page: the language toggle lives
only on the review detail route, it is carried in a query parameter that no other
page reads, `<html lang>` always says English, page metadata is always English,
the sitemap has no Indonesian entries, and every piece of interface text is
hardcoded English. This track moves the locale into the URL (`/en/...`,
`/id/...`), gives every public page a translated interface from one typed
dictionary, makes metadata, canonical links, hreflang and the feed
locale-correct, and lets authors supply Indonesian names for genres, tags, mood
tags, reading lists and — optionally — review titles.

## Problem / Motivation

A reader who switches to Indonesian gets an Indonesian review body inside an
English page. If they navigate anywhere else, the language is silently lost,
because `src/components/reviews/LanguageToggle.tsx` reads and writes
`?locale=` on the current path only, and no other page reads that parameter.
Worse for discoverability: `src/app/(public)/reviews/[slug]/page.tsx:36-38`
gives `generateMetadata` only `params`, so an Indonesian page ships an English
`<title>`, an English description, and a `canonical` that points at the English
URL (`:70`) — telling search engines the Indonesian page is a duplicate.
`<html lang="en">` is hardcoded at `src/app/(public)/layout.tsx:45`, so screen
readers and crawlers are told Indonesian content is English.
`src/app/(public)/reviews/[slug]/page.tsx:117` also passes the raw query string
into Payload (`locale: locale as "en" | "id"`), so `?locale=ID` or `?locale=fr`
reaches the database unchecked.

The same shortfall applies to content labels: `localized: true` appears in
exactly one collection (`Reviews`, five body fields), so Indonesian readers see
English genre chips, English tag filters, English reading-list titles and
descriptions. The product definition calls the site **Bilingual**
(`conductor/product.md:14`); at the reader's end it currently is not.

Because the review page reads `searchParams` it is rendered dynamically on every
request, while `/reading-lists/[slug]` — which reads no query parameters — is
pre-rendered. Moving the locale into the path removes that pressure and lets both
detail routes pre-render per locale.

If this is not solved, the site keeps publishing Indonesian content nobody can
find, and every new interface string has to be translated twice by hand.

## Goals & Success Metrics

- **Goal:** A reader can read the entire public site in Indonesian — URL,
  interface, content labels, metadata and feed — and a crawler sees two
  correctly marked up languages instead of one English site with a query string.
- **Metric:** Every public route responds under both `/en` and `/id`; the
  dictionary key sets are identical; the sitemap lists both locales with
  reciprocal hreflang; the browser suite covers the toggle persisting across
  navigation; and no public component contains a hardcoded English literal.

## Scope

### In Scope

- Path-based locales: every public page under `/en` and `/id`, with `/` and
  bare legacy paths resolving to a remembered preference (English by default).
- A remembered language choice (cookie) set by the toggle.
- A typed, server-rendered interface dictionary covering all public chrome,
  including the About page.
- Locale-correct `<html lang>`, page metadata, `og:locale`, canonical and
  hreflang alternates on every public page.
- 301 redirects for the `?locale=` URLs that exist in the wild today.
- Per-locale RSS, one sitemap listing both locales with alternates.
- Localized taxonomy fields — `Genres`, `Tags`, `MoodTags`, `ReadingLists`
  (title + description) and optional `Reviews` title — entered by authors, with
  English fallback when empty.
- Locale-aware Payload reads on every public query, with normalization.
- Updating the browser suite for the new URLs and adding focused Indonesian
  coverage.

### Out of Scope

- Machine translation of taxonomy names, reading-list descriptions or review
  titles. Authors enter them; the pipeline stays scoped to review bodies.
- Translating reader-generated content (comments) or author bylines.
- Localized URL segments for content (`/id/reviews` is required; `/id/ulasan`
  is not).
- Additional locales beyond `en` and `id`, or a locale switcher in the admin.
- Reworking the sitemap's `lastModified` values or adding genre/tag landing
  pages — separate discovery work.
- The public `?locale=` behaviour as a supported long-term interface (it is
  redirected, not maintained).

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Every public page is served under a locale segment: `/en/...` and `/id/...`. Requests to an unprefixed public path redirect to the remembered locale, defaulting to English. Admin (`/admin`), API (`/api`), `/robots.txt` and `/sitemap.xml` stay unprefixed. | must |
| FR-2 | A reader's locale choice is remembered in a cookie (one year, `SameSite=Lax`). A first visit resolves to English. The cookie is written only when the reader uses the toggle, so following a shared `/id/...` link does not silently change their preference. | must |
| FR-3 | A language control is available on every public page. Activating it switches the current page to the other locale while preserving the rest of the URL — slug, path depth and query parameters such as `?sort=` or `?q=`. | must |
| FR-4 | All public interface text comes from a typed dictionary with `en` and `id` entries: navigation, footer, home sections, review browse (filters, sort, pagination, empty states), review detail labels, reading lists, comments, search, not-found, and the About page. Both dictionaries expose an identical key set. | must |
| FR-5 | `<html lang>` reflects the active locale on every public page, and each page's metadata is locale-correct: localized title/description where the text is ours, `og:locale` (`en_US` / `id_ID`), and a self-referencing canonical for the active locale. | must |
| FR-6 | Every public page emits reciprocal hreflang alternates for `en`, `id` and `x-default` (English), and the alternate URLs are the path-based locale URLs. | must |
| FR-7 | A public URL carrying the legacy `?locale=id` or `?locale=en` permanently redirects to the same page under that locale's path, preserving all other query parameters. | must |
| FR-8 | `/sitemap.xml` lists every public page in both locales and carries hreflang alternates per entry, with English as `x-default`. | must |
| FR-9 | RSS is served per locale at `/en/feed.xml` and `/id/feed.xml` with a matching `language` and link; `/feed.xml` permanently redirects to `/en/feed.xml` so existing subscribers keep working; the layout advertises the active locale's feed. | must |
| FR-10 | `Genres`, `Tags` and `MoodTags` names, `ReadingLists` title and description, and the review `title` are localizable. An empty Indonesian value falls back to the English value; a localized value is never rendered blank. | must |
| FR-11 | Every public Payload read passes a normalized locale. An unsupported locale segment returns 404 rather than silently rendering English. | must |
| FR-12 | Review and reading-list detail pages pre-render per locale instead of rendering dynamically on every request. | should |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Accessibility: the language control exposes its state and target to assistive technology (`aria-pressed` or equivalent, an accessible group name, and `lang` on the locale labels); no page mixes unmarked languages in its document metadata; the new control meets WCAG 2.2 AA focus and contrast. |
| NFR-2 | Performance: dictionary text is resolved on the server so it adds no client bundle; the public client bundle must not grow materially; pre-rendered detail pages stay pre-rendered (FR-12). |
| NFR-3 | SEO correctness: canonical is always self-referencing for the active locale, hreflang pairs are reciprocal and absolute, and no locale state lives in a query string after FR-7. |
| NFR-4 | Testability: locale resolution and locale-aware path building are pure functions with unit tests; dictionary key parity is enforced by a test, not by review. |
| NFR-5 | Migration safety: the localization changes are additive, existing English content is untouched, and no destructive database migration is introduced. Existing English URLs and RSS subscribers keep working through redirects. |
| NFR-6 | Platform currency: implementation follows the Next.js 16.4 conventions installed in this repo — `proxy.ts` (the `middleware` file convention is deprecated), the installed i18n guidance, and a layout structure that supports per-locale `<html lang>`. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | `/en`, `/id` and a deep link such as `/id/reviews/<slug>` all render, while `/fr/...` returns 404 and `/reviews` redirects to a locale-prefixed URL. | FR-1, FR-11 |
| AC-2 | Toggling the language then visiting `/` lands on the toggled locale, and the cookie survives a new browser session; following a direct `/id/...` link does not change the stored preference. | FR-2 |
| AC-3 | Toggling language on `/en/reviews?sort=title&page=2` lands on `/id/reviews?sort=title&page=2`. | FR-3 |
| AC-4 | Every public page renders its interface in Indonesian at `/id/...`, and a test proves the `en` and `id` dictionaries have identical key sets. | FR-4 |
| AC-5 | `/id/reviews/<slug>` serves `<html lang="id">`, Indonesian metadata, a self-referencing canonical and `og:locale: id_ID`; `/en/...` serves the English equivalents. | FR-5 |
| AC-6 | Each public page's HTML contains reciprocal `hreflang` links for `en`, `id` and `x-default`, each pointing at the path-based URL. | FR-6 |
| AC-7 | `/en/reviews/<slug>?locale=id&sort=title` redirects permanently to `/id/reviews/<slug>?sort=title`. | FR-7 |
| AC-8 | `/sitemap.xml` contains both locale variants of a review URL with `alternates.languages`, and `/feed.xml` redirects to `/en/feed.xml` while `/id/feed.xml` declares Indonesian. | FR-8, FR-9 |
| AC-9 | With an Indonesian genre name and reading-list description set, `/id/...` renders them; with the Indonesian value cleared, the English value is rendered instead of a blank. | FR-10 |
| AC-10 | Review and reading-list detail routes build as pre-rendered (not dynamically rendered) in the production build output. | FR-12 |
| AC-11 | The browser suite passes with locale-explicit URLs and includes Indonesian coverage for the toggle, translated chrome and locale metadata. | FR-1, FR-3, FR-4, FR-5 |

## Edge Cases

- A reader with no cookie who opens `/` gets English, and the URL becomes `/en`.
- A reader with a stale or malformed cookie value falls back to English rather
  than erroring.
- A shared link to `/id/...` from a reader whose preference is English renders
  Indonesian once without rewriting the preference.
- The toggle on a filtered or paginated page preserves the query string; it must
  not drop `?q=`, `?genre=`, `?sort=` or `?page=`.
- A review whose Indonesian body is empty still falls back to English content
  (existing Payload behaviour) while its interface is Indonesian.
- A taxonomy value translated in English only renders English in both locales.
- Admin and API paths never gain a locale prefix and never redirect.
- `/feed.xml` keeps working for existing subscribers.
- The e2e fixture's taxonomy and reviews are seeded with Indonesian values where
  a spec asserts them, otherwise the assertion is on fallback.
- Serving the standalone build after the restructure must keep the asset copy
  step working.

## Dependencies

- **Tracks:** none. The translation pipeline and the e2e harness are merged.
- **External:** none new. The existing Postgres and Redis are the only services;
  no additional credentials or APIs are required.

## Open Questions & Assumptions

- **Assumption:** the root layout (`src/app/layout.tsx`) is a metadata-only
  pass-through and `src/app/(public)/layout.tsx` owns `<html>`, so the public
  HTML shell can move one level down into a locale segment while the admin keeps
  its own root layout. Verified in the repository.
- **Assumption:** `src/proxy.ts` is the Next.js 16.4 file convention for
  redirects (`middleware.ts` is deprecated in this version). Verified in the
  installed documentation.
- **Assumption:** Payload's `fallback: true` already resolves an empty localized
  field to the default locale, so FR-10's fallback needs configuration rather
  than custom rendering logic.
- **Assumption:** the completion bar is a green local run of the configured
  verification plus the production build and the browser suite; CI re-runs it on
  the pull request.
- **Assumption:** the About page copy is static JSX, so translating it is a
  dictionary entry rather than a CMS change.

## References

- `conductor/product.md:14` — the Bilingual product pillar.
- `src/components/reviews/LanguageToggle.tsx` — the current query-param toggle.
- `src/app/(public)/reviews/[slug]/page.tsx:36-38,70,111-117` — metadata,
  canonical and the raw locale cast.
- `src/app/(public)/layout.tsx:45` — hardcoded `<html lang="en">`.
- `src/app/sitemap.ts:28-35` — reading lists and the missing locale variants.
- `src/app/feed.xml/route.ts` — the single English feed.
- `src/collections/Reviews.ts` — the only collection with `localized: true`.
- `node_modules/next/dist/docs/01-app/02-guides/internationalization.md` — the
  installed routing guidance.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  — `proxy.ts` replaces `middleware.ts` in Next.js 16.
