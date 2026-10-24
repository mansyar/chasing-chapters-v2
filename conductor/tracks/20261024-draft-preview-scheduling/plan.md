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
- **Status:** verified

- [x] **P1.T1: Add the publishAt field and the shared visibility rule** — covers: FR-5, FR-6, NFR-4
  - [x] **P1.T1.1: Add an optional `publishAt` timestamp to the reviews sidebar, generate the types, and generate the migration through Payload**
  - [x] **P1.T1.2: Write one pure module exposing a Payload `where` fragment and an in-memory predicate for public visibility, with unit tests for unset, past, future, boundary and invalid values**
- [x] **P1.T2: Apply the gate to every public read** — covers: FR-5
  - [x] **P1.T2.1: Gate the home page, the browse page and the review detail route, which must 404 for a hidden review**
  - [x] **P1.T2.2: Gate the RSS feed, the sitemap and both Open Graph handlers**
  - [x] **P1.T2.3: Add a scheduled fixture review whose `publishAt` is in the future, upserted idempotently, so the gate is provable end to end**
- [x] **P1.T3: Fill an empty publishDate from the schedule** — covers: FR-8
  - [x] **P1.T3.1: Extend the collection's beforeChange hook to copy `publishAt` into an empty `publishDate` without ever overwriting an author value**
  - [x] **P1.T3.2: Unit-test the fill, the author-supplied case, and clearing the schedule**

**Result:** verified
**Checkpoint:** c76ba18
**Evidence:** conductor/tracks/20261024-draft-preview-scheduling/verification/phase-1.md

## Phase 2: Preview Entry and Draft Rendering

