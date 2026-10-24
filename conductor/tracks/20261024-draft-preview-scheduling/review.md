# Review: Draft Preview & Scheduled Publishing

- **Track:** `20261024-draft-preview-scheduling`
- **Type:** feature
- **Branch:** `feat/20261024-draft-preview-scheduling`
- **Range:** `233d826516af4ff2f76de97ab20742314ccedea3..ae32959`
- **Date:** 2026-10-25
- **Verdict:** `BLOCK`

## Summary

The feature works as specified on every surface the plan named: one visibility rule
gates the pages, preview runs on the real URL behind the session and leaves no
cacheable or indexable trace, scheduling survives restarts because it is a timestamp
rather than a job, the admin names the state, and both review detail routes are still
pre-rendered over the same eight paths. All five checks are green and the suite grew
from 524 to 574 unit tests and from 95 to 108 browser specs.

The blocking problem is the word **every** in "every public surface". The new
predicate replaced the `_status` filter in the seven reads Phase 1 enumerated, but the
collection's own anonymous read access — which is what the public Payload REST API
uses — still returns `{ _status: { equals: "published" } }`, and `/api` passes straight
through the proxy. A published review with a future `publishAt` is therefore still
served, in full, at `/api/reviews?where[slug][equals]=…` before its moment. Two more
surfaces drifted the same way: a reading-list detail page renders whatever reviews the
list relationship holds, and the comment action guards on `_status` alone. A fourth
finding is a display bug in the notice this track added, and three are smaller
duplicates of the same drift.

All seven are fixed in Phase R1; nothing is deferred.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass — 574 pass, 0 fail, 46 files | reviewer re-ran: 3.92 s |
| coverage | `bun test --coverage` | pass — 81.30 % funcs / 89.94 % lines, gate 80 % on new code | primary; reviewer's shell policy denied this command (disclosed) |
| lint | `bun run lint` | pass — 236 files, no fixes | reviewer re-ran |
| typecheck | `bun run typecheck` | pass — 246 files | reviewer re-ran |
| build | `bun run build` | pass — both review detail routes `●`, 8 pre-rendered paths | reviewer confirmed via the e2e harness build and `.next/prerender-manifest.json` |
| e2e | `bun run test:e2e` | pass — 108 passed, 0 failed, 0 skipped (4.2 m) | reviewer re-ran |

## Requirements

| ID | Implemented by | Verified by | Status |
| -- | -------------- | ----------- | ------ |
| FR-1 | `api/preview/route.ts` | `draft-preview.spec.ts` (401, no cookie; 307) | covered |
| FR-2 | `loadReview`, `canRenderDraft` | `preview.test.ts`, `draft-preview.spec.ts:164` | covered |
| FR-3 | `PreviewBanner.tsx`, `/api/preview/exit` | `draft-preview.spec.ts:85` | covered |
| FR-4 | `buildPreviewMetadata` | `preview.test.ts`, `draft-preview.spec.ts:85,231` | covered |
| FR-5 | `publish-visibility.ts` in seven reads | `publish-visibility.test.ts`, `publish-schedule.spec.ts` | **partial — F1, F2, F3** |
| FR-6 | `Reviews.publishAt` + migration | `publishAt.test.ts` | covered |
| FR-7 | `publish-state.ts`, cell, notice | `publishState.test.ts`, `review-schedule.spec.ts` | **partial — F4** |
| FR-8 | `beforeChange` fill | `publishAt.test.ts` | **partial — F5** |
| FR-9 | unchanged pipeline | `translateReview.test.ts:280`, `draft-preview.spec.ts:231` | covered |
| NFR-1 | draft-mode branch ordering | route table, `prerender-manifest.json` | covered |
| NFR-2 | session as sole authority | 401 with no `set-cookie` | covered |
| NFR-3 | `private, no-store`, noindex, no writes | `draft-preview.spec.ts:85,231` | covered |
| NFR-4 | one shared predicate | call sites | **partial — F1, F7** |
| NFR-5 | — | all five layers green | covered |
| AC-1 … AC-10 | — | see the findings' `verified by` and the integrated record | covered (AC-5 within its enumerated surfaces) |

## Findings

### High

**F1 — The anonymous REST read still serves a scheduled review**

- File: `src/collections/Reviews.ts:88-93`
- What: the public branch of `access.read` returns `{ _status: { equals: "published" } }`,
  so `GET /api/reviews?where[slug][equals]=<scheduled-slug>&limit=1` returns the whole
  document — title, `reviewContent`, `whatILoved`, cover — regardless of `publishAt`.
- Why: `src/proxy.ts` passes `/api` straight through (the route table has
  `ƒ /api/[...slug]`), so this is a genuinely public surface and the review's body is
  readable before the moment the track promises to reveal it. It is also the one
  `_status` filter that defines "public" for the collection itself, which is exactly
  the drift NFR-4 exists to prevent.
- Fix: return `publishedAndVisibleWhere(new Date())` from the anonymous branch. Page
  queries use `overrideAccess: true`, and writer/admin reads have their own branches,
  so nothing else moves.
- Requirement: FR-5, NFR-4
- Test gap: an unauthenticated REST read of the scheduled slug expecting `docs: []`,
  with a visible review as the control.

### Medium

**F2 — A scheduled review can still be listed on a reading list**

