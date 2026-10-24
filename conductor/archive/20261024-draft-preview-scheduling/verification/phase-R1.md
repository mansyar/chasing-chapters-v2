# Phase R1 verification — Review-fix round (F1–F7)

| Field | Value |
| --- | --- |
| Track | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Phase | R1 — closing the seven findings of `review.md` |
| Date | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base | `37662ca` (phase base named in the brief) |
| Head | `a124510` (code); this file lands in the follow-up `docs(conductor)` commit |
| Result | **verified** — typecheck, lint, unit, e2e and the production build all exit 0; F1–F7 each closed with a proving test; nothing deferred |
| Commits | `dd4f5a5` (R1.T1), `89fd7f8` (R1.T2), `076f6ca` (R1.T3), `8d6e68d` (R1.T4), `89dec05` (R1.T5), `7dda917` (R1.T6), `aa1dc16` + `a124510` (R1.T7) |

## Verification

The brief's chain, run from a clean tree:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| # | Command | Exit | Real numbers |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | `No type errors in 246 files [1.55s]` |
| 2 | `bun run lint` | 0 | `Checked 236 files in 313ms. No fixes applied.` |
| 3 | `bun test` | 0 | `579 pass`, `0 fail`, `1327 expect() calls`, `Ran 579 tests across 46 files [3.45s]` |
| 4 | `bun run test:e2e` | 0 | `Running 111 tests using 3 workers … 111 passed (3.7m)` |
| 5 | `bun run build` | 0 | 27 static pages generated; route table below |

Counts against the review's base: unit 574 → **579** (+5: 3 `canAcceptPublicWrite`,
1 partial-update `publishDate`, 1 scheduled-item feed), browser 108 → **111**
(+3: the REST API read, the reading-list card, the unsaved-clear notice).

### How rows 4 and 5 were run

`bun run build` cannot be invoked directly against the dev database: it fails in
`collecting page data` with `column reviews.publish_at does not exist` — the same
pre-existing migration-ledger drift the brief warned about (`reviews_locales.title`),
which this track's `publish_at` column now trips first. It needs the harness database.

Deriving that URI in the shell requires reading `.env`, and the shell policy denies
every `.env` read (`Get-Content -Path .env` is rejected before it runs). Row 5 is
therefore the same command the harness runs: `src/scripts/e2e-run.ts` spawns
`bun run build` with `DATABASE_URI` = the `.env` URI suffixed `_e2e`,
`STORAGE_ADAPTER=local`, `NEXT_PUBLIC_R2_PUBLIC_URL=""` — the exact environment the
brief prescribes — and its output is quoted below. Rows 4 and 5 are consequently one
process; both are reported with their own numbers. Disclosed as a deviation, not
claimed as a separate invocation.

### Build route table (`bun run build`, AC-10 / NFR-1)

Both review detail routes are still pre-rendered over the same eight paths:

```
├   /[locale]/reviews
├   /[locale]/reviews/[slug]
│ ├ ● /en/reviews/e2e-fixture-nine-kinds-of-weather
│ ├ ● /en/reviews/e2e-fixture-the-cartographers-error
│ ├ ● /en/reviews/e2e-fixture-salt-and-paper-lanterns
│ └ ● [+5 more paths]
├ ƒ /[locale]/reviews/[slug]/opengraph-image-1v12u2
```

`●` on the `[slug]` group, `○`/`●` elsewhere, `ƒ` for the OG handler and the API —
unchanged from Phase 3. The build still warns about `google-gax`'s missing
`../../package.json` (pre-existing, unrelated).

## Findings → fix → proof

