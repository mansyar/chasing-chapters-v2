# Review: Draft Preview & Scheduled Publishing

- **Track:** `20261024-draft-preview-scheduling`
- **Type:** feature
- **Branch:** `feat/20261024-draft-preview-scheduling`
- **Range:** `233d826516af4ff2f76de97ab20742314ccedea3..4041cd1`
- **Date:** 2026-10-25
- **Verdict:** `PASS WITH FINDINGS` — every finding of all three rounds is closed in the track (R1, R2, R3); two items of pre-existing debt are recorded below with the reasons they are not track defects.

## Summary

The feature does what the spec asks and does it the honest way. One visibility rule
(`publishedAndVisibleWhere` / `isPubliclyVisible`) decides whether a review is public, and it is
applied at every surface a reader or a crawler can reach — the home page, the browse list, the
review route including its metadata and `generateStaticParams`, both RSS feeds, the sitemap, both
Open Graph handlers, the related-reviews strip, the reading-list grid, the comment write path and
the collection's own anonymous REST read. Preview runs on the review's real URL, requires a live
session as well as the bypass cookie, and leaves nothing cacheable or indexable behind. Scheduling
is a timestamp rather than a job, so it survives a restart, needs no deploy, and reuses the
60-second revalidation the site already had. The admin names the state in the list and states the
moment in the edit view. Both review detail routes are still pre-rendered over the same eight paths.

Three rounds were needed, and the findings are the interesting part. Round 1 caught the exact
failure mode this feature invites: the predicate was applied to the seven reads the plan
enumerated and not to the collection's own anonymous access, so the public REST API still served
a scheduled review in full; two more surfaces had drifted the same way, and the new notice
ignored an unsaved clear. Round 2 caught a regression the round-1 fix introduced — `??` conflated
a cleared date with an absent one — plus two counts that still included a scheduled review. Round
3 closed the last hole the date fill left open (a partial update clearing only the date) and a
test-helper timeout that could not fit its own retry budget. Every fix carries a test that fails
without it.

Final state: 582 unit tests, 112 browser specs, typecheck and lint clean, coverage 81.30 % funcs /
89.96 % lines with every new module at or near 100 %, and a production build that still
pre-renders both detail routes.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass — 582 pass, 0 fail, 46 files | reviewer re-ran round 3: 582 pass, 1325 expects |
| coverage | `bun test --coverage` | pass — 81.30 % funcs / 89.96 % lines; gate 80 % on new code | primary re-measured at the final head |
| lint | `bun run lint` | pass — 236 files, no fixes | reviewer re-ran |
| typecheck | `bun run typecheck` | pass — 246 files | reviewer re-ran |
| build | `bun run build` | pass — 27/27 static pages, both review detail path groups `●` over 8 paths | primary, against the harness database |
| e2e | `bun run test:e2e` | pass — 112 passed, 0 failed, 0 skipped, 0 unrun (3.7 m) | primary at the final head; reviewer relied on it and said so |

The reviewer's shell policy denies `bun run test:coverage` and pipes, and it declined to re-run
the browser suite and the build (both need the harness database and a standalone build). Those
gaps are disclosed here rather than treated as passes; the coverage and e2e figures are the
primary's own runs at the reviewed head.

## Requirements

