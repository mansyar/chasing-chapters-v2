# Bilingual Site Experience — Implementation Plan

> **Branch:** `feat/20261023-bilingual-site-experience`
> **Base:** `main` @ `98351d5`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Locale Routing Foundation

- **Goal:** Every public page is served under `/en` or `/id`, unprefixed paths and the legacy `?locale=` parameter redirect to a path-based URL, and unsupported locales 404.
- **Depends on:** none
- **Covers:** FR-1, FR-7, FR-11, AC-1, AC-7, NFR-4, NFR-5, NFR-6
- **Touches:** `src/app/(public)/**`, `src/proxy.ts`, `src/lib/i18n/locale.ts`, `src/lib/i18n/__tests__/locale.test.ts`, `src/components/reviews/LanguageToggle.tsx`, `e2e/**`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **P1.T1: Move the public tree under a locale segment** — covers: FR-1
  - [x] **P1.T1.1: Make `(public)/layout.tsx` a metadata-only pass-through and let `(public)/[locale]/layout.tsx` own `<html lang>` and the providers, fonts, navbar, footer and skip link.**
  - [x] **P1.T1.2: Move every public page and its nested segments under `[locale]`, and generate both locale params so the segment is pre-renderable.**
  - [x] **P1.T1.3: Read the locale from `params` on every public page and pass the normalized value into Payload, removing the raw `locale as "en" | "id"` cast.**
- [x] **P1.T2: Resolve and redirect locale in `proxy.ts`** — covers: FR-1, FR-7
  - [x] **P1.T2.1: Add pure helpers — locale normalization, the supported-locale guard, locale-aware path building and the remembered-preference cookie name — with unit tests.**
  - [x] **P1.T2.2: Add `src/proxy.ts` redirecting unprefixed public paths to the remembered locale (English when absent) and permanently redirecting `?locale=` to the path form while preserving other query parameters.**
  - [x] **P1.T2.3: Leave `/admin`, `/api`, `/robots.txt`, `/sitemap.xml`, static assets and the feed untouched by the proxy, and return 404 for an unsupported locale segment.**
- [x] **P1.T3: Make the existing browser suite locale-explicit** — covers: AC-1
  - [x] **P1.T3.1: Point every spec and fixture at `/en/...` and fix the selectors that assumed unprefixed hrefs.**
  - [x] **P1.T3.2: Add a redirect spec covering bare path → locale path, `?locale=` → path, preserved query parameters and an unsupported locale returning 404.**
  - [x] **P1.T3.3: Rewire the language control to path navigation (swap the locale segment, keep the slug, depth and query) so the existing toggle spec keeps passing; the remembered preference and the accessible state land in Phase 2.**

**Result:** verified
**Checkpoint:** ea7832f
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-1.md

## Phase 2: Interface Dictionary and Language Control

- **Goal:** Every public page renders its interface in the active locale from one typed dictionary, and the language control switches locale on any page while remembering the choice.
- **Depends on:** Phase 1
- **Covers:** FR-2, FR-3, FR-4, AC-2, AC-3, AC-4, NFR-1, NFR-2, NFR-4
- **Touches:** `src/lib/i18n/**`, `src/components/**`, `src/app/(public)/**`, `src/app/not-found.tsx`, `e2e/**`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **P2.T1: Build the typed dictionary** — covers: FR-4, NFR-4
  - [x] **P2.T1.1: Add the `en` and `id` dictionaries and a server-side accessor, with a test asserting both expose an identical key set.**
  - [x] **P2.T1.2: Add a test asserting no public page or component still contains a hardcoded user-facing English literal.**
- [x] **P2.T2: Translate the public interface** — covers: FR-4, NFR-2
  - [x] **P2.T2.1: Move the shell (navbar, footer, skip link, search field, mobile menu) onto the dictionary.**
  - [x] **P2.T2.2: Move the page copy onto the dictionary — home sections, browse filters/sort/pagination/empty states, review detail labels, reading lists, comments, not-found and the About page.**
  - [x] **P2.T2.3: Keep the resolved strings server-side so the dictionary adds nothing to the client bundle.**
- [x] **P2.T3: Rebuild the language control** — covers: FR-2, FR-3, NFR-1
  - [x] **P2.T3.1: Switch the current path to the other locale, preserving the slug, path depth and all query parameters.**
  - [x] **P2.T3.2: Write the remembered preference cookie, and prove a direct `/id/...` visit does not overwrite it.**
  - [x] **P2.T3.3: Expose state and target to assistive technology, including `lang` on the locale labels, and cover it with a browser spec for persistence across navigation.**

**Result:** verified
**Checkpoint:** f3390e2
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-2.md
-->

## Phase 3: Locale Metadata, Alternates and Feed

