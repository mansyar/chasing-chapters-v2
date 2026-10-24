# Phase 3 verification — Admin Surface, Fixture and Proof

| Field | Value |
| --- | --- |
| Track | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Phase | 3 — Admin Surface, Fixture and Proof |
| Date | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base | `b18c29f` (Phase 2's head, `feat/20261024-draft-preview-scheduling` at the start of this phase) |
| Head | `ef09918` (code); this file lands in the follow-up `docs(conductor)` commit recorded in the phase report |
| Result | **verified** — all five commands exit 0, AC-7 / AC-9 / AC-10 proved, AC-1..AC-6 and AC-8 re-proved |
| Commits | `29de318` (P3.T1), `0df48ea` (P3.T2), `ef09918` (P3.T3) |

## Verification

The brief's chain, run once from a clean tree, with the harness environment exported
for `bun run build` (`DATABASE_URI` = `.env`'s URI with the database suffix `_e2e`,
`STORAGE_ADAPTER=local`, `NEXT_PUBLIC_R2_PUBLIC_URL=""`; `.env` untouched):

```
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| # | Command | Exit | Real numbers |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | `No type errors in 246 files` |
| 2 | `bun run lint` | 0 | `Checked 236 files in 374ms. No fixes applied.` |
| 3 | `bun test` | 0 | `574 pass`, `0 fail`, `1319 expect() calls`, `Ran 574 tests across 46 files [28.91s]` |
| 4 | `bun run test:e2e` | 0 | `Running 108 tests using 3 workers … 108 passed (4.7m)` — includes the three new cases |
| 5 | `bun run build` | 0 | 27 static pages generated; route table below |

Chain exit code: **0**.

Counts against the phases before this one: unit suite 555 → 574 cases (+19: 13 in
`publishState.test.ts`, 3 in `publishAt.test.ts`, 1 in `translateReview.test.ts`, 1 in
`e2e-harness.test.ts`, 1 pre-existing case extended), browser suite 105 → 108 (+3).

### Build route table (`bun run build`, AC-10)

```
┌ ○ /_not-found
├   /[locale]
│ ├ ● /en
│ └ ● /id
├   /[locale]/about
│ ├ ● /en/about
│ └ ● /id/about
├   /[locale]/feed.xml
│ ├ ● /en/feed.xml
│ └ ● /id/feed.xml
├   /[locale]/reading-lists
│ ├ ● /en/reading-lists
│ └ ● /id/reading-lists
├   /[locale]/reading-lists/[slug]
│ ├ ● /en/reading-lists/e2e-fixture-rainy-season-reading-list
│ └ ● /id/reading-lists/e2e-fixture-rainy-season-reading-list
├ ƒ /[locale]/reading-lists/[slug]/opengraph-image-g9de6a
├ ƒ /[locale]/reviews
├   /[locale]/reviews/[slug]
│ ├ ● /en/reviews/e2e-fixture-nine-kinds-of-weather
│ ├ ● /en/reviews/e2e-fixture-the-cartographers-error
│ ├ ● /en/reviews/e2e-fixture-salt-and-paper-lanterns
│ └ ● [+5 more paths]
├ ƒ /[locale]/reviews/[slug]/opengraph-image-1v12u2
├ ƒ /admin/[[...segments]]
├ ƒ /api/[...slug]
├ ƒ /api/preview
├ ƒ /api/preview/exit
├ ƒ /api/translation/bulk-retranslate
├ ƒ /feed.xml
├ ○ /robots.txt
└ ƒ /sitemap.xml
```

`/[locale]/reviews/[slug]` is still `●` (SSG) with the same **eight** pre-rendered
paths as Phases 1 and 2 — four publicly visible reviews × two locales, named three
plus `[+5 more paths]`. The never-published draft and the 2030-scheduled review
appear in neither the named rows nor the count, so the new fixture document is not
pre-rendered. `/admin/[[...segments]]`, `/api/preview`, `/api/preview/exit`,
`/[locale]/reviews`, both `opengraph-image` handlers, `/feed.xml` and
`/sitemap.xml` are `ƒ` exactly as in Phase 2; `/robots.txt` stays `○`.

The one build warning (`google-gax … Can't resolve '../../package.json'`) is
pre-existing on this branch and unrelated to this phase.

## Acceptance criteria

### This phase's criteria

| AC | Claim | Proof | Result |
| --- | --- | --- | --- |
| AC-7 | The list tells a scheduled review from a live one, and the edit view states when a review will publish or that it is live | browser `admin-review-schedule › tells a scheduled review from a live one in the list` and `… › states when a review will publish in the edit view`; unit `publishState.test.ts` (13 cases) and `publishAt.test.ts › the admin surfaces that name the state` (3 cases) | pass |
| AC-9 | Translation behaviour is unchanged: saving still translates, previewing writes nothing, a failed translation does not delay the scheduled publish | (1) browser `admin-draft-preview › writes no translation state and lists nothing while previewing` — re-asserted for the new draft by asserting its `translationStatus` stays `untranslated` after a preview; (2) unit `translateReview.test.ts › saving only the schedule → none (a publishAt edit starts no translation)` plus the pre-existing `first publish with auto-translate ON → translate` and `text changed with auto-translate ON → translate`; (3) unit `publishAt.test.ts › a translation that never succeeds` | pass |
| AC-10 | Both review detail routes are still pre-rendered and the whole chain passes | the build table above (8 `●` review paths) and the command table (chain exit 0) | pass |

### AC-1..AC-6 and AC-8 re-proof

The earlier phases' proofs still hold; this phase re-ran every one of them inside the
same 108-test run.

| AC | Spec case or unit test | Phase |
| --- | --- | --- |
| AC-1 | `admin-draft-preview › refuses the entry without a session and leaves the review hidden` (401, no `set-cookie`, `/en` + `/id` 404) and `… › previews the scheduled review, switches locale in preview and exits` (banner) | 2, re-run |
| AC-2 | never-published half: `admin-draft-preview › previews a never-published draft and leaves it unpublished` (**new**); future-`publishAt` half: `… › previews the scheduled review, switches locale in preview and exits` | 3 (new) / 2 |
| AC-3 | banner text, other-locale link (`/id/...`, `html[lang=id]`, "Pratinjau") and exit in both preview cases | 2, extended in 3 |
| AC-4 | `admin-draft-preview › previews the scheduled review…` (`cache-control` private + no-store, `noindex`/`nofollow`, zero canonical/hreflang/`og:image`) and `… › writes no translation state and lists nothing while previewing` (sitemap, feed) | 2, re-run |
| AC-5 | `publish-schedule.spec.ts`: `404s its own URL in both locales`, `stays off the home page's latest reviews`, `stays out of the browse list in both locales`, `stays out of both feeds`, `stays out of the sitemap` (now also asserts the draft slug is absent), `serves no Open Graph image for it` | 1, extended in 3 |
| AC-6 | `publishAt.test.ts › the publishAt field` (optional date, sidebar, no default, exact description) — a writer sets and clears it through the sidebar field | 1, re-run |
| AC-8 | `publishAt.test.ts › filling publishDate from the schedule` (6 cases: fills, fills on a draft, never overwrites, leaves alone when cleared, keeps created date, leaves an undated draft undated) | 1, re-run |

## Requirements

| Requirement | How this phase meets it | Proof |
| --- | --- | --- |
| FR-7 | The list column and the edit-view sentence are both derived from one pure function, `reviewPublishState` / `publishScheduleNotice` in `src/collections/Reviews/admin/publish-state.ts`; the list cell and the sidebar notice are the only two consumers | `publishState.test.ts` (13), `publishAt.test.ts › the admin surfaces that name the state` (3), `review-schedule.spec.ts` (2) |
| FR-9 | Scheduling is not a content change: `decideTranslationAction` still returns `none` for a schedule-only save, a save that changes English text still returns `translate`, and the visibility predicate never reads `translationStatus`, so a failed translation cannot move the publish moment | `translateReview.test.ts › saving only the schedule…`, `publishAt.test.ts › a translation that never succeeds` |
| NFR-5 | The existing surface stays green | the five-command table, exit 0 |

## What the admin now shows

| Surface | State | Value | Registered at |
| --- | --- | --- | --- |
| Reviews list, `Publish At` column | published, `publishAt` in the future | **Scheduled** (`--theme-warning-500`, weight 600; tooltip = the stored ISO instant) | `publishAt.admin.components.Cell` = `/collections/Reviews/admin/PublishStateCell#PublishStateCell` |
| Reviews list, `Publish At` column | published, no schedule or a past one | **Live** (`--theme-success-500`) | same |
| Reviews list, `Publish At` column | never published (`_status` ≠ `published`) | **Draft** (`--theme-elevation-400`), even when a future `publishAt` is set | same |
| Review edit view, sidebar, directly under `Publish At` | published, future `publishAt` | `Scheduled to publish on 1 January 2030 at 00:00 UTC.` | `ui` field `publishScheduleNotice` after `publishAt`, `admin.components.Field` = `/collections/Reviews/admin/PublishScheduleNotice#PublishScheduleNotice` |
| Review edit view, sidebar, directly under `Publish At` | published, live | `Live. Readers can see this review now.` | same |
| Review edit view, sidebar, directly under `Publish At` | never published | nothing (the sidebar already says draft) | same |

Supporting changes, all in `src/collections/Reviews.ts` / generated output:

- `admin.defaultColumns` is now `title, bookAuthor, rating, status, translationStatus,
  publishDate, publishAt` — without it the new cell would never be visible.
- The moment is rendered in **UTC** with the zone named in the copy. The field stores
  an instant and Payload's picker shows it in the browser's zone; naming UTC keeps the
  sentence identical for every author of the same review. The date is formatted with
  `Intl.DateTimeFormat` (`en-GB`, `dateStyle: long`, `hourCycle: h23`), not
  `date-fns`, so the string is stable across Node and the browser.
- The notice reads `publishAt` through `useField` rather than
  `useDocumentInfo().data`, because the document context holds the last **saved**
  document — a notice built from it would keep saying "Live" while the author is
  picking a future date. The saved document is the fallback for the first render.
  `_status` comes from the document context; the value is only what the review will
  become once saved, which is what the sentence describes.
- `src/app/(payload)/admin/importMap.js` was regenerated with
  `bunx payload generate:importmap` (never hand-edited): it now imports
  `PublishScheduleNotice` and `PublishStateCell` from
  `../../../collections/Reviews/admin/…` and maps both component paths.

## The draft fixture

| Field | Value |
| --- | --- |
| Constant | `E2E_FIXTURE_DRAFT_REVIEW` (`src/lib/e2e-harness.ts`), plus `E2E_FIXTURE_DRAFT_REVIEW_SLUG` and `E2E_FIXTURE_DRAFT_REVIEW_PATH` |
| Title | `E2E Fixture: The Unwritten Letter` |
| Slug / path | `e2e-fixture-the-unwritten-letter` / `/reviews/e2e-fixture-the-unwritten-letter` |
| Author / rating | `Noor Haddad` / 3 |
| Status | `_status: "draft"`, `translationStatus: "untranslated"`, `autoTranslate: false`, no `publishDate`, no `publishAt`, empty `id` body |
| Seeded by | `upsertDraftReview` in `e2e/global-setup.ts`, called from `seedE2EDataset` after the reading list, with `context: { skipTranslation: true }` |
| Asserts | AC-2 (`admin-draft-preview › previews a never-published draft and leaves it unpublished`: 404 in both locales without a session, renders under draft mode with the banner, other-locale link keeps the English body, exit returns it to 404), AC-1/AC-3/AC-4 for a document that was never published, AC-7 (`Draft` in the list, no notice in the edit view) and AC-2's sitemap half (`publish-schedule.spec.ts › stays out of the sitemap`) |

**Kept out of `E2E_FIXTURE_REVIEWS`.** The dataset stays exactly five reviews, so every
index-based reference (`E2E_FIXTURE_REVIEWS[2]` for the failed review, `[3]` for the
stale one, the reading list's review ids, `locale-metadata.spec.ts`'s
`VISIBLE_FIXTURE_SLUGS` filter, `e2e-harness.test.ts`'s slug and `publishDate` arrays)
is untouched. The draft has its own constant, its own upsert path and its own
lookup (`draft: true`, because the published view of the collection does not contain
it — without it every seed would create another copy).

**Idempotent across two seeds.** The chain in this phase ran `seed:e2e` on a database
the previous `bun run test:e2e` on the same machine had already seeded, and logged
`Review "E2E Fixture: The Unwritten Letter" changed` — an update, not a create. The
admin list case's row locator (`page.locator("tr", { hasText: title })`) is a strict
locator inside `toContainText`, so a second row with the same title would have thrown;
it passed, so exactly one draft exists after two seeds.

**The attention bell did not move.** `admin-attention-bell › counts the reviews needing
attention and links to their edit views` still passes and still asserts
`aria-label="translations needing attention: 2"`. The draft is seeded `untranslated`,
not `failed` or `stale`, so it is not counted — the bell keeps counting real problems
rather than being loosened to accommodate the fixture.

## Deviations

| File | Why |
| --- | --- |
| `playwright.config.ts` | A third admin project, `admin-review-schedule`, chained after `admin-draft-preview`, is required for the new admin spec to run serially with the other admin specs (they share one fixture and one session). |
| `src/lib/__tests__/e2e-harness.test.ts` | The fixture dataset's own pins live here, so the guarantees this phase depends on (the draft is not one of the five seeded reviews, its slug derives the way the collection derives it) belong next to the existing ones. `src/lib/__tests__/**` is outside the brief's `Touches` list. |

No product behaviour outside FR-7/FR-9 changed: no `revalidate` value, access rule,
publishing gate, visibility predicate, translation pipeline or migration was touched.

## Notes for the primary

- The `Publish At` list column now renders the **state word**, not the stored date;
  the date is on the cell's `title` attribute. This is what "distinguishes scheduled
  from live" needs, and it keeps the column narrow, but it does mean an author who
  wants to read the raw instant has to hover. Say the word if the date should also be
  printed beside the word.
- The notice is deliberately UTC. If the product wants the reader's local zone, the
  copy has to carry it — the two surfaces (list tooltip ISO, notice UTC) would
  otherwise disagree.
- Both admin components are thin: the derivation, the labels and the two sentences
  live in `src/collections/Reviews/admin/publish-state.ts` and are unit-tested without
  a browser. That module is the place to change if the wording or the rule moves.
- Phase 3's earlier residual risk ("no past non-null `publishAt` row") is unchanged:
  the `Live` branch is proved by the predicate, the derivation and the fixture's
  undated reviews, not by a row whose schedule has elapsed.
- This evidence file is committed separately (a `docs(conductor)` commit) after the
  three task commits, so the tree at `ef09918` is the code head.

## Primary verification

Recorded by the primary after the phase reported, from its own run of the gate on
the same tree — not from the report.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no type errors |
| `bun run lint` | 0 | no fixes applied |
| `bun test` | 0 | **574 pass, 0 fail**, 46 files |
| `bun run test:e2e` | 0 | **108 passed (3.7 m)**, 0 failed, 0 skipped |
| `bun run build` | 0 | both review detail routes still `●` (`/en/reviews/…` ×3 printed plus `[+5 more paths]` = the same 8 pre-rendered paths as Phases 1 and 2) |

The configured phase command (`… && bun run build`) exited 0. The build ran with
`DATABASE_URI` at the harness database, `STORAGE_ADAPTER=local` and an empty
`NEXT_PUBLIC_R2_PUBLIC_URL`, as in the previous phases; the local dev database is
still unbuildable for the pre-existing ledger reason.

**Diff against Touches.** `b18c29f..HEAD` is 16 files and +1032/−15: every path is
inside Touches except `src/lib/__tests__/e2e-harness.test.ts` and
`playwright.config.ts`, both reported as deviations. No unreported file. Four
commits, none a merge, amend or user commit.

**Checked in the code, not the report.**

- `publish-state.ts` derives one answer from the two fields the public gate reads,
  imports nothing (no React, no payload client, no I/O) and states the same
  precedence the visibility module does: not published → Draft even when a future
  `publishAt` is set; published with a future moment → Scheduled; otherwise Live,
  including an unreadable `publishAt`. The 13 unit cases cover each branch, the
  unreadable value and the label set.
- The list cell uses Payload's `rowData` (the prop exists in the installed
  `DefaultCellComponentProps`, so the design did not have to be compromised) and
  keeps the stored instant on the `title` attribute. `publishAt` is registered in
  `admin.defaultColumns`, and both components are registered through
  `bunx payload generate:importmap` — the two import-map entries are generator
  output, not hand-written.
- The notice reads `publishAt` through `useField` rather than `useDocumentInfo().data`,
  which is the difference between following an unsaved edit and showing the last
  saved state; the document is only the first-render fallback. Its sentence is
  suppressed for a draft, which is the state where it would be noise.
- The draft fixture is its own constant, its own `draft: true` lookup and its own
  upsert path, and is **outside** `E2E_FIXTURE_REVIEWS` — so the index-based
  references and `E2E_FIXTURE_PUBLIC_REVIEWS` were never at risk. The attention
  bell spec still asserts the absolute count of 2 and passed, which is the
  evidence that an `untranslated` draft does not enter the attention query.
- The admin spec is discriminating rather than decorative: it asserts the draft
  row says `Draft` **and** does not say `Scheduled` or `Live`, and that the draft's
  edit view says neither sentence.
- AC-9 is pinned where it can actually be wrong: `decideTranslationAction` on a
  save that only changes `publishAt` returns `none` (scheduling is not content),
  and a `failed` translation becomes visible at its moment, so the gate does not
  read `translationStatus`.

**Deviations accepted.** `playwright.config.ts` (a third chained admin project —
the admin specs share one fixture and one session, which is the lesson Phase 2
paid for) and `src/lib/__tests__/e2e-harness.test.ts` (the fixture's own pins
belong beside the existing ones).

**Residual, recorded for review rather than papered over.** (1) `FR-7`'s "when"
is stated in the edit view; the list shows the state word with the instant only in
a tooltip. That satisfies the requirement as written but is the one place a
reviewer could argue for more. (2) The `Live`-after-elapse branch still has no
database row that has actually elapsed; it is proved by the predicate and the
derivation only.