| ID | Implemented by | Verified by | Status |
| -- | -------------- | ----------- | ------ |
| FR-1 | `api/preview/route.ts` | `draft-preview.spec.ts` (401 with no cookie; 307) | covered |
| FR-2 | `loadReview`, `canRenderDraft` | `preview.test.ts`, `draft-preview.spec.ts:164` | covered |
| FR-3 | `PreviewBanner.tsx`, `/api/preview/exit` | `draft-preview.spec.ts:85` | covered |
| FR-4 | `buildPreviewMetadata` | `preview.test.ts`, `draft-preview.spec.ts:85,231` | covered |
| FR-5 | `publish-visibility.ts` across eleven surfaces + `access.read` | `publish-visibility.test.ts`, `publish-schedule.spec.ts`, R1 cases | covered |
| FR-6 | `Reviews.publishAt` + migration | `publishAt.test.ts` | covered |
| FR-7 | `publish-state.ts`, cell, notice | `publishState.test.ts`, `review-schedule.spec.ts` | covered |
| FR-8 | `beforeChange` fill, date and schedule both read through `originalDoc` | `publishAt.test.ts` (8 cases) | covered |
| FR-9 | unchanged pipeline | `translateReview.test.ts` (schedule-only save → `none`), `draft-preview.spec.ts:231` | covered |
| NFR-1 | draft-mode branch ordering | route table, `prerender-manifest.json` | covered |
| NFR-2 | session as sole authority | 401 with no `set-cookie` | covered |
| NFR-3 | `private, no-store`, noindex, no writes | `draft-preview.spec.ts:85,231` | covered |
| NFR-4 | one shared predicate | call sites, `dictionary-source`-style drift tests | covered |
| NFR-5 | — | all five layers green | covered |
| AC-1 … AC-10 | — | phase tables, `verification/integrated.md` | covered |

## Findings

All of these are **resolved**. Each entry keeps the original text and names the fix that closed it.

### High

**F1 — The anonymous REST read still serves a scheduled review — resolved in R1 (`dd4f5a5`)**

- File: `src/collections/Reviews.ts:88-93`
- What: the public branch of `access.read` returned `{ _status: { equals: "published" } }`, so
  `GET /api/reviews?where[slug][equals]=<scheduled-slug>` returned the whole document regardless
  of `publishAt`.
- Why: `/api` passes straight through the proxy, so this is a genuinely public surface; it is also
  the filter that defines "public" for the collection itself, which is the drift NFR-4 exists to
  prevent.
- Fix (applied): the anonymous branch returns `publishedAndVisibleWhere(new Date())`; writer and
  admin branches untouched. Proven by `publish-schedule.spec.ts:36` (*stays out of the public REST
  API*) with a visible review as the control.

### Medium

**F2 — A scheduled review could still be listed on a reading list — resolved in R1 (`89fd7f8`)**

- File: `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx:120`
- Fix (applied): filter with `isPubliclyVisible` before the empty-state check, so grid, count and
  the "no reviews" message agree. Proven by `publish-schedule.spec.ts:104`.

**F3 — The comment action guarded on the status, not the rule — resolved in R1 (`076f6ca`)**

- File: `src/app/actions/comments.ts:51-66`
- Fix (applied): `canAcceptPublicWrite` in `publish-visibility.ts` (the action module is
  `"use server"`, so the rule cannot be exported from there), with unit cases both ways. The
  action path itself is covered by inspection, not a browser case — the evidence says so rather
  than implying otherwise.

**F4 — The notice ignored an unsaved clear — resolved in R1 (`8d6e68d`)**

- File: `src/collections/Reviews/admin/PublishScheduleNotice.tsx:26-33`
- Fix (applied): `scheduledValue === undefined ? data?.publishAt : scheduledValue`, so a form
  `null` means "no schedule". Proven by `review-schedule.spec.ts:90`, which retries the clear
  click until the field is genuinely empty before reading the notice.

### Low

**F5 — The FR-8 fill could overwrite a stored date on a partial update — resolved in R1 (`89dec05`),
then completed in R3 (`03ab44e`)**

- File: `src/collections/Reviews.ts:473-485`
- Round 1: the date fell back to `originalDoc?.publishDate`. Round 2 found that `??` conflated a
  cleared value with an absent one; round 3 found the schedule was still read only from the body.
  The final form reads **both** through `!== undefined` with an `originalDoc` fallback, and eight
  unit cases cover create/partial/cleared-both/first-publish.