- **Goal:** An authenticated author or admin can open any review — including one that was never published — on its real public URL in either locale, with a preview banner, a working exit, and no cacheable or indexable trace.
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-2, FR-3, FR-4, NFR-1, NFR-2, NFR-3, AC-1, AC-2, AC-3, AC-4
- **Touches:** `src/app/(payload)/api/preview/**`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `src/app/(public)/[locale]/layout.tsx`, `src/components/reviews/PreviewBanner.tsx` (new), `src/lib/i18n/dictionary.ts`, `src/collections/Reviews.ts`, `src/lib/__tests__/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e'
- **Status:** verified

- [x] **P2.T1: Build the preview entry and exit** — covers: FR-1
  - [x] **P2.T1.1: Add an admin API route that validates the session, enables draft mode for one review and locale, and redirects to that review's public URL, refusing an anonymous request with 401**
  - [x] **P2.T1.2: Add the exit action that disables draft mode and returns to the same URL**
  - [x] **P2.T1.3: Wire Payload's native Preview button for reviews to that entry, using the document's slug and the locale being edited**
- [x] **P2.T2: Render drafts on the real route** — covers: FR-2
  - [x] **P2.T2.1: Read draft mode on the review route and fetch the newest version only when the request also carries a valid session**
  - [x] **P2.T2.2: Keep the public behaviour exact when draft mode is off or the session is missing, including the 404 for a hidden review**
- [x] **P2.T3: Add the banner and suppress the SEO surface** — covers: FR-3, FR-4, NFR-1, NFR-3
  - [x] **P2.T3.1: Add a preview banner with dictionary copy in both locales, a link to the same review in the other locale, and the exit action**
  - [x] **P2.T3.2: Suppress canonical, hreflang and the Open Graph image while previewing, and emit `noindex, nofollow` with `Cache-Control: private, no-store`**
  - [x] **P2.T3.3: Prove a previewed review stays out of the sitemap, the feeds and the translation cache**
  - [x] **P2.T3.4: Confirm the build still reports both review detail routes as pre-rendered, and stop and report if draft mode flips them to dynamic**
**Result:** verified
**Checkpoint:** ba97843
**Evidence:** conductor/tracks/20261024-draft-preview-scheduling/verification/phase-2.md

## Phase 3: Admin Surface, Fixture and Proof

- **Goal:** A scheduled review is recognisable in the admin, the browser suite proves the whole feature end to end, and translation behaviour and pre-rendering are demonstrably unchanged.
- **Depends on:** Phase 2
- **Covers:** FR-7, FR-9, NFR-5, AC-7, AC-9, AC-10
- **Touches:** `src/collections/Reviews.ts` (registering the admin components and the list column), `src/collections/Reviews/**`, `src/components/admin/**`, `src/payload.config.ts`, `src/app/(payload)/admin/importMap.js`, `src/lib/e2e-harness.ts`, `e2e/**`, `src/collections/__tests__/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build'
- **Status:** verified

- [x] **P3.T1: Show the schedule in the admin** — covers: FR-7
  - [x] **P3.T1.1: Add a list indicator that distinguishes a scheduled review from a live one, and an edit-view notice stating when it will publish**
  - [x] **P3.T1.2: Register both in the reviews admin config and regenerate the import map**
- [x] **P3.T2: Add the draft fixture and browser coverage** — covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7
  - [x] **P3.T2.1: Add a never-published draft review to the fixture, idempotent and with translation skipped**
  - [x] **P3.T2.2: Cover the preview flow in the browser: 401 without a session, the banner, the other-locale link, the exit, and the suppressed SEO surface**
  - [x] **P3.T2.3: Cover scheduling in the browser: the scheduled review absent from every public surface, the admin list indicator, and the edit-view notice**
- [x] **P3.T3: Prove translation and pre-rendering are unchanged** — covers: FR-9, AC-9, AC-10
  - [x] **P3.T3.1: Assert a preview render performs no translation write, a save still runs the pipeline, and a failed translation does not delay the scheduled publish**
  - [x] **P3.T3.2: Run the production build and record that both review detail routes are still pre-rendered alongside the full verification chain**

**Result:** verified
**Checkpoint:** b519fdd
**Evidence:** conductor/tracks/20261024-draft-preview-scheduling/verification/phase-3.md

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

## Phase R1: Review Fixes

- **Goal:** Close the first review's seven findings: the three surfaces where the old status filter is still the rule (the collection's anonymous read, the reading-list grid, the comment action), the notice's unsaved clear, the FR-8 partial-update hole, the banner copy, and the duplicate rule in the RSS builder.
- **Depends on:** Phase 3
- **Covers:** F1, F2, F3, F4, F5, F6, F7
- **Touches:** `src/collections/Reviews.ts`, `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx`, `src/app/actions/comments.ts`, `src/collections/Reviews/admin/PublishScheduleNotice.tsx`, `src/lib/feed.ts`, `src/lib/i18n/dictionary.ts`, `src/lib/publish-visibility.ts`, `src/lib/__tests__/publish-visibility.test.ts`, `src/lib/__tests__/feed.test.ts`, `src/collections/__tests__/**`, `src/lib/e2e-harness.ts`, `e2e/global-setup.ts`, `e2e/**`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build'
- **Status:** verified

- [x] **R1.T1: Gate the collection's anonymous read with the shared rule** - covers: F1
  - [x] **R1.T1.1: Return the shared visibility fragment from the anonymous branch of access.read, leaving the writer and admin branches untouched**
  - [x] **R1.T1.2: Add an unauthenticated REST assertion that the scheduled slug returns no documents, with a visible review as the control**
- [x] **R1.T2: Filter the reading-list grid** - covers: F2
  - [x] **R1.T2.1: Filter the populated reviews with isPubliclyVisible before the empty-state check so the grid, the count and the message agree**
  - [x] **R1.T2.2: Add the scheduled fixture review to the reading list's reviews and assert its card is absent while a visible card is present**
- [x] **R1.T3: Guard the comment action with the rule, not the status** - covers: F3
  - [x] **R1.T3.1: Replace the status check with isPubliclyVisible**
  - [x] **R1.T3.2: Cover the predicate both ways (the action path is covered by inspection, no browser case)**
- [x] **R1.T4: Let an unsaved clear reach the notice** - covers: F4
  - [x] **R1.T4.1: Treat a form-state undefined as not initialised and null or empty as no schedule**
  - [x] **R1.T4.2: Browser case: clear the schedule without saving and assert the live sentence**
- [x] **R1.T5: Keep a stored publishDate on a partial update** - covers: F5
  - [x] **R1.T5.1: Fall back to originalDoc.publishDate in the fill and in the published fallback**
  - [x] **R1.T5.2: Unit case invoking the hook with only publishAt in data**
- [x] **R1.T6: Stop the banner claiming an unpublished version** - covers: F6
  - [x] **R1.T6.1: Reword the copy publication-agnostically in both locales, keeping key parity**
- [x] **R1.T7: Give the RSS builder the shared rule** - covers: F7
  - [x] **R1.T7.1: Pass now through buildRssFeed and filter with isPubliclyVisible**
  - [x] **R1.T7.2: Feed case: a future publishAt produces no item**
- [x] **R1.T8: Record the phase evidence** - covers: F1, F2, F3, F4, F5, F6, F7

**Result:** verified
**Checkpoint:** b9aae41
**Evidence:** conductor/tracks/20261024-draft-preview-scheduling/verification/phase-R1.md

## Phase R2: Review Fixes (round 2)

- **Goal:** The date fill distinguishes a cleared `publishDate` from an absent one again, and the two counts that still include a scheduled review agree with the grid the detail page renders.
- **Depends on:** Phase R1
- **Covers:** round-2 F1, round-2 F3
- **Touches:** `src/collections/Reviews.ts`, `src/components/ReadingListCard.tsx`, `src/app/(public)/[locale]/reading-lists/[slug]/opengraph-image.tsx`, `src/collections/__tests__/**`, `e2e/**`, `conductor/tracks/20261024-draft-preview-scheduling/verification/phase-R2.md`
- **Verification:** 'bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build'
- **Status:** verified

- [x] **R2.T1: Distinguish a cleared publish date from an absent one** - covers: round-2 F1
  - [x] **R2.T1.1: Use `data.publishDate !== undefined` instead of `??` so a null still reaches the fill**
  - [x] **R2.T1.2: Unit case: a body with `publishDate: null` and a schedule refills from the schedule**

- [x] **R2.T2: Count through the shared rule** - covers: round-2 F3
  - [x] **R2.T2.1: Filter the reading-list card's book count and the Open Graph subtitle with `isPubliclyVisible`**
  - [x] **R2.T2.2: Prove the card and the detail grid report the same count for the fixture list**

- [x] **R2.T3: Record the phase evidence** - covers: round-2 F1, round-2 F3

**Result:** verified
**Checkpoint:** a198b1f
**Evidence:** conductor/tracks/20261024-draft-preview-scheduling/verification/phase-R2.md