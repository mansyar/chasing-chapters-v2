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
- **Status:** verified

- [x] **P4.T1: Localize the content fields** — covers: FR-10
  - [x] **P4.T1.1: Mark the taxonomy names, the reading-list title and description, and the review title localizable, and generate the migration through Payload rather than by hand.**
  - [x] **P4.T1.2: Confirm the review body pipeline is unaffected and that an untranslated review body still falls back to English.**
- [x] **P4.T2: Prove the fallback behaviour** — covers: FR-10, AC-9
  - [x] **P4.T2.1: Add unit coverage that an empty Indonesian value renders the English value and a set one wins.**
  - [x] **P4.T2.2: Seed Indonesian taxonomy and reading-list values for the browser specs and assert them on `/id/...`, plus one fallback assertion.**
- [x] **P4.T3: Document the authoring workflow** — covers: FR-10
  - [x] **P4.T3.1: Add the Indonesian-entry step to the admin guide, including that titles may stay English and that empty falls back.**

**Result:** verified
**Checkpoint:** dfcede1
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-4.md

## Phase 5: Pre-rendering and Track Verification

- **Goal:** Detail pages pre-render per locale, the language control meets the accessibility bar, and the whole track's acceptance criteria hold in one integrated run.
- **Depends on:** Phase 4
- **Covers:** FR-12, AC-10, AC-11, NFR-1, NFR-2
- **Touches:** `src/app/(public)/**`, `src/components/reviews/**`, `src/app/not-found.tsx`, `src/lib/__tests__/**`, `e2e/**`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build`
- **Status:** verified

- [x] **P5.T1: Restore pre-rendering** — covers: FR-12, AC-10
  - [x] **P5.T1.1: Confirm review and reading-list detail routes build as pre-rendered per locale, and remove any remaining dynamic trigger.**
- [x] **P5.T2: Close the accessibility and bundle checks** — covers: NFR-1, NFR-2
  - [x] **P5.T2.1: Verify the language control's focus, contrast, announced state and locale labels meet the bar.**
  - [x] **P5.T2.2: Compare the public client bundle against the pre-track baseline and record the difference.**
- [x] **P5.T3: Run the integrated acceptance sweep** — covers: AC-11
  - [x] **P5.T3.1: Walk AC-1 to AC-11 in both locales against the production build and record the evidence.**
  - [x] **P5.T3.2: Record every deviation and the follow-ups this track deliberately leaves behind.**

**Result:** verified
**Checkpoint:** 5a5031a
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-5.md

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 2
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** - covers: <finding ID>
-->

## Phase R1: Review Fixes

- **Goal:** Resolve review findings F1 (unprefixed navbar links drop a shared-URL reader back to English), F2 (the localization migration's `down()` cannot run and would discard values), F3 (no end-to-end proof a localized review title wins), F4 (a dotted path is treated as a file while a slug can now be stored unformatted) and F5 (a docblock that contradicts its function).
- **Depends on:** Phase 5
- **Covers:** F1, F2, F3, F4, F5
- **Touches:** `src/components/layout/Navbar.tsx`, `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts`, `e2e/content-localization.spec.ts`, `e2e/global-setup.ts`, `e2e/locale-routing.spec.ts`, `src/lib/e2e-harness.ts`, `src/lib/__tests__/e2e-harness.test.ts`, `src/proxy.ts`, `src/lib/i18n/locale.ts`, `src/lib/i18n/__tests__/locale.test.ts`, `src/lib/i18n/format.ts`, `src/hooks/formatSlug.ts`, `src/collections/__tests__/localization.test.ts`, `conductor/tracks/20261023-bilingual-site-experience/verification/phase-R1.md`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build`
- **Status:** verified

- [x] **R1.T1: Prefix the navbar's public links so a page keeps its language in-app** - covers: F1
  - [x] **R1.T1.1: Give the logo and the four public nav links `/${locale}` in the desktop and mobile blocks, leaving `/admin` bare** - covers: F1
  - [x] **R1.T1.2: Add a browser case that a navbar click and a logo click from `/id/reviews` stay on `/id` while the cookie says English** - covers: F1
- [x] **R1.T2: Make the localization migration reversible without data loss** - covers: F2
  - [x] **R1.T2.1: Reorder `down()` to add the columns as nullable, copy the `en` values back from the locale tables, then drop the tables and indices** - covers: F2
  - [x] **R1.T2.2: Prove the pair by hand on a scratch database (migrate, down, count the restored values) and record the output** - covers: F2