- **Goal:** Every public page declares the right language in its document and metadata, advertises reciprocal hreflang alternates, and the sitemap and RSS expose both locales.
- **Depends on:** Phase 2
- **Covers:** FR-5, FR-6, FR-8, FR-9, AC-5, AC-6, AC-8, NFR-3
- **Touches:** `src/app/(public)/**`, `src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/feed.xml/**`, `src/lib/feed.ts`, `src/lib/__tests__/feed.test.ts`, `src/lib/seo/**`, `src/lib/i18n/**`, `src/proxy.ts`, `e2e/**`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** verified

- [x] **P3.T1: Make page metadata locale-aware** — covers: FR-5, NFR-3
  - [x] **P3.T1.1: Give `generateMetadata` the active locale on every public page and localize the titles and descriptions that are ours.**
  - [x] **P3.T1.2: Emit `og:locale` per locale with the alternate, and a self-referencing canonical for the active locale.**
- [x] **P3.T2: Emit reciprocal hreflang alternates** — covers: FR-6
  - [x] **P3.T2.1: Add `en`, `id` and `x-default` alternates to every public page, pointing at the path-based URLs.**
- [x] **P3.T3: Expose both locales in the sitemap and feed** — covers: FR-8, FR-9
  - [x] **P3.T3.1: List every public page in both locales in the sitemap with hreflang alternates and English as `x-default`.**
  - [x] **P3.T3.2: Serve `/en/feed.xml` and `/id/feed.xml` with a matching language and link, redirect `/feed.xml` permanently to the English feed, and advertise the active locale's feed in the layout.**
  - [x] **P3.T3.3: Add browser coverage for the document language, the alternates, the sitemap entries and the feed redirect.**

**Result:** verified
**Checkpoint:** c1b83e6
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-3.md

## Phase 4: Content Localization for Taxonomy and Reading Lists

- **Goal:** Authors can supply Indonesian names and descriptions for genres, tags, mood tags, reading lists and review titles, and an empty Indonesian value renders the English one instead of a blank.
- **Depends on:** Phase 3
- **Covers:** FR-10, AC-9, NFR-5
- **Touches:** `src/collections/Genres.ts`, `src/collections/Tags.ts`, `src/collections/MoodTags.ts`, `src/collections/ReadingLists.ts`, `src/collections/Reviews.ts`, `src/migrations/**`, `src/migrations/index.ts`, `src/payload-types.ts`, `src/collections/__tests__/**`, `src/lib/e2e-harness.ts`, `e2e/**`, `src/components/reviews/RelatedReviews.tsx`, `docs/ADMIN_GUIDE.md`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e`
- **Status:** in_progress

- [ ] **P4.T1: Localize the content fields** — covers: FR-10
  - [ ] **P4.T1.1: Mark the taxonomy names, the reading-list title and description, and the review title localizable, and generate the migration through Payload rather than by hand.**
  - [ ] **P4.T1.2: Confirm the review body pipeline is unaffected and that an untranslated review body still falls back to English.**
- [ ] **P4.T2: Prove the fallback behaviour** — covers: FR-10, AC-9
  - [ ] **P4.T2.1: Add unit coverage that an empty Indonesian value renders the English value and a set one wins.**
  - [ ] **P4.T2.2: Seed Indonesian taxonomy and reading-list values for the browser specs and assert them on `/id/...`, plus one fallback assertion.**
- [ ] **P4.T3: Document the authoring workflow** — covers: FR-10
  - [ ] **P4.T3.1: Add the Indonesian-entry step to the admin guide, including that titles may stay English and that empty falls back.**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-4.md
-->

## Phase 5: Pre-rendering and Track Verification

- **Goal:** Detail pages pre-render per locale, the language control meets the accessibility bar, and the whole track's acceptance criteria hold in one integrated run.
- **Depends on:** Phase 4
- **Covers:** FR-12, AC-10, AC-11, NFR-1, NFR-2
- **Touches:** `src/app/(public)/**`, `src/components/reviews/**`, `e2e/**`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build`
- **Status:** pending

- [ ] **P5.T1: Restore pre-rendering** — covers: FR-12, AC-10
  - [ ] **P5.T1.1: Confirm review and reading-list detail routes build as pre-rendered per locale, and remove any remaining dynamic trigger.**
- [ ] **P5.T2: Close the accessibility and bundle checks** — covers: NFR-1, NFR-2
  - [ ] **P5.T2.1: Verify the language control's focus, contrast, announced state and locale labels meet the bar.**
  - [ ] **P5.T2.2: Compare the public client bundle against the pre-track baseline and record the difference.**
- [ ] **P5.T3: Run the integrated acceptance sweep** — covers: AC-11
  - [ ] **P5.T3.1: Walk AC-1 to AC-11 in both locales against the production build and record the evidence.**
  - [ ] **P5.T3.2: Record every deviation and the follow-ups this track deliberately leaves behind.**

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 2
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
