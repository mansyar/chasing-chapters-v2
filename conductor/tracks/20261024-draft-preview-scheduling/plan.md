# Draft Preview & Scheduled Publishing — Implementation Plan

> **Branch:** 'feat/20261024-draft-preview-scheduling'
> **Base:** 'main @ 233d826'
> Phase states: `pending`, `in_progress`, `verified`, `failed`, `blocked`.
> Only the primary agent writes this file.

## Phase 1: Publishing Gate

- **Goal:** A review carries an optional `publishAt`, and every public read hides a review until that moment through one shared rule, so a scheduled review appears on time with no deploy and no scheduler.
- **Depends on:** none
- **Covers:** FR-5, FR-6, FR-8, NFR-4, AC-5, AC-6, AC-8
- **Touches:** `src/collections/Reviews.ts`, `src/lib/publish-visibility.ts` (new), `src/lib/__tests__/publish-visibility.test.ts` (new), `src/app/(public)/[locale]/**`, `src/app/sitemap.ts`, `src/migrations/**`, `src/payload-types.ts`, `src/lib/e2e-harness.ts`, `e2e/global-setup.ts`, `src/collections/__tests__/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e'
- **Status:** pending

- [ ] **P1.T1: Add the publishAt field and the shared visibility rule** — covers: FR-5, FR-6, NFR-4
  - [ ] **P1.T1.1: Add an optional `publishAt` timestamp to the reviews sidebar, generate the types, and generate the migration through Payload**
  - [ ] **P1.T1.2: Write one pure module exposing a Payload `where` fragment and an in-memory predicate for public visibility, with unit tests for unset, past, future, boundary and invalid values**
- [ ] **P1.T2: Apply the gate to every public read** — covers: FR-5
  - [ ] **P1.T2.1: Gate the home page, the browse page and the review detail route, which must 404 for a hidden review**
  - [ ] **P1.T2.2: Gate the RSS feed, the sitemap and both Open Graph handlers**
  - [ ] **P1.T2.3: Add a scheduled fixture review whose `publishAt` is in the future, upserted idempotently, so the gate is provable end to end**
- [ ] **P1.T3: Fill an empty publishDate from the schedule** — covers: FR-8
  - [ ] **P1.T3.1: Extend the collection's beforeChange hook to copy `publishAt` into an empty `publishDate` without ever overwriting an author value**
  - [ ] **P1.T3.2: Unit-test the fill, the author-supplied case, and clearing the schedule**

## Phase 2: Preview Entry and Draft Rendering

- **Goal:** An authenticated author or admin can open any review — including one that was never published — on its real public URL in either locale, with a preview banner, a working exit, and no cacheable or indexable trace.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-3, FR-4, NFR-1, NFR-3, AC-1, AC-2, AC-3, AC-4
- **Touches:** `src/app/(payload)/api/preview/**`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/layout.tsx`, `src/components/reviews/PreviewBanner.tsx` (new), `src/lib/i18n/dictionary.ts`, `src/collections/Reviews.ts`, `src/lib/__tests__/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e'
- **Status:** pending

- [ ] **P2.T1: Build the preview entry and exit** — covers: FR-1
  - [ ] **P2.T1.1: Add an admin API route that validates the session, enables draft mode for one review and locale, and redirects to that review's public URL, refusing an anonymous request with 401**
  - [ ] **P2.T1.2: Add the exit action that disables draft mode and returns to the same URL**
  - [ ] **P2.T1.3: Wire Payload's native Preview button for reviews to that entry, using the document's slug and the locale being edited**
- [ ] **P2.T2: Render drafts on the real route** — covers: FR-2
  - [ ] **P2.T2.1: Read draft mode on the review route and fetch the newest version only when the request also carries a valid session**
  - [ ] **P2.T2.2: Keep the public behaviour exact when draft mode is off or the session is missing, including the 404 for a hidden review**
- [ ] **P2.T3: Add the banner and suppress the SEO surface** — covers: FR-3, FR-4, NFR-1, NFR-3
  - [ ] **P2.T3.1: Add a preview banner with dictionary copy in both locales, a link to the same review in the other locale, and the exit action**
  - [ ] **P2.T3.2: Suppress canonical, hreflang and the Open Graph image while previewing, and emit `noindex, nofollow` with `Cache-Control: private, no-store`**
  - [ ] **P2.T3.3: Prove a previewed review stays out of the sitemap, the feeds and the translation cache**
  - [ ] **P2.T3.4: Confirm the build still reports both review detail routes as pre-rendered, and stop and report if draft mode flips them to dynamic**

## Phase 3: Admin Surface, Fixture and Proof

- **Goal:** A scheduled review is recognisable in the admin, the browser suite proves the whole feature end to end, and translation behaviour and pre-rendering are demonstrably unchanged.
- **Depends on:** Phase 2
- **Covers:** FR-7, FR-9, AC-7, AC-9, AC-10
- **Touches:** `src/collections/Reviews/**`, `src/components/admin/**`, `src/payload.config.ts`, `src/app/(payload)/admin/importMap.js`, `src/lib/e2e-harness.ts`, `e2e/**`, `src/collections/__tests__/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build'
- **Status:** pending

- [ ] **P3.T1: Show the schedule in the admin** — covers: FR-7
  - [ ] **P3.T1.1: Add a list indicator that distinguishes a scheduled review from a live one, and an edit-view notice stating when it will publish**
  - [ ] **P3.T1.2: Register both in the reviews admin config and regenerate the import map**
- [ ] **P3.T2: Add the draft fixture and browser coverage** — covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
  - [ ] **P3.T2.1: Add a never-published draft review to the fixture, idempotent and with translation skipped**
  - [ ] **P3.T2.2: Cover the preview flow in the browser: 401 without a session, the banner, the other-locale link, the exit, and the suppressed SEO surface**
  - [ ] **P3.T2.3: Cover scheduling in the browser: the scheduled review absent from every public surface, the admin list indicator, and the edit-view notice**
- [ ] **P3.T3: Prove translation and pre-rendering are unchanged** — covers: FR-9, AC-9, AC-10
  - [ ] **P3.T3.1: Assert a preview render performs no translation write, a save still runs the pipeline, and a failed translation does not delay the scheduled publish**
  - [ ] **P3.T3.2: Run the production build and record that both review detail routes are still pre-rendered alongside the full verification chain**

<!-- Review fixes are appended by `conductor-review` as:
## Phase R1: Review Fixes
- **Goal:** Resolve findings from review round 1.
- **Depends on:** Phase N
- **Covers:** <finding IDs>
- **Touches:** ...
- **Verification:** '<command>'
- **Status:** pending
- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
