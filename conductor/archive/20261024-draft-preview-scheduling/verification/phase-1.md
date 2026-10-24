# Phase 1 — Publishing Gate

| | |
| --- | --- |
| Track | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Phase | 1 of 3 — Publishing Gate |
| Date | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base | `1d7837a939ab14e97127b3afc8b67e2c20ef903f` |
| Head | `27cc5b6` |

**Result: verified.** A review is public only when it is published *and* its
`publishAt` is unset or not in the future. One module states that rule, every
public read uses it, and a fifth, far-future fixture review proves the gate end
to end in a browser.

## Commands

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | No type errors in 233 files |
| 2 | `bun run lint` | 0 | 225 files checked, no fixes applied |
| 3 | `bun test` | 0 | 543 pass, 0 fail, 1266 `expect()` calls, 44 files (~3.4 s) |
| 4 | `bun run test:e2e` | 0 | `next build` clean (known `google-gax` warning only), 25 static pages, 101 Playwright tests passed in 5.3 m |

Full chain, run as written: `bun run typecheck && bun run lint && bun test && bun run test:e2e` — exit 0.

Supporting runs inside the phase: `bunx payload migrate:create add_publish_at`,
`bunx payload generate:types`, `bunx biome check --write` on the files it flagged.

Unit-suite console output contained only the expected pre-existing failure-path
logs (Redis connection errors in `rate-limit`/`translation-lock`, `[Translation]
Attempt N/3 failed`, `[Revalidation] Could not revalidate ...`).

## Acceptance criteria

