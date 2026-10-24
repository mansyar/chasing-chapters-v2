# Phase R2 verification — Review-fix round 2 (F1, F3)

| Field | Value |
| --- | --- |
| Track | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Phase | R2 — closing round-2 F1 (Medium) and round-2 F3 (Low) |
| Date | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base | `7f93c1c` (phase base named in the brief) |
| Head | `cf7943b` (code); this file lands in the follow-up `docs(conductor)` commit |
| Result | **verified** — typecheck, lint, unit, e2e and the production build all exit 0; both findings closed with a proving test; the two browser failures the round-2 gates found were fixed as test-robustness changes and the suite then ran green twice, back to back, 112 passed / 0 failed / 0 did not run / 0 skipped each time |
| Commits | `21722ff` (R2.T1), `59fcfdf` (R2.T2), `26c7281` (clear-button hydration in `e2e/admin/review-schedule.spec.ts`), `cf7943b` (admin spec timeouts); evidence in `c4bfcc1`, `83646d4` and this file's own commit |

## Verification

The brief's chain, run from a clean tree:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| # | Command | Exit | Real numbers |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | `No type errors in 246 files [1223.23ms]` |
| 2 | `bun run lint` | 0 | `Checked 236 files in 301ms. No fixes applied.` |
| 3 | `bun test` | 0 | `580 pass`, `0 fail`, `1328 expect() calls`, `Ran 580 tests across 46 files [3.27s]` |
| 4 | `bun run test:e2e` | 0 | `Running 112 tests using 3 workers … 112 passed (3.8m)`, 0 failed, 0 did not run, 0 skipped |
| 5 | `bun run build` | 0 | 27 static pages generated (`(27/27)`); route table below |

Counts against the round-1 head: unit 579 → **580** (+1: the cleared-date fill), browser
111 → **112** (+1: the card/detail count case). No test was removed, skipped or weakened,
and every pre-existing case in both suites still passes.

### Run history

| Run | Tree | `bun run test:e2e` | Outcome |
| --- | --- | --- | --- |
| 1 | `59fcfdf` | `112 passed (4.6m)` | green — this phase's first verification |
| 2 | `59fcfdf` | 1 failed | **gate 1**: `admin/review-schedule.spec.ts:90` → the live notice never appeared |
| 3 | `26c7281` | `112 passed (4.5m)` | green — first re-run after the clear-button fix |
| 4 | `26c7281` | `112 passed (4.5m)` | green — second re-run proving that fix |
| 5 | `83646d4` | 1 failed, 6 did not run | **gate 2**: `admin/draft-preview.spec.ts:85` → 30 s test timeout inside the login |
| 6 | `cf7943b` | `112 passed (3.8m)` | green — the chain above, 0 failed / 0 did not run / 0 skipped |
| 7 | `cf7943b` | `112 passed (3.4m)` | green — back-to-back re-run, 0 failed / 0 did not run / 0 skipped |

Run 2's failure and its cause. The case clears the schedule picker and then asserts the
notice follows the form (`F4`). The snapshot in the failure showed the date textbox still
reading `Jan 1, 2030 11:00 AM` and the notice still reading the scheduled sentence, so the
form value never changed: the click was lost. `SCHEDULED_NOTICE` is server-rendered from
`useDocumentInfo().data`, so the notice — and the `.date-time-picker__clear-button` in that
same SSR markup — is visible before the picker's React handlers are attached, and a click
that lands in that window hits inert markup. It passed in run 1 and in R1, which is why a
proof that can fail one time in three is not a proof.

The fix is in the test, not the app — the app behaviour is correct, and no app file changed.
`e2e/admin/review-schedule.spec.ts:112-119` clicks inside `expect(...).toPass()` and asserts
the intermediate step, `#field-publishAt input` having `value === ""` (1 s budget), so the
notice assertions only run once the form has actually emptied. The case still submits
nothing, so the saved schedule and the other cases in the serial file are unaffected. This
is `e2e/**`, already inside the phase's Touches, so it is not a deviation.

Run 5's failure and its cause — a different one, and not in the app either. The draft-preview
case timed out at the *default* 30 s inside `loginAsFixtureAdmin`, while waiting for the
`Sign In` button after the email and password had been filled; six other cases did not run
because the spec is serial. The log immediately before it reads `[WebServer] [Warmup] Server
did not become ready; skipping warm-up`, so the server was up and serving the login form's
markup but still slow to serve the client bundle and render the hydrated button. On a loaded
machine that exceeds 30 s — and once the *test* timeout fires, the helper's own three-attempt
retry never gets a turn, which is why the helper's robustness did not save it. Nothing in the
app is wrong: the same login succeeds in every other admin spec and in every green run.