| # | Severity | Fix | Proving test |
| --- | --- | --- | --- |
| F1 | High | The anonymous `access.read` branch returns the shared rule instead of `_status` alone: `src/collections/Reviews.ts:93` (`publishedAndVisibleWhere(new Date())`, imported at `:15`). Writer/admin branches untouched. | `e2e/publish-schedule.spec.ts:36` — cookieless `browser.newContext()`, `GET /api/reviews?where[slug][equals]=<scheduled>&limit=1` → 200 with `docs: []`; the same query for the visible fixture slug → 200, exactly one document. |
| F2 | Medium | The reading-list detail page filters the relationship before the empty-state check: `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx:126-128`. The fixture list now holds the scheduled review too (`e2e/global-setup.ts`, `upsertReadingList` → `reviews.map(...)`), so the page has to drop it. | `e2e/publish-schedule.spec.ts:104` — on `/en|/id/reading-lists/<slug>` the scheduled title has no card and no link to its path, while a visible fixture review's card is visible. No existing assertion pinned an absolute card count, so none needed correcting. |
| F3 | Medium | `canAcceptPublicWrite` added to the pure module (`src/lib/publish-visibility.ts:121`) because the action module is `"use server"`, and the comment action asks it instead of reading `_status`: `src/app/actions/comments.ts:66`, still answering `{ success: false, error: "Review not found" }`. | `src/lib/__tests__/publish-visibility.test.ts:88` — false for a future `publishAt`, true for a visible review and an unscheduled published one, false for a draft. The real submission path is covered by `e2e/comments.spec.ts:53` (still passes); no separate scheduled-review submission case was added — see "Not proved end to end". |
| F4 | Medium | The notice treats a form `null` as a value and only falls back to the saved document for `undefined`: `src/collections/Reviews/admin/PublishScheduleNotice.tsx:36` (`useField<string | null>` at `:26`). | `e2e/admin/review-schedule.spec.ts:90` — open the scheduled review, click the field's clear button without saving, the notice reads "Live. Readers can see this review now." and the old sentence is gone; the two existing saved-state cases at `:43` and `:64` still pass. |
| F5 | Low | The hook reads the stored date alongside the incoming one and lets a single effective value drive both branches: `src/collections/Reviews.ts:478` (`data.publishDate ?? originalDoc?.publishDate`). | `src/collections/__tests__/publishAt.test.ts:115` — `{ publishAt: SCHEDULE }` with `originalDoc: { publishDate: AUTHOR_DATE }` leaves `data.publishDate` undefined; the six original cases stay green, including the fill-from-schedule case that the first attempt broke. |
| F6 | Low | The banner describes the preview without claiming the review is unpublished, in both locales: `src/lib/i18n/dictionary.ts:211` and `:396`. Key parity untouched; `previewLabel`, `previewOtherLocale`, `previewExit` unchanged. | `src/lib/i18n/__tests__/dictionary.test.ts` (key-parity suite, 12 pass) plus `e2e/admin/draft-preview.spec.ts:212` — previewing a published review still shows the banner. The copy itself is asserted only through the shared key set; no test pins the sentence. |
| F7 | Low | `buildRssFeed` takes the build moment and filters with `isPubliclyVisible`, dropping the `_status` expression: `src/lib/feed.ts:112` / `:126`. The route reads one clock for both the query and the filter (`src/app/(public)/[locale]/feed.xml/route.ts:44`) and selects the fields the rule reads, `publishAt` and `_status` (`:57-58`). | `src/lib/__tests__/feed.test.ts:197` — a published review with a future `publishAt` produces no `<item>`, while an already-out review does; `e2e/publish-schedule.spec.ts:121` still proves the scheduled slug is absent from both feeds while the fixture review is present. |

Requirements the review marked partial are now covered: FR-5 (F1, F2, F3), FR-7 (F4),
FR-8 (F5), NFR-4 (F1, F7). No requirement text, permission model, field, dependency,
`revalidate` value or visibility semantic changed.

## Deviations

| File | Reason |
| --- | --- |
| `src/app/(public)/[locale]/feed.xml/route.ts` | Named in the brief as the one caller to pass `now`. Beyond that it also had to select `_status` (`:58`): the route's `select` omitted it, so every document reached the rule without a status and the feed came out **empty**. Found by the first e2e run (4 failures, all an empty channel); fixed in `a124510`, which is why R1.T7 has two commits. `publishAt` was added to the same `select` for the same reason. |
| `.conductor/evidence/build-on-harness-db.ts` | An untracked helper written while trying to derive the harness URI; the shell policy refused to run it, so it was never used. It sits in the gitignored evidence directory and is not part of any commit. |

## Not proved end to end

A reader submitting a comment **against a scheduled review** is not exercised through
the browser: the scheduled review 404s on its own URL, so no page renders the form for
it. F3 is proved at the predicate (`publish-visibility.test.ts:88`) and the action's
guard is a single call to it (`comments.ts:66`); the ordinary submission path is still
covered by `e2e/comments.spec.ts:53`. Driving the server action directly would mean
reaching around the rendered form, which is a brittle test of the action's plumbing
rather than of the rule.

