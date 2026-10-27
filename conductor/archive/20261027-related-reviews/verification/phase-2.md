# Phase 2 Report — Component Upgrade

- Track: 20261027-related-reviews — Related Reviews Upgrade
- Phase: 2 (Component upgrade)
- Date: 2026-10-27
- Branch: feat/20261027-related-reviews
- Base commit: unknown (no shell access in this sandbox; primary to fill)
- Head commit: uncommitted (implementation complete, nothing committed)
- Result: blocked (environment: shell/git denied, so verification commands and
  commits are left for the primary — this is the expected flow per the brief,
  not a failure)

## What was implemented

- P2.T1 (data wiring): `RelatedReviews` now accepts the author's picks via a
  new optional `relatedReviews` prop. Populated docs are flagged directly;
  raw ids take one bounded `payload.find` read. `toRelatedPick` /
  `toAffinityCandidate` build `RelatedPick[]` / `AffinityCandidate[]` with
  `isPubliclyVisible` + self + slug guards, `mergeRelatedReviews(picks,
  candidates, 3)` picks the rail order, and the winners map back to the docs
  from those same two reads (no third query). The review page passes
  `relatedReviews={review.relatedReviews}` (already populated: the page loads
  with depth 2).
- P2.T2 (compact rows): the `ReviewCard` grid is replaced by
  `RelatedReviewsList` — one native link per row (`min-h-[44px]`), cover
  thumbnail (`resolveMediaUrl` + `next/image`), locale title (Payload
  `fallback: true` supplies the EN fallback, no extra reads), and a meta line
  (`StarRating` with `dictionary.ratingLabel` + `formatDate`). Heading,
  description, list semantics, and placement are preserved.
- P2.T3 (tests): `RelatedReviews.test.tsx` renders the list through the
  shared `renderStatic` harness (EN + ID, order, links, rows-without-cards,
  empty-null), exercises the flag builders (self/draft/scheduled-future/
  slugless, overlap counts over mixed populated + raw ids, merge integration:
  picks-first, ineligible-slot backfill, dedupe), and source-pins the async
  wrapper + page wiring that cannot render without Payload.

## Commands

| Layer | Command | Exit | Summary |
| ----- | ------- | ---- | ------- |
| typecheck | `bun run typecheck` | — | not run (shell denied; primary to run) |
| lint | `bun run lint` | — | not run (shell denied; primary to run) |
| unit | `bun test` | — | not run (shell denied; primary to run) |
| build | `bun run build` | — | not run (shell denied; primary to run) |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| -- | --------- | -------- | ------ |
| FR-1 | Rail max 3 below article, null when empty | wrapper returns `null` on empty picks + no taxonomy and on zero merged slugs; list returns `null` on `[]`; page call-site unchanged in place | done (unverified) |
| FR-2 | Picks lead in stored order; ineligible skipped | picks flagged via `toRelatedPick`, merged by Phase 1 `mergeRelatedReviews`; tests: order, draft-skip + backfill, dedupe | done (unverified) |
| FR-4 | Compact rows replace the grid | `RelatedReviewsList` (`<ul>`, native links, no `data-slot="card"`); test asserts no card chrome | done (unverified) |
| FR-5 | Eligibility = `publishedAndVisibleWhere`, never self | affinity `where` keeps the original guards; runtime flags mirror them via `isPubliclyVisible` + self + slug | done (unverified) |
| FR-6 | Locale-aware read, existing heading | query carries `locale`; heading/description/rating label/dates from the existing dictionary keys (EN + ID tests) | done (unverified) |
| AC-1 | Empty rail renders null | list + wrapper `null` paths; rendered test | done (unverified) |
| AC-5 | Compact rows with cover/title/rating/date, linked | rendered test (img, alt, rating label, date, locale hrefs) | done (unverified) |
| AC-7 | EN + ID locale behavior | rendered ID test (heading, description, `/id/` hrefs, ID date + rating label) | done (unverified) |
| NFR-1 | No new deps, server component, ISR-safe | no new imports beyond existing primitives; at most two bounded reads (`AFFINITY_QUERY_LIMIT` + picks count) | done (unverified) |
| NFR-2 | A11y: h2, list semantics, 44px, native links | `h2` + `ul`/`li` + `Link` with `min-h-[44px]`; test pins each | done (unverified) |

## Evidence paths

- `src/components/reviews/RelatedReviews.tsx` (rewritten wrapper)
- `src/components/reviews/RelatedReviewsList.tsx` (new; see deviations)
- `src/components/reviews/__tests__/RelatedReviews.test.tsx` (new)
- `src/app/(public)/[locale]/reviews/[slug]/page.tsx` (one prop added)

## Deviations

- `src/components/reviews/RelatedReviewsList.tsx` (new file, outside the
  listed `Touches`): required because the async wrapper imports
  `@payload-config`, which transitively runs `validateEnv()` at import time
  and pulls the sharp/postgres/s3 import graph — a unit test importing the
  wrapper would couple `bun test` to env secrets and the full Payload boot,
  contradicting the `renderStatic` harness boundary (async Payload-fetching
  components cannot render in unit tests). The new module is payload-free
  (only types from `payload`), so tests import just it; the wrapper's DB
  wiring is covered by source-pinning assertions instead. Minimal,
  single-purpose, no new dependencies.

## Primary verification (primary agent, 2026-10-27)

Subagent status `blocked` was environmental only (no shell/git in its
sandbox). The primary ran verification on the track branch:

| Layer | Command | Exit | Summary |
|-------|---------|------|---------|
| static | `bun run typecheck` | 0 | No type errors in 295 files |
| static | `bun run lint` | 0 | 291 files clean (after Biome autofix on the 2 new files, see below) |
| unit | `bun test` (full suite) | 0 | 926 pass, 0 fail, 68 files (+23 new) |
| build | `bun run build` | 0 | Production build succeeded |

Acceptance criteria: FR-1, FR-2, FR-4, FR-5, FR-6, AC-1, AC-5, AC-7, NFR-1,
NFR-2 all **verified**.

Deviation accepted (primary): `RelatedReviewsList.tsx` outside Touches —
justified (payload-free module keeps unit tests off the Payload boot graph);
minimal and within the spirit of the phase.

Deviation (primary, formatting only): `bunx biome check --write` on
`RelatedReviewsList.tsx` and `RelatedReviews.test.tsx` — no logic change.

Phase result: **verified**. Squashed as checkpoint below.

## Notes

- No dictionary changes: heading, description, and rating-label keys already
  exist in EN + ID, so `dictionary*.ts` needed no edits.
- EN title fallback relies on the Payload `fallback: true` config (default
  locale `en`), documented in the list module; no extra reads.
- Formatting was matched to the Biome style by hand (tabs, double quotes,
  import order, ~80 cols); the primary's `bun run lint` is the arbiter.
- For the primary: run `bun run typecheck && bun run lint && bun test &&
  bun run build`, then commit the four files above with conventional
  task-level commits.