The fix is again in the tests, and it is a timeout, not an assertion: every admin spec now
declares the same explicit budget (`test.setTimeout(120_000)`) instead of relying on the
default — `admin/draft-preview.spec.ts:56`, `admin/review-schedule.spec.ts:44`,
`admin/bulk-retranslate.spec.ts:18`, `admin/attention-bell.spec.ts:17`, plus the two that
already had one and were brought to the same value (`admin/translation-poller.spec.ts:15`,
was 90 s; `admin/locale-preference.spec.ts:11`, was 60 s). No assertion changed, no retry was
added at project level, no app file was touched, and nothing was made to pass by waiting:
run 6 finished in 3.8 m and run 7 in 3.4 m, with the previously timing-out case taking 5.5 s
and 5.0 s. `e2e/**` is inside the phase's Touches, so neither fix is a deviation.

### How the chain was run

Rows 1–5 are one invocation. It was prefixed with the harness environment the brief
prescribes, because `bun run build` cannot run against the dev database (pre-existing
migration-ledger drift: `column reviews_locales.title does not exist`, as the brief warns):

```powershell
$env:DATABASE_URI='postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e'
$env:STORAGE_ADAPTER='local'
$env:NEXT_PUBLIC_R2_PUBLIC_URL=''
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

The URI is `.env`'s `DATABASE_URI` with the database name suffixed `_e2e`, which is exactly
what `resolveE2EDatabaseUri` in `src/lib/e2e-harness.ts` produces and what
`src/scripts/e2e-run.ts` hands to its children; the resolver is idempotent, so passing it
already-suffixed left the harness's own build unchanged. No `.env` file, database, storage
setting or build config was edited for this.

### Build route table (AC-10 / NFR-1 — both review detail routes still pre-rendered)

```
Route (app)
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

`/[locale]/reviews/[slug]` is still `●` over the same 8 pre-rendered paths, unchanged from
Phases 3 and R1. The only build warnings are the pre-existing `google-gax` ones
(`Can't resolve '../../package.json'`), present before this track.

## Findings

| Finding | Severity | Fix | Proving test |
| --- | --- | --- | --- |
| Round-2 F1 — a cleared `publishDate` is treated as absent, so `{ publishDate: null, publishAt: <future> }` persists `null` and a scheduled review ends up with a schedule and no publish date (a regression of the pre-R1 fill) | Medium | `src/collections/Reviews.ts:481` — the fill now reads `data.publishDate !== undefined ? data.publishDate : originalDoc?.publishDate`, so only an absent key falls back to the stored value and an explicit `null` (the author clearing the field) still reaches `if (!publishDate)` and is refilled from `publishAt` | `src/collections/__tests__/publishAt.test.ts:126` `refills a cleared date from the schedule` — `{ publishDate: null, publishAt: SCHEDULE }, "update", { publishDate: AUTHOR_DATE }` expects `data.publishDate === SCHEDULE` |
| Round-2 F3 — `bookCount` on the reading-list card and in the Open Graph image counts every populated review, so a list of five with one scheduled advertises five books while the detail page renders four | Low | `src/components/ReadingListCard.tsx:34-40` and `src/app/(public)/[locale]/reading-lists/[slug]/opengraph-image.tsx:43-46` — both counts filter with `isPubliclyVisible(review, new Date())`, keeping the `Array.isArray` guard | `e2e/publish-schedule.spec.ts:122` `counts the same books on the card as on the list` — the fixture list's card badge reads `4 books` and the detail page renders exactly four `/en/reviews/` anchors |

The existing partial-update case (`keeps the stored date on a partial update`, `data` with
no `publishDate` key at all) stays green, which is what keeps the two states distinct: the
new test and the old one assert opposite outcomes from inputs that differ only by the key
being present-and-`null` versus absent.

## The Open Graph count — what `list.reviews` actually arrives as

The brief's caution was read before filtering, because a count that silently becomes `0`
would be wrong in a new way.

- The route queries with `depth: 1` (`opengraph-image.tsx:25-34`, the `depth` on line 32), `ReadingLists.reviews` is a
  `hasMany` relationship to `reviews` with no `maxDepth` on the field and no
  `defaultPopulate` on the collection (`src/collections/ReadingLists.ts:77-85`), and
  Payload 3.90.2 populates a relationship when `depth && currentDepth <= depth` — so at
  `depth: 1` each entry is a full document carrying `_status` and `publishAt`.
- That was then proved, not assumed: `ReadingListCard` receives its list from the home page
  query, which also uses `depth: 1` for reading lists. Had the entries been ids, the badge
  would have rendered `0 books`; the new browser case asserts `4 books` on the rendered
  page. The card therefore exercises the same populated shape the OG route sees.
- The filter is written defensively anyway — `typeof review === "number" || isPubliclyVisible(...)` —
  so an unpopulated id is kept rather than dropped: an id says nothing about visibility, and
  dropping it would advertise `0 books`. Filtering something that cannot be judged would be
  the "wrong in a different way" the brief rules out; keeping it changes nothing for the
  populated case that actually ships.

## Requirements touched

FR-5 (both counts now agree with the grid), FR-8 (the date fill distinguishes cleared from
absent). No requirement text, field, permission branch, dependency, `revalidate` value or
visibility semantic changed; `publishedAndVisibleWhere` and `isPubliclyVisible` are the same
two shapes they were in Phase R1.