- [x] **R1.T3: Prove a localized review title end to end** - covers: F3
  - [x] **R1.T3.1: Give one fixture review an Indonesian title through a locale-scoped update and export it** - covers: F3
  - [x] **R1.T3.2: Assert the Indonesian title on `/id` (heading and description) and the English one on `/en`** - covers: F3
- [x] **R1.T4: Treat only a file-looking path as a file, and normalise every stored slug** - covers: F4
  - [x] **R1.T4.1: Match the final segment in the proxy's file test and return `originalDoc?.slug ?? format(value)` on a non-default-locale write** - covers: F4
  - [x] **R1.T4.2: Unit-test the predicate and add a browser case that a bare `/reviews/<slug>` still redirects** - covers: F4
- [x] **R1.T5: Correct the `format.ts` docblock** - covers: F5
- [x] **R1.T6: Record the phase evidence** - covers: F1, F2, F3, F4, F5

**Result:** verified
**Checkpoint:** c33af4b
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-R1.md

## Phase R2: Review Fixes (round 2)

- **Goal:** Make the second Phase 4 migration reversible (its `down()` cannot run once any non-default name is blank, which aborts the whole batch rollback) and make the English-body fallback assertion discriminate instead of passing against a stubbed translation.
- **Depends on:** Phase R1
- **Covers:** F1, F2 (round 2)
- **Touches:** `src/migrations/20261023_195302_relax_localized_name_columns.ts`, `e2e/global-setup.ts`, `src/lib/e2e-harness.ts`, `e2e/content-localization.spec.ts`, `src/lib/__tests__/e2e-harness.test.ts`, `conductor/tracks/20261023-bilingual-site-experience/verification/phase-R2.md`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build`
- **Status:** verified

- [x] **R2.T1: Make the relaxation migration reversible** - covers: F1
  - [x] **R2.T1.1: Delete the three `SET NOT NULL` statements from `down()` and record why the constraint cannot be restored without inventing translations** - covers: F1
  - [x] **R2.T1.2: Prove the whole batch rolls back once on a scratch database and record the commands and output** - covers: F1
- [x] **R2.T2: Make the body-fallback assertion discriminating** - covers: F2
  - [x] **R2.T2.1: Clear the `id` rich text on re-seed for the localized-title review so every run starts from the true fallback** - covers: F2
  - [x] **R2.T2.2: Assert the body carries no test-mode marker as well as the English text, and run the suite twice** - covers: F2
- [x] **R2.T3: Record the phase evidence** - covers: F1, F2

**Result:** verified
**Checkpoint:** 6450256
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-R2.md

## Phase R3: Review Fixes (round 3)

- **Goal:** Restore the guard the body-requirement relaxation lost (a textless editor state must still count as no English body), bring the generated types back in line with the collection config, and heal every review the suite translates rather than only the one with a localized title.
- **Depends on:** Phase R2
- **Covers:** F1, F2, F3 (round 3)
- **Touches:** `src/collections/requireDefaultLocaleValue.ts`, `src/collections/__tests__/localization.test.ts`, `src/payload-types.ts`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `e2e/global-setup.ts`, `e2e/content-localization.spec.ts`, `conductor/tracks/20261023-bilingual-site-experience/verification/phase-R3.md`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build`
- **Status:** verified

- [x] **R3.T1: Make the default-locale blank check rich-text aware** - covers: F1
  - [x] **R3.T1.1: Treat an editor state whose root carries no text as blank, keeping the non-default-locale short-circuit** - covers: F1
  - [x] **R3.T1.2: Add the textless-editor-state cases (rejected in `en`, accepted in `id`) to the contract test** - covers: F1
- [x] **R3.T2: Bring the generated types back in line** - covers: F2
  - [x] **R3.T2.1: Regenerate `src/payload-types.ts` and guard the one render that now needs a null check** - covers: F2
  - [x] **R3.T2.2: Assert in the contract test that the body is not `required`, and drop the fixture's cast if the type allows** - covers: F2
- [x] **R3.T3: Heal every review the suite translates** - covers: F3
  - [x] **R3.T3.1: Scope the clearing write on `translationStatus !== "translated"` instead of on a localized title** - covers: F3
  - [x] **R3.T3.2: Assert the marker is absent in the no-Indonesian-content case and run the suite twice from the same database** - covers: F3
- [x] **R3.T4: Record the phase evidence** - covers: F1, F2, F3

**Result:** verified
**Checkpoint:** 3d7a1eb
**Evidence:** conductor/tracks/20261023-bilingual-site-experience/verification/phase-R3.md

