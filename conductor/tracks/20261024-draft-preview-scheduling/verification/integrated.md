# Integrated Verification — Draft Preview & Scheduled Publishing

| Field  | Value |
| ------ | ----- |
| Track  | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Date   | 2026-10-25 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base   | `233d826516af4ff2f76de97ab20742314ccedea3` |
| Head   | `ddd8b23` (code through `b519fdd`; doc-sync commits follow) |
| Result | **verified** |

Run on the track branch after all three phases were verified, with the full
configured strategy — static checks, unit suite with coverage, the browser suite and
a production build.

## Commands

| # | Command | Exit | Result |
| - | ------- | ---- | ------ |
| 1 | `bun run typecheck` | 0 | no type errors (246 files) |
| 2 | `bun run lint` | 0 | no fixes applied (236 files) |
| 3 | `bun test --coverage` | 0 | **574 pass, 0 fail**, 46 files; all files **81.30 % functions / 89.94 % lines** against the 80 % new-code gate |
| 4 | `bun run test:e2e` | 0 | **108 passed, 0 failed, 0 skipped** (5.1 m), against the harness database and a fresh standalone build |
| 5 | `bun run build` | 0 | production build green; both review detail routes still `●` (the 8 pre-rendered paths plus `[+5 more paths]`) |

Steps 4 and 5 ran with `DATABASE_URI` at the harness database
(`chasing-chapters_e2e`), `STORAGE_ADAPTER=local` and an empty
`NEXT_PUBLIC_R2_PUBLIC_URL`, as in the previous phases. The local *dev* database is
still unbuildable for the pre-existing migration-ledger reason recorded in the
bilingual track; that is an environment repair, not a track defect, and CI migrates
a fresh database.

**Baseline:** 524 unit tests and 95 browser specs at the track's base commit. At the
head: **574 unit (+50)** and **108 browser (+13)**.

## New-code coverage

| File | Funcs | Lines |
| ---- | ----- | ----- |
| `src/lib/publish-visibility.ts` | 100.00 | 100.00 |
| `src/lib/preview.ts` | 100.00 | 100.00 |
| `src/collections/Reviews/admin/publish-state.ts` | 100.00 | 98.33 |
| `src/lib/e2e-harness.ts` | 92.86 | 98.26 |

The one uncovered line in `publish-state.ts` (133) is a defensive `return null` in
`publishScheduleNotice` that cannot be reached, because a `scheduled` state is only
produced when `scheduledMoment` returned a readable future instant. The uncovered
lines in `e2e-harness.ts` are the same defensive URI-parser branches as before.

## Requirements

| ID | Requirement | Implemented by | Verified by | Status |
| -- | ----------- | -------------- | ----------- | ------ |
| FR-1 | Session-authorised preview entry per review and locale, 401 for anonymous | `src/app/(payload)/api/preview/route.ts`, `Reviews.admin.preview` | `admin-draft-preview > refuses the entry without a session and leaves the review hidden` | covered |
| FR-2 | Draft mode renders the newest version, including never-published; session still required | `loadReview` in the review page, `canRenderDraft` | `. > previews a never-published draft and leaves it unpublished`; `. > previews the scheduled review, …` | covered |
| FR-3 | Banner naming the preview, other-locale link, exit to the same URL | `PreviewBanner.tsx`, `/api/preview/exit` | both preview cases (banner, `/id/…`, "Pratinjau", exit, banner gone) | covered |
| FR-4 | No caching, no indexing, no canonical/hreflang/OG image; absent from sitemap and feeds | `buildPreviewMetadata`, route-level `robots` | `. > previews the scheduled review, …`; `. > writes no translation state and lists nothing while previewing` | covered |
| FR-5 | Visibility = published and (`publishAt` unset or not future), applied through one rule | `src/lib/publish-visibility.ts`, seven public reads | `publish-visibility.test.ts` (9 cases); six `publish-schedule.spec.ts` cases | covered |
| FR-6 | Optional UTC `publishAt`, writer+admin editable, sidebar, clearing publishes immediately | `Reviews.publishAt` | `publishAt.test.ts > the publishAt field` (3 cases) | covered |
| FR-7 | List indicates the schedule; edit view states the moment | `publish-state.ts`, `PublishStateCell.tsx`, `PublishScheduleNotice.tsx` | `admin-review-schedule` (2 cases); `publishState.test.ts` (13 cases) | covered |
| FR-8 | Scheduling fills an empty `publishDate`, never overwrites an author value | `Reviews` beforeChange hook | `publishAt.test.ts > filling publishDate from the schedule` (6 cases) | covered |
| FR-9 | Scheduling does not change translation behaviour | unchanged pipeline + `decideTranslationAction` | `translateReview.test.ts > saving only the schedule → none`; `publishAt.test.ts > a translation that never succeeds` (2) | covered |
| NFR-1 | Public routes stay pre-rendered | draft-mode branch ordering (`draftMode()` first, session inside) | build route table: both detail routes `●`, 8 paths, identical to Phases 1–2 | covered |
| NFR-2 | No new secret, no new env var | session cookie as the only authority | the entry route reads `payload.auth`; no secret appears in any URL or config | covered |
| NFR-3 | Draft content never reaches ISR, the translation cache, the sitemap or a feed | `private, no-store` + preview metadata + unchanged public reads | `. > writes no translation state and lists nothing while previewing` | covered |
| NFR-4 | One visibility predicate shared by every public read | `publish-visibility.ts` imported by all seven sites | grep of call sites + unit case pinning the fragment shape | covered |
| NFR-5 | Existing surface stays green | — | the five commands above, all exit 0 | covered |

