# Phase 4 Verification — Breadcrumbs and prev/next

- **Track:** 20261026-content-typography
- **Phase:** 4 of 5 — Breadcrumbs and prev/next
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base:** `19a03fca2992daadd9c6ddedf116f2dc2f7bb6d4`
- **Result:** verified
- **Checkpoint:** `7f54443`

## Why the primary executed this phase

The phase subagent could not be launched: the agent pool returned `You're out of credits`. `conductor-implement` allows the primary to implement a phase when no subagent is available, so the primary wrote the code, the tests and this report, then ran the gate itself. The usual independence between implementer and verifier is therefore absent for this phase; what replaces it is that every claim below is a command output or a quoted source line, and the diff was reviewed against the plan contract rather than against a subagent's summary.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 265 files (14.07s) |
| static | `bun run lint` | 0 | 258 files checked, no fixes applied (after one formatting pass, below) |
| unit | `bun test` | 0 | 809 pass, 0 fail, 58 files (8.53s) — up from 789, the 20 new cases |
| unit | `bun test src/lib/__tests__/review-navigation.test.ts src/components/reviews/__tests__/Breadcrumbs.test.ts` | 0 | 20 pass, 46 expect() calls |
| e2e | `bun run test:e2e` | see below | 112 passed, 0 failed, 0 flaky |

The first lint run failed on formatting only — Biome wanted two expressions reflowed in the new test files. Fixed with `bunx biome check --write` on those two files (`Checked 2 files. Fixed 2 files.`), then lint clean. No behavioural edit; within the two-attempt budget.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-4 | Breadcrumbs render with correct hrefs and labels on both detail pages, and are absent on draft previews | `Breadcrumbs.test.ts` (order, ancestor hrefs, current page as text with `aria-current`, localized landmark name, empty trail renders nothing); both pages render `<Breadcrumbs>` from the same `trail` array they hand to `generateBreadcrumbSchema`; the review page gates it on `!preview` | covered |
| AC-5 | Prev/next point at the correct adjacent reviews, absent at both boundaries and on draft previews | `review-navigation.test.ts` (13 cases: two bounded queries, sort directions, self excluded, visibility gate, tiebreak, boundaries, missing slug, missing title, no slug, `createdAt` fallback, no date, locale pass-through); review page renders the nav only when a neighbour exists and never on preview | covered |
| FR-5 | Visible breadcrumbs consistent with the JSON-LD trail | One `trail` array per page feeds both `generateBreadcrumbSchema` and `<Breadcrumbs>` — the two renderings cannot drift | covered |
| FR-6 | Prev/next by `publishDate` with slug tiebreak, no wrap, suppressed on preview | `getAdjacentReviews` + the page's render guard | covered |
| FR-9 | Localized labels | `breadcrumbLabel`, `reviewNavLabel`, `reviewNavPrevious`, `reviewNavNext` in both `en` and `id`; the parity test in `dictionary.test.ts` enforces the key sets match | covered |

## Navigation query design

Both neighbours are found by their own bounded query — `limit: 1` with a two-field sort — rather than loading a window of reviews and scanning it, so the cost is two reads regardless of catalogue size.

- **Newer** (the nearest review *above* this one in the index's `-publishDate` order): candidates are a later `publishDate`, or the same date with a smaller slug. Sorted `["publishDate", "-slug"]` so the closest later date comes first and, among same-date rows, the largest slug still below the current one wins — that is the nearest row above.
- **Older** is the mirror: `["-publishDate", "slug"]`.
- **Self** is excluded with `id: { not_equals: review.id }`.
- **Visibility** is `publishedAndVisibleWhere(new Date())`, the same gate every public read uses, so a draft or a future-scheduled review is never a neighbour.
- **No wrap-around**: at either end the corresponding side is `null`; the page renders only the sides that exist and skips the whole nav when neither does.
- **Null dates**: the anchor is `publishDate ?? createdAt`. Publishing back-fills `publishDate`, so the fallback only matters for rows that predate that; a review with neither date returns `{ newer: null, older: null }` without querying, because a null column cannot be compared. This is documented on the helper.

**Staleness window, stated honestly:** the detail page is ISR with `revalidate = 60`, and a neighbour's page caches its own prev/next. Publishing a review revalidates `/reviews`, `/reviews/:slug` and `/` for both locales through the existing `revalidateReviewPages` hook, so a neighbour's navigation corrects itself on that write — but a review whose *neighbour* changes without the neighbour's own document changing can serve a stale link for up to 60 seconds. No new revalidation was added: the existing hook already covers the publish path, and adding per-neighbour invalidation would mean revalidating every review on every publish.

## Placement

- **Review detail:** breadcrumbs at the top of the hero container, above the cover/title grid, left-aligned with the content and `mb-8`. Suppressed on preview. The adjacent-reviews nav sits after the reading-log/structured sections and before the related-reviews block, as a two-column grid inside a top border — older on the left, newer on the right, matching the reading direction of the index.
- **Reading-list detail:** breadcrumbs above the `h1` inside the centred hero, `mb-8 flex justify-center` so the trail centres with the rest of that hero. Reading lists have no prev/next (FR-6 is review-only).

## Files changed

| File | Change |
| --- | --- |
| `src/components/reviews/Breadcrumbs.tsx` | new — server component, `nav[aria-label]` + `ol`, ancestors as `Link`, last crumb as `aria-current="page"` text, `ChevronRight` separators `aria-hidden` |
| `src/components/reviews/__tests__/Breadcrumbs.test.ts` | new — 7 cases via `renderToStaticMarkup` |
| `src/lib/review-navigation.ts` | new — `getAdjacentReviews`, two bounded neighbour queries |
| `src/lib/__tests__/review-navigation.test.ts` | new — 13 cases, mocked `payload.find` |
| `src/app/(public)/[locale]/reviews/[slug]/page.tsx` | one `trail` array feeding JSON-LD + breadcrumbs; `getAdjacentReviews` behind `!preview`; breadcrumb render; adjacent-reviews nav |
| `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx` | one `trail` array feeding JSON-LD + breadcrumbs; breadcrumb render |
| `src/lib/i18n/dictionary.ts` | four keys in both locales |

## Deviations

- **Phase executed by the primary**, not a phase subagent — the agent pool was out of credits. Recorded because the independent-verification separation the workflow assumes did not hold for this phase.
- **`Breadcrumbs.test.ts` is `.ts`, not `.tsx`**, using `createElement` rather than JSX — matching `StarRating.test.ts`, and keeping the path identical to the one the plan lists in `Touches`.

## Notes — what is not proven

- **No browser assertion on the trail or the nav.** The e2e suite passes 112/112, but it does not assert breadcrumb text or the adjacent links; the existing review-detail spec checks the page renders. The component and helper are covered at the unit layer, and the pages are covered by the fact that the production build renders them in e2e — not by an assertion on the new markup. An e2e case for "the newest review has no Next link" would need the fixture ordering to be deterministic, which it is not today.
- **Ordering is proven at the query level, not against Postgres.** The unit tests assert the `where` and `sort` the helper sends and how it maps the results; whether Postgres orders a two-field sort exactly as intended is a database property. The sort is the same shape the review index already uses (`-publishDate`), which is exercised end to end by `sort.spec.ts`.
- **The tiebreak is only reachable with two reviews sharing a `publishDate`**, which the fixture does not contain, so it is unit-tested and not observed in a browser.
