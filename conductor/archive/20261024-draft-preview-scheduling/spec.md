# Draft Preview & Scheduled Publishing — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

Give authors the two things a publishing workflow needs and this one lacks: the
ability to see an unpublished review on the real site, and the ability to choose
when it goes live. A preview opens the actual review route under Next draft mode,
authenticated by the admin session, with a banner and an exit link. Scheduling is
a `publishAt` timestamp that gates every public read, so a review published today
can appear on Monday without a deploy, a cron, or a queue.

## Problem / Motivation

Authors publish blind. Nothing in `src` uses draft mode (a repository-wide search
finds no `draftMode` or `preview` usage outside the analytics dashboard's
unrelated `topReviews`), while every public read filters `_status = published` at
ten sites — both pages, both Open Graph handlers, the RSS route and the sitemap.
Saving a draft and opening the site therefore yields a 404, so the first time an
author sees a review laid out on the page is after it is public. Fixing a typo or
a broken quote then happens in front of readers.

Scheduling does not exist at all. `publishDate` is display metadata filled with
`now` on publish (`src/collections/Reviews.ts:395-396`), so "go live on Tuesday"
can only be done by remembering to press publish on Tuesday.

The cost is now doubled by the bilingual work: publishing blind also means
checking the Indonesian page after the fact, where an empty body, a fallback that
reads oddly, or an untranslated taxonomy name only becomes visible in public.

If this is not solved, every remaining content feature (comments, author pages,
scheduled series) inherits the same blind-ship loop.

## Goals & Success Metrics

- **Goal:** An author can open any draft — never published, or published with a
  future date — on its real review URL in either locale before it is public, and
  a review can go live at a chosen time with no manual step and no scheduler.
- **Metric:** a preview of a never-published draft returns 200 with the draft body
  and a preview banner while the same URL without draft mode returns 404; a
  review with a future `publishAt` is absent from the pages, sitemap, feed and Open
  Graph output until that moment and present within one revalidation cycle
  afterwards; the production route table still reports both review detail routes
  as pre-rendered.

## Scope

### In Scope

- A draft-mode entry point on the admin API that requires the author's existing
  session, enables draft mode for one review and locale, and redirects to that
  review's public URL.
- Draft-aware rendering on the existing public review route, for drafts that were
  never published as well as for scheduled ones.
- A preview banner on every previewed page, a link to the same review in the other
  locale, and an exit action that turns draft mode off and returns to the same URL.
- Full SEO suppression for previewed pages, and exclusion of drafts from the
  sitemap, the RSS feeds and the Open Graph images.
- A `publishAt` timestamp on reviews and one shared visibility predicate applied to
  every public read (pages, feed, sitemap, Open Graph).
- Admin affordances: the field, a scheduled indicator in the list, a publish notice
  in the edit view, and Payload's native Preview button.
- Filling an empty `publishDate` from `publishAt`, so the displayed date matches the
  day the review actually appears.
- Unit and browser coverage for all of it.

### Out of Scope

- Shareable or expiring preview links, and any preview authority other than the
  session cookie.
- Payload's live-preview iframe inside the edit view.
- Scheduling reading lists, comments or any collection other than reviews.
- A cron, queue or platform scheduler; the 60-second ISR cycle is the delivery
  mechanism.