**F6 — The banner said "unpublished" for a published review preview — resolved in R1 (`7dda917`)**

- Fix (applied): publication-agnostic copy in both locales ("You are previewing this review
  before readers see it." / "Anda sedang melihat pratinjau ulasan ini sebelum pembaca
  melihatnya."), key parity intact.

**F7 — The RSS builder kept a weaker copy of the rule — resolved in R1 (`aa1dc16`, `a124510`)**

- File: `src/lib/feed.ts`
- Fix (applied): `buildRssFeed` takes `now` and filters with `isPubliclyVisible`. The route's
  `select` had to grow `_status`/`publishAt` or the in-memory rule would empty the feed — the
  subagent's first run caught that with four failures. Proven by a unit case for a future
  `publishAt` and `publish-schedule.spec.ts:121`.

## Round 2

- **Range:** `2d71d40..dde1796` (code `37662ca..b9aae41`) — 15 files, +377/−33
- **Verdict:** `PASS WITH FINDINGS` — 0 Critical, 2 Medium, 3 Low

Round 1's seven findings were confirmed closed in the code, with the fixes read rather than taken
on report. The round then found a regression the R1 date fix introduced and two counts that had
not moved with the rule.

**F1 — `??` conflated a cleared `publishDate` with an absent one — resolved in R2 (`21722ff`)**

- File: `src/collections/Reviews.ts:478`
- What: `data.publishDate ?? originalDoc?.publishDate` treats an explicit `null` (the author
  clearing the field) as "fall back to the stored value", so a published review could be saved
  with a schedule and no date. The pre-R1 code got this right, which makes it a regression.
- Fix (applied): `data.publishDate !== undefined ? data.publishDate : originalDoc?.publishDate`,
  with a unit case feeding `publishDate: null` over an `originalDoc` that carries an author date.

**F2 — Approved comments on a scheduled review stay readable anonymously — recorded as debt**

- File: `src/app/actions/comments.ts:267-283`, `src/collections/Comments.ts:34-39`
- What: neither `getApprovedComments` nor the comments collection's anonymous `access.read`
  consults the parent review's status or schedule.
- Why it is not a track finding: it predates this track, it is outside FR-5's enumerated surfaces,
  and — as the reviewer verified against Payload's relationship population — an anonymous REST
  read of a review that fails `access.read` degrades to its id, so `/api/comments?depth=2` yields
  a number, not the review's title or body. What remains readable is comment text that was public
  before the review was scheduled, plus the existence of an id. Low impact; recorded, not
  papered over.

**F3 — The reading-list card and OG route counted the scheduled review — resolved in R2 (`59fcfdf`)**

- File: `src/components/ReadingListCard.tsx:34-39`, `…/reading-lists/[slug]/opengraph-image.tsx:43-46`
- Fix (applied): both filter with `isPubliclyVisible`, keeping an unpopulated numeric id rather
  than dropping it so the badge can never advertise "0 books". Proven by
  `publish-schedule.spec.ts:122`, which asserts the card and the detail grid agree at four.

**F4 — `FeedReview`'s optional fields make the `select` a drift point — accepted as design**

The reviewer itself called the `select` change the fix; requiring the type would move the same
drift one file over. No action.

**F5 — Phase R1's Touches omitted `publish-visibility.ts`; a task was ticked for a test never
written — resolved by the primary in `7f93c1c`**

Touches amended and `R1.T3.2` reworded to what was actually delivered.

## Round 3

- **Range:** `dde1796..4041cd1` (code `7f93c1c..efa311d`) — 4 files
- **Verdict:** `PASS WITH FINDINGS` — 0 Critical, 0 High, 0 Medium, 3 Low

**F1 — The fill still read the schedule only from the body — resolved in R3 (`03ab44e`)**

- File: `src/collections/Reviews.ts:485`
- What: `if (data.publishAt)` meant a partial `PATCH { publishDate: null }` over a review whose
  schedule lived only in `originalDoc` saved it scheduled with no date — the state the hook's own
  comment says must not happen.
- Fix (applied): `const schedule = data.publishAt !== undefined ? data.publishAt : originalDoc?.publishAt;`
  and fill from `schedule`. Two unit cases: a cleared date over a stored schedule refills; clearing
  both leaves it empty.

**F2 — The login helper could not fit its own retry budget — resolved in R3 (`1c4fdde` + my correction)**

- File: `e2e/fixtures/admin-session.ts:49`
- What: the `Sign In` click was unbounded, and the helper's waits summed to more than the 120 s the
  admin specs allow, so the third attempt could never run.
- Fix (applied): the click is bounded. My brief prescribed 20 s and the phase correctly objected
  that 30 + 3 × 50 = 180 s does not fit; the final bound is **10 s**, giving 105 s on the
  all-failures path and 70 s on the success path, with the arithmetic stated in the comment.
  Behavioural proof: every admin spec passes inside its cap, logins taking 3.8–5.5 s.

**F3 — My round-2 evidence note understated the timeout change — corrected**

The note said 8 files and two admin specs; the range is 12 files and six specs. Corrected in the
evidence file before this record was written.

## Overrides

None. No Critical or High remained open at any final verdict.

## Plan compliance

- Six phases, each with `**Result:** verified`, a checkpoint and an evidence file: Phase 1
  `c76ba18`, Phase 2 `ba97843`, Phase 3 `b519fdd`, R1 `b9aae41`, R2 `a198b1f`, R3 `efa311d`.
- No task was dropped. Three plan amendments were made by the primary and each is explained: the
  coverage audit (`965ee85`), the root `src/collections/Reviews.ts` added to Phase 3's Touches
  because registering admin components lives there while `src/collections/Reviews/**` does not
  cover it (`b18c29f`), and the R3 phase itself (`fc9b94f`).
- Every phase diff stayed within its Touches plus reported deviations, all listed in the phase
  evidence and accepted by the primary.
- Two bookkeeping defects were found and fixed during acceptance: Phase 2's status left
  `in_progress` by a replace that did not match, and the R2 evidence note's file count.

## Out of scope

The English 404 body, the dynamic browse page, reader-local schedule display, a second authority
for preview, comment and byline translation, the `payload migrate:down` CLI proof, and the
comments-read surface behind round-2 F2 — all carried or newly recorded debt.

## Debt

- `publish-state.ts:133` is a defensive `return null` the derivation cannot reach.
- The `Live`-after-elapse branch still has no database row that has actually elapsed; it rests on
  the predicate, the derivation and the undated fixtures.
- Anonymous reads of comments attached to a scheduled review (round-2 F2): pre-existing, outside
  FR-5's surfaces, and limited to comment text plus an id.
- The `[WebServer] [Warmup] Server did not become ready` warning appears in green runs; the admin
  timeouts make a slow warm-up survivable rather than fixing it.
- Coverage and the browser suite were not re-run by the reviewer in rounds 2 and 3 (shell policy
  denies coverage; e2e needs the harness database); disclosed rather than assumed.

## Doc sync

`updated` — the pre-review sync rewrote `docs/ADMIN_GUIDE.md` (a *To Schedule a Review* section, a
preview section, the list column and the `publishDate` fill, replacing "Scheduled publishing is
not available") and `README.md`'s draft-and-publish bullet. The post-review sync re-checked the
guide's claim: it enumerates the surfaces (own page, home, reviews list, RSS feeds, sitemap)
rather than claiming "every public surface", so it stays true with F2 recorded as debt.
`conductor/tech-stack.md` needed nothing further.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 1 | 3 | 3 | 7 |
| 2 | PASS WITH FINDINGS | 0 | 0 | 2 | 3 | 2 |
| 3 | PASS WITH FINDINGS | 0 | 0 | 0 | 3 | 3 |