- File: `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx:120` (rendered at 181-190)
- What: `const reviews = (list.reviews as Review[]) || []` renders every populated
  review, so a scheduled one appears as a card with its title and cover, pointing at a
  URL that 404s.
- Why: the field's own description promises it hides the review from every public page,
  and this page names it before its moment. The track is what makes the state
  reachable.
- Fix: filter with `isPubliclyVisible(review, new Date())` before the empty-state
  check, so the grid, the count and the empty message agree.
- Requirement: FR-5
- Test gap: put the scheduled fixture on the reading list and assert its card is absent
  while a visible review's card is present.

**F3 — The comment action guards on the status, not the rule**

- File: `src/app/actions/comments.ts:51-66`
- What: a `findByID` (local API, `overrideAccess` defaulting to `true`) then
  `targetReview._status !== "published"`, so a reader can comment on a scheduled review
  and the distinct "Review not found" / success responses reveal that it exists.
- Why: same drift on the write side, and comments surface the moment the review does.
- Fix: `if (!isPubliclyVisible(targetReview, new Date())) return { success: false, error: "Review not found" };`
- Requirement: FR-5
- Test gap: a submission against the scheduled fixture id expecting the not-found error.

**F4 — The notice ignores an unsaved clear**

- File: `src/collections/Reviews/admin/PublishScheduleNotice.tsx:26-33`
- What: `typeof scheduledValue === "string" ? scheduledValue : data?.publishAt` treats a
  form-state `null` (the author clearing the field) as "not initialised" and falls back
  to the saved value, so the notice keeps saying "Scheduled to publish on …" beside an
  empty field.
- Why: it states the opposite of what a save would do at the exact moment the author is
  checking their change, which is the purpose of the surface.
- Fix: `publishAt: scheduledValue === undefined ? data?.publishAt : scheduledValue`, so
  `null`/`""` mean "no schedule" and the saved document is only the first-render
  fallback.
- Requirement: FR-7, AC-7
- Test gap: clear `Publish At` without saving and assert the notice reads the live
  sentence.

### Low

**F5 — The FR-8 fill can overwrite a stored date on a partial update**

- File: `src/collections/Reviews.ts:473-475`
- What: the hook reads `data.publishDate`, which on an update is only the incoming body.
  A partial `PATCH { publishAt }` has no `publishDate` key, so the schedule replaces the
  stored date.
- Why: FR-8 and the admin copy promise the author's value is never overwritten. No
  in-repo caller sends a partial body today, so it is latent.
- Fix: fall back to `originalDoc?.publishDate` and let the published fallback test the
  same value.
- Requirement: FR-8
- Test gap: invoke the hook with `originalDoc` carrying a date and `data` carrying only
  `publishAt`.

**F6 — The banner says "unpublished" for a published review preview**

- File: `src/components/reviews/PreviewBanner.tsx:54`
- What: `dictionary.previewDescription` describes an unpublished version, and the e2e
  exercises previewing an already-published review too.
- Why: new user-facing copy that misdescribes one of the two supported cases.
- Fix: word it publication-agnostically ("You are previewing this review before readers
  see it."), or pick a second string from a `published` flag.
- Requirement: FR-3
- Test gap: none required.

**F7 — The RSS builder keeps a weaker copy of the rule**

- File: `src/lib/feed.ts:120`
- What: `buildRssFeed` filters in memory on `_status` only, which cannot see
  `publishAt`.
- Why: nothing leaks today because the route filters in SQL first, but it is a second,
  weaker copy of the visibility rule inside the same feature.
- Fix: give the builder a `now` and use `isPubliclyVisible`.
- Requirement: NFR-4
- Test gap: a feed case with a future `publishAt` expecting no item.

## Overrides

None.

## Plan compliance

- Three phases, each with `**Result:** verified`, a checkpoint and an evidence file;
  Phase 1 `c76ba18`, Phase 2 `ba97843`, Phase 3 `b519fdd`.
- No task was dropped. The one plan amendment (`965ee85`) attributed NFR-2 to Phase 2
  and NFR-5 to Phase 3 before implementation began, and a second (`b18c29f`) added the
  root `src/collections/Reviews.ts` to Phase 3's Touches, because registering admin
  components lives there while `src/collections/Reviews/**` does not cover it.
- Every phase's diff stayed within its Touches plus reported deviations, all listed in
  the phase evidence and accepted by the primary.
- One bookkeeping defect was found and fixed during Phase 3 acceptance: Phase 2's status
  had been left `in_progress` by a replace that did not match.

## Out of scope

The English 404 body, the dynamic browse page, reader-local schedule display, a second
authority for preview, comment and byline translation, and the `payload migrate:down`
CLI proof — all carried debt from earlier tracks.

## Debt

- `publish-state.ts:133` is a defensive `return null` that the derivation cannot reach.
- The `Live`-after-elapse branch has no database row that has actually elapsed; it rests
  on the predicate and the derivation.
- Coverage was not re-measured by the reviewer (its shell policy denies the command, as
  it did last track); the primary's figures stand and are disclosed here rather than
  hidden.

## Doc sync

`pending` — the pre-review sync updated `docs/ADMIN_GUIDE.md` (a scheduling section and
a preview section, replacing "Scheduled publishing is not available") and `README.md`.
The post-review sync must cover whatever Phase R1 changes and re-check the guide's
claim that the review is hidden from every public surface, which F1–F3 make false
until they are fixed.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 1 | 3 | 3 | 0 |