- Per-locale draft bodies, revision comparison, or a drafts history UI.
- Email or notification when a scheduled review goes live.
- Previewing comments or unauthenticated reader-facing previews.

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | An authenticated author or admin can enable draft mode for one review and locale through an admin API route and is redirected to that review's public URL. A request without a valid session is refused with 401 and enables nothing. | must |
| FR-2 | In draft mode the public review route renders the newest version of the requested review in the requested locale, whether or not it has ever been published. Draft rendering additionally requires a valid session: draft mode without one renders the public view, never draft content. | must |
| FR-3 | Every previewed page shows a banner that names it as a preview, offers the same review in the other locale, and offers an exit action that disables draft mode and returns to the same URL. | must |
| FR-4 | Previewed responses are never cached and never indexed: `noindex, nofollow`, `Cache-Control: private, no-store`, no canonical, no hreflang alternates, no Open Graph image, and no appearance in the sitemap or the feeds. | must |
| FR-5 | A review is publicly visible only when its status is `published` and `publishAt` is unset or not in the future. This gate applies to the home page, the browse page, the review route, the RSS feeds, the sitemap and the Open Graph handlers through one shared predicate. | must |
| FR-6 | `publishAt` is an optional timestamp, editable by writers and admins, stored as UTC, and surfaced in the reviews sidebar. Unsetting it makes the review visible immediately. | must |
| FR-7 | The admin shows the schedule: the reviews list indicates a review scheduled for a future moment, and the edit view states when it will publish or that it is already live. | must |
| FR-8 | When a review is scheduled and its `publishDate` is empty, `publishDate` is filled with `publishAt`. A value the author supplied is never overwritten. | should |
| FR-9 | Scheduling does not change translation behaviour: the pipeline still runs when the review is saved, the Indonesian page appears at the same moment as the English one, and previewing a review never starts or alters a translation. | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Public routes stay pre-rendered. Draft mode is a per-request bypass, not a switch to dynamic rendering, and the production route table must still report both review detail routes as pre-rendered after the change. |
| NFR-2 | No new secret and no new environment variable: preview authority is the existing session cookie, and no bearer token appears in any URL. |
| NFR-3 | Draft content never reaches the ISR cache, the Redis translation cache, the sitemap or a feed. Every preview response is `private, no-store` and `noindex`. |
| NFR-4 | One visibility predicate shared by every public read, so the ten existing `_status` filters cannot drift into ten slightly different rules. The predicate is pure and unit-tested. |
| NFR-5 | The existing surface stays green: typecheck, lint, the current unit suite, the current browser suite and the production build all pass unchanged. |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | A signed-out request to the preview entry returns 401 and the review stays 404 for that client; a signed-in author is redirected to the review and sees the preview banner. | FR-1 |
| AC-2 | A never-published draft renders its body in draft mode and 404s outside it, and the same holds for a published review whose `publishAt` is in the future. | FR-2 |
| AC-3 | The banner appears, its locale link switches to the other locale while staying in draft mode, and Exit returns to the same URL with the banner gone. | FR-3 |
| AC-4 | A previewed response carries `noindex, nofollow` and `private, no-store`, exposes no canonical, hreflang or Open Graph image, and neither the sitemap nor the feed lists the previewed review. | FR-4 |
| AC-5 | A review with a future `publishAt` is absent from the home page, the browse page, its own URL, the feed, the sitemap and its Open Graph image; once the moment passes it is present in all of them without a deploy. | FR-5 |
| AC-6 | A writer can set and clear `publishAt`; a past value makes the review visible immediately; access rules for editing reviews are unchanged. | FR-6 |
| AC-7 | The reviews list distinguishes a scheduled review from a live one, and the edit view states when it will publish. | FR-7 |
| AC-8 | Scheduling a review whose `publishDate` is empty fills it from `publishAt`, and an author-supplied `publishDate` survives scheduling. | FR-8 |
| AC-9 | Saving a published review still runs the translation pipeline exactly as today, a preview render performs no translation write, and a failed translation does not delay the scheduled publish. | FR-9 |
| AC-10 | The production build reports both review detail routes as pre-rendered, and the full verification chain passes. | NFR-1, NFR-5 |

## Edge Cases

- `publishAt` set on a draft: still invisible to readers, still previewable.
- `publishAt` in the past at save time: visible immediately, no wait.
- Boundary: a review is visible when `publishAt <= now`, and hidden strictly before.
- Time zones: the timestamp is stored in UTC; an admin in another zone entering a
  local time stores the corresponding instant, and the list shows it back locally.
- Session expired while a draft-mode cookie is still present: the page must fall
  back to the public view rather than render draft content.
- Preview of a review deleted in another tab: the URL 404s.
- Preview of a review whose slug changed since the link was built: the old URL 404s.
- A scheduled review whose Indonesian translation is `failed` or `stale`: the page
  appears on time with the English fallback, exactly as an untranslated review does.
- Feed lag: the feeds revalidate hourly, so a review that goes live may take up to
  an hour to reach the RSS feed while the page appears within a minute.
- Crawlers: a previewed URL that leaks still carries `noindex, nofollow` and no
  canonical, so it cannot enter an index as the canonical version.
- Two browsers: draft mode is per-browser, so an author previewing cannot affect
  what a reader sees.

## Dependencies

- **Tracks:** none.
- **External:** none. No new service, credential or environment variable is
  introduced.

## Open Questions & Assumptions

- **Assumption:** Next 16.4 draft mode is a per-request cache bypass that does not
  force static routes into dynamic rendering, as documented in
  `node_modules/next/dist/docs/01-app/02-guides/draft-mode.md:23-25`. The phase must
  prove this with the route table; if the detail routes flip to dynamic, the phase
  stops and reports so the fallback (a separate dynamic preview segment) is decided
  deliberately rather than discovered at review time.
- **Assumption:** Preview is needed for reviews only; reading lists are published
  rarely and can be added later with the same mechanism.
- **Assumption:** An empty `publishAt` means "no schedule", which keeps every
  existing review visible and requires no backfill.
- **Assumption:** Payload's `admin.preview` function is sufficient for the Preview
  button, so no custom admin component is needed.
- **Assumption:** The e2e fixture admin already exists and can drive the preview
  flows, so no new fixture credential is required.

## References

- `src/collections/Reviews.ts` — `versions.drafts` (29-30), the `publishDate` hook
  (395-396), and the admin field layout.
- The ten public `_status` filters: `src/app/(public)/[locale]/page.tsx`,
  `.../reviews/page.tsx`, `.../reviews/[slug]/page.tsx`, both
  `opengraph-image.tsx` handlers, `src/app/(public)/[locale]/feed.xml/route.ts`,
  `src/app/sitemap.ts`.
- `src/hooks/revalidatePages.ts` — how a save currently invalidates public paths.
- `node_modules/next/dist/docs/01-app/02-guides/draft-mode.md` — the draft-mode
  contract, including the `__prerender_bypass` cookie and the `private, no-store`
  response.
- `node_modules/payload/dist/collections/config/types.d.ts:437` — `preview?:
  GeneratePreviewURL`.
- `conductor/archive/20261023-bilingual-site-experience/verification/integrated.md`
  — the pre-rendering and SEO invariants this track must not regress.
