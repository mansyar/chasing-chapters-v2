# Content Typography & Reading Experience — Specification

Requirement IDs in this document are stable. Once approved, they are never
renumbered: a requirement that no longer applies is marked `Withdrawn`, so
review findings and plan tasks can reference IDs without them drifting.

## Overview

All eight `prose` class usages across the public site are inert:
`@tailwindcss/typography` was never installed (verified absent from
`node_modules` and from `globals.css`, which has no `@plugin` directive), so
the long-form text that is the product's core surface — the review body —
renders as undifferentiated paragraphs with no heading, list, blockquote or
link styling. Alongside that defect sit four hand-rolled star-rating
renderers with no accessible name, `BreadcrumbList` JSON-LD with no visible
component, no previous/next navigation on the review detail page, and three
card renderings with two visual languages.

This track installs and themes real typography, and delivers the
reading-experience pieces on the pages readers actually land on: the review
detail page and the reading-list detail page.

## Problem / Motivation

Verified against `main@46a9d32`:

- `prose` appears at 8 sites and resolves to no styles:
  `src/app/(public)/[locale]/reviews/[slug]/page.tsx:323,336,347,358`,
  `src/app/(public)/[locale]/about/page.tsx:58`,
  `src/app/(public)/[locale]/reviews/[slug]/loading.tsx:57`,
  `src/components/FeaturedHero.tsx:83`,
  `src/components/ModernBookCarousel.tsx:136`. The review body, the three
  structured sections and the about page therefore render without typographic
  hierarchy.
- Star ratings are rendered inline four times with different sizes and no
  accessible name: `FeaturedHero.tsx:59-71`,
  `ModernBookCarousel.tsx:112-124`, `ReviewCard.tsx:51-63`,
  `reviews/[slug]/page.tsx:246-257`. A screen reader user cannot tell what
  rating a review carries.
- `BreadcrumbList` JSON-LD already exists
  (`reviews/[slug]/page.tsx:196-206`,
  `reading-lists/[slug]/page.tsx:130-143`) but no reader sees a breadcrumb.
- Three card renderings exist with overlapping markup:
  `ReviewCard.tsx:33`, `ReadingListCard.tsx:46`, and an inline variant at
  `reading-lists/page.tsx:92-118`.
- The three structured sections hardcode Tailwind palette colours
  (`reviews/[slug]/page.tsx:332-339` green, `:343-350` orange, `:354-361`
  blue) against the teal oklch token set defined in
  `src/app/globals.css:68-165`. They ignore the design system and render
  wrong in dark mode.

If unsolved: every review page — the reason the site exists — keeps rendering
as a wall of undifferentiated text, ratings stay invisible to assistive
technology, and the component duplication keeps growing with each new
surface.

## Goals & Success Metrics

- **Goal:** long-form text renders with typographic hierarchy on every review
  detail page, in both locales and both themes.
  **Metric:** the `@plugin` directive present in `globals.css`, and every
  current `prose` usage either styled or deliberately replaced.
- **Goal:** one `StarRating` component replaces all four inline renderers.
  **Metric:** exactly one component; four call sites; the rating announced as
  "Rated N out of 5".
- **Goal:** visible breadcrumbs on both detail pages, consistent with the
  existing JSON-LD. **Metric:** breadcrumbs rendered on review detail and
  reading-list detail, matching their `BreadcrumbList` entries.
- **Goal:** previous/next navigation on review detail.
  **Metric:** adjacent published reviews linked by `publishDate`; links
  absent at both boundaries and on draft previews.
- **Goal:** two card components instead of three renderings.
  **Metric:** the reading-lists index renders `ReadingListCard`; the inline
  variant is gone.
- **Goal:** zero new client-side JavaScript on the review detail page.
  **Metric:** no new `"use client"` directive introduced by this track.

## Scope

### In Scope

- Install `@tailwindcss/typography` and register it via `@plugin` in
  `globals.css`, themed to the site's own token set (teal oklch palette,
  serif body) rather than plugin defaults.
- Dark-mode correctness for prose and for the structured sections' colours.
- Typographic treatment of the review detail page: the rich-text body, the
  three structured sections, and favorite quotes.
- A shared read-only `StarRating` component with size variants, replacing
  all four inline renderers.
- Visible breadcrumbs on review detail and reading-list detail, reusing the
  existing dictionary keys.
- Previous/next navigation on review detail ordered by `publishDate`.
- Card consolidation: `ReviewCard` and `ReadingListCard` share one base
  card; the reading-lists index uses `ReadingListCard`.
- Removal of dead code the consolidation orphans.

### Out of Scope

- Hero excerpt and carousel excerpt styling — they keep their clamped
  look; their `prose` classes are removed deliberately (see Edge Cases).
- Motion and assistive behaviour — carousel autoplay, marquee, reduced-motion
  support belong to a separate accessibility track.
- Search, footer navigation, and the misleading "Write a Review" nav label.
- Locale-blind OG images and the sitemap `lastModified` behaviour.
- `src/components/ui/avatar.tsx` and the unused Radix Avatar dependency —
  pre-existing dead code, not orphaned by this track.