| AC | What it asks | Proof |
| --- | --- | --- |
| AC-5 | A future-`publishAt` review is absent from home, browse, its own URL, the feed, the sitemap and its OG image; present in all of them after the moment, with no deploy. | `e2e/publish-schedule.spec.ts`: `404s its own URL in both locales`, `stays off the home page's latest reviews`, `stays out of the browse list in both locales`, `stays out of both feeds`, `stays out of the sitemap`, `serves no Open Graph image for it`. The "present after the moment, no deploy" half is the shape of the gate itself: the same predicate is evaluated per render against `new Date()` under the page's existing `revalidate = 60` (feed hourly), so the only change when the moment arrives is the clock. The inclusive boundary that makes it observable is asserted in `src/lib/__tests__/publish-visibility.test.ts` (`treats the boundary as inclusive`). |
| AC-6 | A writer can set and clear `publishAt`; a past value is visible immediately; edit-access rules are unchanged. | `src/collections/__tests__/publishAt.test.ts`: `is an optional date in the sidebar with no default` (optional, no default, no `required`), `states the exact rule the gate enforces` (exact `admin.description`), `is not a second publishDate`; plus the predicate tests for past/future in `publish-visibility.test.ts`. Access rules were not touched — `Reviews.access` is unchanged in this phase's diff. |
| AC-8 | Saving with an empty `publishDate` fills it; an author's value survives. | `src/collections/__tests__/publishAt.test.ts`: `fills an empty publishDate with the schedule`, `fills it on a draft too`, `never overwrites the author's value`, `leaves the date alone when the schedule is cleared`, `keeps the created date for a published review with no dates`, `leaves an undated draft undated`. |

## Functional requirements

| FR | Where it lives | Proof |
| --- | --- | --- |
| FR-5 — one shared visibility rule on every public read | `src/lib/publish-visibility.ts` (`publishedAndVisibleWhere`, `isPubliclyVisible`); call sites: home `src/app/(public)/[locale]/page.tsx`, browse `.../reviews/page.tsx`, detail `.../reviews/[slug]/page.tsx` (metadata, `generateStaticParams`, page), feed `.../feed.xml/route.ts`, `src/app/sitemap.ts`, OG `.../reviews/[slug]/opengraph-image.tsx`, plus `src/components/reviews/RelatedReviews.tsx` | `src/lib/__tests__/publish-visibility.test.ts` (fragment shape + predicate) and the six `e2e/publish-schedule.spec.ts` cases |
| FR-6 — optional `publishAt`, UTC, sidebar, unsetting publishes immediately | `src/collections/Reviews.ts` (`publishAt` field after `publishDate`), migration `20261024_023532_add_publish_at` (`timestamp(3) with time zone`), `src/payload-types.ts` | `publishAt.test.ts` field cases; `publish-visibility.test.ts` `unset` / `null` cases |
| FR-8 — empty `publishDate` filled from `publishAt`, author value never overwritten | `src/collections/Reviews.ts` `beforeChange` hook (extended, not duplicated) | the six hook cases in `publishAt.test.ts` |
| NFR-4 — one predicate, pure, unit-tested | `src/lib/publish-visibility.ts` has no `payload` runtime import, no `getPayload`, no I/O | `src/lib/__tests__/publish-visibility.test.ts`; every call site imports the same function |

## Operator semantics verified

The `where` fragment was **not** assumed:

```ts
{ and: [
  { _status: { equals: "published" } },
  { or: [ { publishAt: { exists: false } },
          { publishAt: { less_than_equal: now.toISOString() } } ] },
] }
```

`exists: false` is what selects the rows whose `publish_at` is `NULL`; a bare
`less_than_equal` would compare against `NULL`, match nothing, and hide every
review that was never scheduled. Proven empirically against the e2e database by
the browser suite, which asserts both directions at once: four unscheduled
fixture reviews still appear on home, browse, both feeds and the sitemap, while
the scheduled one appears in none of them and 404s its own URL. That pair is
only satisfiable if the `exists: false` branch matches `NULL` rows **and** the
`less_than_equal` branch excludes the 2030 row.

## Deviations

| File | Why it was required |
| --- | --- |
| `e2e/publish-schedule.spec.ts` (new) | `e2e/**` beyond `e2e/global-setup.ts` is outside `Touches`, but AC-5 is a browser claim (404, absence from rendered lists, feed, sitemap, OG image). The spec asserts absence with positive controls. |
| `e2e/locale-metadata.spec.ts` | The existing sitemap case listed *every* fixture review in both locales; a fifth, scheduled review makes that assertion wrong by design. It now loops the visible reviews and asserts the scheduled review's `/en`, `/id` and bare-slug URLs are absent, keeping hreflang assertions for the visible ones. |
| `src/lib/__tests__/e2e-harness.test.ts` | Fixture-dataset assertions in `src` that enumerate the exact slug and `publishDate` arrays. Updated to include the new entry and gained one case pinning the scheduled review's identity, far-future `publishAt` and `translated` status. |
| `src/components/reviews/RelatedReviews.tsx` | Holds one of the public reviews reads (`_status = published`) but is outside `Touches`. Left ungated it would show a scheduled review on a public page, contradicting FR-5, so the same fragment replaced its `_status` clause. |

`src/app/feed.xml/route.ts` was **not** changed: it is a 308 to `/en/feed.xml`
with no query, so there is no `_status` filter to gate and nothing to leak.
`src/lib/seo/sitemap.ts` and `src/lib/seo/metadata.ts` are unchanged — only
review *selection* changed, and the sitemap helper needed nothing because the
caller simply passes fewer sources.

## Notes

**Decisions encoded in the module.** The boundary is inclusive: `publishAt`
exactly equal to `now` is visible, which makes "appears within one revalidation
window" testable without an exact-millisecond sleep, and is covered by a unit
case (`now`, `now + 1ms`, `now - 1ms`). An unparsable `publishAt` counts as
unset, so the review is visible: Payload's `date` field cannot store an invalid
timestamp, so observing one means a corrupt row, and hiding a published review
is the worse failure of the two. Both decisions are stated in the module doc
comment and covered by tests.

**Fixture identity.** `E2E_FIXTURE_SCHEDULED_REVIEW` is
`E2E Fixture: The Slow Orbit` / `e2e-fixture-the-slow-orbit` / Mira Vance /
rating 4 / `publishDate` `2026-02-14T00:00:00.000Z` / `publishAt`
`2030-01-01T00:00:00.000Z` / `translated` / not featured / Sci-Fi, Hidden Gem
(tag), Adventurous (mood). Appended at index 4 so every existing index-based
reference (`[1]`, `[2]`, `[3]` in the localization, poller, retranslate and
attention-bell specs) still points at the same review. It is seeded as a
published review with `context: { skipTranslation: true }` and
`autoTranslate: false`, upserted by slug, so re-runs stay idempotent. It is
excluded from the reading list's review ids, because a reading list is a public
page and the scheduled review is not public.

**Specs updated and why.** `e2e/locale-metadata.spec.ts` (sitemap case — see the
deviations table). `e2e/homepage.spec.ts` needed nothing: its only fixture
assertion filters by `featured`, and the new review is not featured, so it never
appears there. `e2e/admin/attention-bell.spec.ts` counts `failed` + `stale`
reviews; the new review is `translated`, and the suite confirms the count is
unchanged. `e2e/feed.spec.ts`, `e2e/navigation.spec.ts` and `e2e/sort.spec.ts`
assert presence of a visible review rather than a total, so they pass untouched.

**Deliberately left for later phases.** Phase 2 owns the draft-mode entry, the
preview banner with the other-locale link and the exit action, and SEO
suppression on previewed responses (`noindex, nofollow`, `private, no-store`, no
canonical/hreflang/OG image) — FR-1 to FR-4, AC-1 to AC-4. Phase 3 owns the admin
list indicator for scheduled reviews and the edit-view notice stating when it
will publish — FR-7, AC-7.

**Not changed, by design.** `revalidate` values (pages 60 s, feed hourly) are the
delivery mechanism and are untouched. `publishDate`'s rendering, all URLs, their
order and count are unchanged. Access rules on `Reviews` are unchanged, so a
writer's edit scope is the same as before. No environment variable, secret or
database setting was touched, and the local dev database was neither repaired nor
migrated.

**Migration shape.** `src/migrations/20261024_023532_add_publish_at.ts` is purely
additive: `ALTER TABLE "reviews" ADD COLUMN "publish_at" timestamp(3) with time
zone;` plus `ALTER TABLE "_reviews_v" ADD COLUMN "version_publish_at"
timestamp(3) with time zone;`, and the matching `DROP COLUMN`s in `down`.
`src/migrations/index.ts` registered itself. `src/payload-types.ts` gained
`publishAt?: string | null` on `Review` and `publishAt?: T` on the select type.

## Primary verification

Re-run by the primary on the same tree after the phase reported; the evidence
above is the phase's own record.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | No type errors in 233 files (1368 ms) |
| 2 | `bun run lint` | 0 | 225 files checked, no fixes applied |
| 3 | `bun test` | 0 | **543 pass, 0 fail**, 44 files (3.7 s) |
| 4 | `bun run test:e2e` | 0 | **101 passed (3.3 m)**, 0 failed, 0 skipped |
| 5 | the configured phase command | 0 | `bun run typecheck && bun run lint && bun test && bun run test:e2e` |

All six `publish-schedule.spec.ts` cases passed by name, including
`404s its own URL in both locales` (3.9 s) and `stays out of the sitemap`.

**Diff against Touches.** `1d7837a..HEAD` is 20 files: every path inside
`Touches` — `Reviews.ts`, `publish-visibility.ts` and its test, the seven public
read sites (the feed route is inside the `src/app/(public)/[locale]/**` glob),
`sitemap.ts`, the two migrations, `migrations/index.ts`, `payload-types.ts`,
`e2e-harness.ts` + its test, `global-setup.ts` — plus exactly the four reported
deviations. No unreported file. Three commits, one per task
(`b373062`, `9d60952`, `27cc5b6`), none a merge or a user commit.

**Checked in the code, not the report.**

- `src/lib/publish-visibility.ts` is the one rule in two shapes and has no
  `payload` runtime import, no I/O: every call site imports it, so a future
  constraint is added once. The doc comment states both decisions (inclusive
  boundary, unparsable → visible) and the tests pin them.
- The operator question was answered empirically, which is the part that could
  have shipped a site-wide outage: without `exists: false` in the `or`,
  `less_than_equal` compares against `NULL` and *every* unscheduled review
  disappears. The suite proves both directions in one run — four unscheduled
  reviews still render on home, browse, both feeds and the sitemap while the
  scheduled one renders nowhere.
- The migration is purely additive (`publish_at`, `version_publish_at`), was
  generated rather than hand-written, and registered itself.
- The `publishDate` fill runs before the existing published-without-a-date
  fallback, so a scheduled review records its schedule while a review with no
  dates at all still behaves exactly as before.
- The fixture sits at index 4 deliberately: the localization, poller,
  retranslate and attention-bell specs index the array positionally, and
  appending keeps them pointed at the same documents. It is excluded from the
  reading list's review ids, since a reading list is a public page.

**Deviations accepted.** `e2e/publish-schedule.spec.ts` (AC-5 is a browser
claim), `e2e/locale-metadata.spec.ts` (its sitemap case enumerated every fixture
review, so a fifth review makes it wrong by design — it now asserts the
scheduled URLs absent while keeping the hreflang assertions), `e2e-harness.test.ts`
(fixture-dataset assertions), and `RelatedReviews.tsx` (a public read outside
Touches; leaving it ungated would have surfaced a scheduled review on a public
page, so the same fragment replaced its `_status` clause). Each is the smallest
necessary change.

**Residual risks, recorded for the review rather than papered over.**

1. No database row carries a *past*, non-null `publishAt`, so at the SQL level
   the `less_than_equal` branch is proven only for *exclusion* (the 2030 row).
   Its *inclusion* is proven by the pure predicate and by the fragment-shape
   test that binds the value to the instant it was built for — not by Postgres.
   The first time a real schedule passes is the first time that branch returns a
   row. A past-dated fixture review would close it and was judged not worth the
   churn to every count-based assertion in the suite.
2. `isPubliclyVisible` has no production call site yet — only its tests and the
   module doc reference it. It is the in-memory half of NFR-4's single rule and
   the natural basis for Phase 3's "scheduled vs live" list indicator, but until
   then it is unused export surface.