## Acceptance criteria

| ID | Criterion | Proof in this run |
| -- | --------- | ----------------- |
| AC-1 | 401 unsigned with nothing enabled; signed-in redirect + banner | `admin-draft-preview > refuses the entry without a session…` (401 and **no `set-cookie`**), `. > previews the scheduled review…` (307, empty query, bypass cookie) |
| AC-2 | Never-published draft and future-`publishAt` review render in draft mode, 404 outside | `. > previews a never-published draft and leaves it unpublished`, `. > previews the scheduled review…` |
| AC-3 | Banner, other-locale link stays in draft mode, Exit clears it | both preview cases: banner text, `/id/…` with `html[lang=id]`, exit re-renders the same URL without the banner and **404 for the hidden review** |
| AC-4 | `noindex, nofollow`, `private, no-store`, no canonical/hreflang/OG image, absent from sitemap and feed | `. > previews the scheduled review…` (header and zero-count assertions), `. > writes no translation state…` (sitemap + feed bodies) |
| AC-5 | Future `publishAt` absent from every public surface until the moment | `publish-schedule.spec.ts`: own URL both locales, home latest, browse both locales, both feeds, sitemap, OG image |
| AC-6 | Writer sets and clears the schedule; access rules unchanged | `publishAt.test.ts > the publishAt field`; `Reviews.access` untouched in the diff |
| AC-7 | List distinguishes scheduled from live; edit view states the moment | `admin-review-schedule > tells a scheduled review from a live one in the list`, `. > states when a review will publish in the edit view` |
| AC-8 | Empty `publishDate` filled, author value kept | `publishAt.test.ts > filling publishDate from the schedule` |
| AC-9 | Saving still translates, previewing writes nothing, a failed translation never delays publish | `translateReview.test.ts > saving only the schedule → none`; `. > writes no translation state…`; `publishAt.test.ts > a translation that never succeeds` |
| AC-10 | Detail routes still pre-rendered and the chain passes | build route table (8 review paths, `●`) + the five-command table |

## Pre-rendering

The build's route table reports `● /[locale]/reviews/[slug]` with the same eight
pre-rendered paths as Phases 1 and 2, and `ƒ` only for the browse page (which reads
`searchParams`), both `opengraph-image` handlers, `/feed.xml`, `/sitemap.xml`, the
admin and API routes, the two new preview handlers and `Proxy`. Draft mode is
therefore behaving as a per-request bypass rather than a switch to dynamic
rendering, which is the invariant this track was not allowed to trade away.

## Deviations and notes

- **`RelatedReviews.tsx`** now uses the shared visibility rule. It is a public read
  that was outside Phase 1's Touches; leaving it ungated would have surfaced a
  scheduled review on every related-cards strip.
- **The fixture grew a sixth document.** `E2E_FIXTURE_REVIEWS` stays at five so
  index-based references keep pointing at the same reviews; the never-published
  draft and the 2030-scheduled review are separate constants. The attention bell
  still asserts an absolute count of 2, which is the proof that neither new
  document enters that query.
- **Admin specs are serial and chained** (`admin-attention-bell` →
  `admin-bulk-retranslate` → `admin-translation-poller` →
  `admin-locale-preference` → `admin-draft-preview` → `admin-review-schedule`) because
  they share one fixture admin and one session. This is a harness decision, not
  product behaviour.
- **`publishAt` joins `admin.defaultColumns`** and renders as a state word with the
  stored instant on the cell's `title`. The edit view states the moment in words.
- **The preview notice is deliberately UTC**, because the field stores an instant and
  a browser-local rendering would disagree between authors. The zone is named in the
  copy so the value is unambiguous.
- **Access is the collection's own policy**: any signed-in user who can read the
  document can preview it. No new permission model was invented, and NFR-2 forbids a
  second authority.
- **`eval` debt carried from earlier tracks** (English 404 body, dynamic browse page,
  the `payload migrate:down` CLI wrapper unproven) is unchanged and untouched here.

## Follow-ups

1. A past-dated `publishAt` fixture would exercise the `Live`-after-elapse branch
   against real SQL; today it rests on the pure predicate and the derivation.
2. If the product wants a reader-local schedule display, the copy has to carry the
   zone; a silent local rendering would disagree with the tooltip.
3. `payload migrate:down` still needs one CLI-supervised rollback proof once the
   permission set allows it.

## Evidence

- `verification/phase-1.md` — publishing gate
- `verification/phase-2.md` — preview entry and draft rendering
- `verification/phase-3.md` — admin surface, fixture and proof
- `review.md` — written by `conductor-review`