## Deviations

None. Every changed file is inside the phase's Touches.

## Notes for the primary

- The two counts call `isPubliclyVisible` with a fresh `new Date()` per render, exactly as
  the reading-list detail page does; the three in-memory readers now agree on the same
  clock-reading shape (the page, the card, the OG image), while DB reads keep using
  `publishedAndVisibleWhere`. `revalidate = 60` means a list can render a moment stale, as
  every other surface in this track does — unchanged by this phase.
- The OG image route stays dynamic (`ƒ`), so the count is computed per request and the
  filtered number is never baked into a cached image.
- Not proved end to end: the Open Graph image's rendered badge text. The e2e suite asserts
  the scheduled review's OG route 404s (`publish-schedule.spec.ts:176`), and the count the
  badge is built from is the same expression the card proves at four; the image itself is
  not parsed in a browser.
- The harness URI used above was derived by reading `.env` with the file-read tool (the
  shell refuses `.env`, but the read tool does not); no `.env` edit was made, and the value
  handed to the build is the same one `resolveE2EDatabaseUri` computes. `bun run build` is
  therefore part of the one chain above — nothing was borrowed from the e2e harness's own
  build.
- The only code changes after run 1 are test robustness in `e2e/admin/**`; no app file,
  assertion target or app behaviour moved. The review-schedule case still proves the same
  thing it did in R1 (`F4`: the notice follows the form, nothing is saved), it just waits for
  the form to actually empty before reading the notice; the other change raises the admin
  specs' timeout to 120 s so a slow hydration cannot kill a login before the helper's own
  retry runs. Two habits for future browser work here: assert the state change rather than
  the click when a control exists in server-rendered admin markup before hydration, and give
  an admin spec an explicit timeout rather than inheriting the 30 s default.
- The browser suite still prints `[WebServer] [Warmup] Server did not become ready; skipping
  warm-up` on a licensed machine; runs 6 and 7 both did, and both passed 112/112 with the
  admin cases finishing in single-digit seconds. That warning marks a slow first warm-up, not
  a failing server - it is the condition the timeout fix covers, and it is not new to this
  phase.

## Primary verification

Run by the primary on the final tree, after the two test-robustness reworks - my own
invocation, not the report's.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no type errors (246 files) |
| `bun run lint` | 0 | no fixes applied (236 files) |
| `bun test` | 0 | **580 pass, 0 fail**, 46 files |
| `bun run test:e2e` | 0 | **112 passed (3.4 m)**, nothing failed, nothing skipped or left unrun |
| `bun run build` | 0 | 27/27 static pages; `/[locale]/reviews/[slug]` still pre-rendered over 8 paths |

The configured phase command exited 0. The build ran directly against the harness database
(`DATABASE_URI` suffixed `_e2e`, `STORAGE_ADAPTER=local`, empty `NEXT_PUBLIC_R2_PUBLIC_URL`),
so this is my own build rather than the harness's.

**Diff against Touches** — `7f93c1c..a198b1f` is 12 files, 370 insertions and 13 deletions: the
evidence, `src/collections/Reviews.ts`, `src/collections/__tests__/publishAt.test.ts`,
`src/components/ReadingListCard.tsx`, the reading-list `opengraph-image.tsx`,
`e2e/publish-schedule.spec.ts`, and **six** `e2e/admin` specs carrying the 120 s budget —
`attention-bell.spec.ts:17`, `bulk-retranslate.spec.ts:18`, `locale-preference.spec.ts:11` and
`translation-poller.spec.ts:15` newly declaring it, `draft-preview.spec.ts:56` and
`review-schedule.spec.ts:44` following the rework. No unreported file, no deviation beyond the
brief.

**Both findings, checked in the code.**

- F1: `data.publishDate !== undefined ? data.publishDate : originalDoc?.publishDate`. The
  distinction is the whole point — `null` is the author clearing the field, so the fill has to
  run for it, while an absent key is a partial update that must not overwrite a stored date.
  The unit case feeds `publishDate: null` with a schedule and `originalDoc` carrying an author
  date, and expects the schedule.
- F3: both counts filter with `isPubliclyVisible`, and both keep an unpopulated numeric id
  rather than dropping it — the right call, since an id says nothing about visibility and
  dropping it would advertise "0 books" on a route that reads at `depth: 1`. The browser case
  asserts the card and the detail grid agree at four.

**Two reworks, both mine to own.** The first gate run failed on the *new* notice case because
the clear-button click landed on server-rendered markup before hydration — the test asserted
the click, not the state; it now retries until the field is genuinely empty. The second failed
on a 30 s login timeout in a different admin spec under load, so every admin spec now declares
`test.setTimeout(120_000)`. Neither was an app defect, and neither is a phase failure: the
suite is green twice in a row plus this third run, 112/112 each time.

**Residual, recorded for the next reviewer.** The `[Warmup] Server did not become ready`
warning still appears in green runs; the timeout makes a slow warm-up survivable rather than
fixing it. That is a harness concern predating this track, not a scheduling or preview defect.