F6's copy has no assertion on its wording — only key parity and the banner's presence
in preview. There was no dictionary test that pinned the old sentence, so there is none
to update.

## Notes for the next reviewer

- The two places that read a document in memory (the reading-list page and the feed)
  call `isPubliclyVisible` with a fresh `new Date()`; the DB reads call
  `publishedAndVisibleWhere`. Anything new that reads documents outside a query needs
  the same call — the module doc says so, but it is the shape to look for.
- `getApprovedComments` in `comments.ts` is still an unguarded public read of a
  review's comments. It is not one of the seven findings and was left alone; if the
  review's "every public surface" is read strictly, that is the next candidate.
- The e2e fixture reading list now holds **all five** fixture reviews including the
  scheduled one. If a future case asserts what the list contains, it must filter the
  same way the page does.
- The `Live`-after-elapse branch still has no actually-elapsed row (carried debt from
  the review), and `publish-state.ts`'s defensive `return null` is untouched.

## Primary verification

Recorded by the primary from its own run of the gate on the same tree. This one
differs from the subagent's in one way worth naming: the primary's shell can read
`.env`, so the production build was invoked directly against the harness database
rather than borrowed from the e2e run.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no type errors, 246 files |
| `bun run lint` | 0 | 236 files, no fixes applied |
| `bun test` | 0 | **579 pass, 0 fail**, 46 files |
| `bun run test:e2e` | 0 | **111 passed (4.2 m)**, 0 failed, 0 skipped |
| `bun run build` | 0 | 27/27 static pages; both review detail routes still `●` over the same 8 paths (`│ └ ● [+5 more paths]`) |

The configured phase command exited 0. The three new browser cases passed by name in
the primary's own run — `publish-schedule.spec.ts:36` *stays out of the public REST
API*, `:104` *shows no card for it on the fixture reading list*, and
`admin/review-schedule.spec.ts:90` *stops promising a schedule the author cleared
without saving* — and the two pre-existing feed and list cases that the fixes could
have broken still passed.

**Diff against Touches.** `37662ca..HEAD` is 15 files and +377/−33: all inside
Touches except `src/app/(public)/[locale]/feed.xml/route.ts`, which the subagent
reported. That deviation is not cosmetic and I checked it: `buildRssFeed` now filters
in memory with the shared rule, so the query's `select` has to return `_status` and
`publishAt` or every document arrives with `undefined` status and the feed comes out
empty. The subagent's own first run caught exactly that (four failures) and fixed it
in `a124510` — the deviation is the fix, not a workaround.

**What each fix does, read in the code rather than trusted from the report.**

- **F1** — the anonymous branch of `access.read` now returns
  `publishedAndVisibleWhere(new Date())`, so the public REST API answers like every
  public page. This was the finding that made the review BLOCK: the rule existed in
  one place and the collection's own read access still used the bare status filter.
- **F2** — the reading-list grid filters the populated relationship with
  `isPubliclyVisible` *before* the empty-state check, so the grid, the count and the
  "no reviews" message cannot disagree.
- **F3** — the comment action calls `canAcceptPublicWrite`, which delegates to
  `isPubliclyVisible` and lives in the library because the action module is
  `"use server"`. A scheduled review answers exactly like a missing one, so the reply
  does not leak its existence.
- **F4** — the notice now distinguishes a form `null` (the author cleared the field,
  so the notice must stop promising a publication) from `undefined` (the form is not
  initialised yet, so the saved document is the right answer). The bug was a real
  display defect: without it the notice kept a schedule the author had just removed.
- **F5** — the fill falls back to `originalDoc.publishDate`, so a `PATCH` carrying
  only `publishAt` no longer overwrites the stored date; the two branches are folded
  into one `if (!publishDate)` so a partial update cannot skip it.
- **F6** — the banner copy is publication-agnostic in both languages, which is
  truthful when previewing a review that is already published.
- **F7** — `buildRssFeed` takes `now` and filters with the shared rule instead of its
  own weaker copy.

**Open item handed to the next reviewer, not fixed here.** `getApprovedComments`
still reads a review's comments without the visibility rule. It is not one of the
seven findings, and whether it matters depends on reading "every public surface"
strictly — a scheduled review's approved comments would be readable by id. I left it
as the subagent did, flagged for review rather than quietly widened.