- Any database migration, schema change, or API change.
- Any content or translation change — typography and structure only.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | `@tailwindcss/typography` is installed and registered via `@plugin` in `src/app/globals.css`, themed to the site's token set; every current `prose` usage either renders styled text or is replaced with a deliberate non-prose class | must |
| FR-2 | Prose is dark-mode correct: `dark:prose-invert` plus token-driven overrides so links, blockquotes, code and inline elements meet contrast in dark mode | must |
| FR-3 | The three structured sections use design tokens instead of hardcoded palette colours, and hold contrast in dark mode | must |
| FR-4 | A shared read-only `StarRating` component with size variants is used at all four current call sites and announces "Rated N out of 5" to screen readers | must |
| FR-5 | Visible breadcrumbs render on review detail (Home / Reviews / title) and reading-list detail (Home / Reading Lists / title), consistent with the existing `BreadcrumbList` JSON-LD | must |
| FR-6 | Previous/next navigation on review detail links to the adjacent published reviews ordered by `publishDate` (ties broken by slug ascending); links are absent at both boundaries and suppressed on draft previews | must |
| FR-7 | `ReviewCard` and `ReadingListCard` share one base card; the reading-lists index renders `ReadingListCard`; no inline variant remains | must |
| FR-8 | Dead code the consolidation orphans is removed — unused `card.tsx` exports and any export this track's changes leave without an importer | should |
| FR-9 | Every new user-facing string exists in both the `en` and `id` dictionaries | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | No new client-side JavaScript boundary: `StarRating`, breadcrumbs and prev/next are server components with no `"use client"` directive; where existing client components (`FeaturedHero`, `ModernBookCarousel`) render `StarRating`, it ships inside their existing bundles |
| NFR-2 | No LCP or CLS regression: typography is CSS-only, and prose margins on above-the-fold content must not introduce layout shift |
| NFR-3 | No schema change, no migration, no API change |
| NFR-4 | No new runtime dependency beyond `@tailwindcss/typography` (a build-time plugin); no dependency removals |
| NFR-5 | Existing tests pass; component tests are updated where rendering changes; no existing test is deleted or weakened |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | A source-level test asserts the `@plugin "@tailwindcss/typography"` directive exists in `globals.css` and the dependency is present in `package.json` | FR-1 |
| AC-2 | A source-level test asserts no hardcoded Tailwind palette colour classes remain in the review detail page's structured sections | FR-3 |
| AC-3 | `StarRating` is covered by tests covering its size variants, full and empty rendering at 5 and 1, and its accessible label; all four former call sites use it | FR-4 |
| AC-4 | Breadcrumbs render with correct hrefs and labels on both detail pages and are absent on draft previews | FR-5 |
| AC-5 | Prev/next links point at the correct adjacent reviews, are absent at both boundaries, and are absent on draft previews | FR-6 |
| AC-6 | The reading-lists index renders `ReadingListCard`; no inline card variant remains in that file | FR-7 |
| AC-7 | The dictionary parity test passes with every new key present in both `en` and `id` | FR-9 |

## Edge Cases

- **Plugin activation lights up all eight `prose` sites at once**, not just
  the detail page. The hero excerpt (`FeaturedHero.tsx:83`), the carousel
  excerpt (`ModernBookCarousel.tsx:136`) and the skeleton
  (`loading.tsx:57`) use `prose` together with `line-clamp` for a clamped
  look; once the plugin is active they would render with prose margins and
  sizing. Each must be switched to deliberate non-prose clamped styling.
- **Equal `publishDate`**: two reviews published the same day — the
  slug-ascending tiebreak keeps prev/next deterministic.
- **Missing structured fields**: a review with no `whatILoved`,
  `whatCouldBeBetter` or `perfectFor` leaves that section absent (existing
  behaviour); the tokenized colours must not appear for absent sections.
- **Long titles** in breadcrumbs wrap or truncate without breaking the
  layout.
- **Ratings at the extremes**: 5 and 1 render full and empty correctly in
  every size variant.
- **Draft previews** already render a banner; navigation that points at the
  public archive or at published neighbours must not appear there.
- **The about page keeps `prose`** — it is long-form and benefits from the
  plugin's styles once they exist.

## Dependencies

- **Tracks:** none.
- **External:** `@tailwindcss/typography` from the npm registry (build-time
  plugin).

## Open Questions & Assumptions

- **Assumption:** `publishDate` ties are broken by slug ascending. The
  reviews index sorts by `publishDate` descending only; a deterministic
  tiebreak is needed for adjacency, and slug ascending is stable.
- **Assumption:** `src/components/ui/avatar.tsx` and the unused Radix Avatar
  dependency are neither adopted nor removed in this track. They are
  pre-existing dead code not orphaned by any change here; removing a
  dependency is a separate decision.
- **Assumption:** the about page keeps `prose` treatment.
- **Assumption:** the "Home" crumb reuses the existing
  `breadcrumbHome`/`navReviews`/`navReadingLists` dictionary keys
  (`Home`/`Beranda` etc. verified present in both locales), so the only new
  keys are the prev/next labels.
- **Assumption:** no content, translation or metadata changes are needed —
  typography and structure only.

## References

- `src/app/(public)/[locale]/reviews/[slug]/page.tsx` — body, structured
  sections, ratings, JSON-LD, preview branch
- `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx` — JSON-LD
- `src/app/(public)/[locale]/reading-lists/page.tsx` — inline card variant
- `src/components/ReviewCard.tsx`, `src/components/ReadingListCard.tsx`
- `src/components/FeaturedHero.tsx`, `src/components/ModernBookCarousel.tsx`
- `src/components/reviews/RelatedReviews.tsx`
- `src/app/globals.css` — token definitions
- `src/lib/i18n/dictionary.ts` — existing keys
- `src/lib/publish-visibility.ts` — `publishedAndVisibleWhere`
- `docs/pagespeed-optimization.md` — LCP context
