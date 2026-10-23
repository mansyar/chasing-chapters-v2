# Integrated Verification — Bilingual Site Experience

| Field | Value |
|---|---|
| Track | `20261023-bilingual-site-experience` |
| Date | 2026-10-24 |
| Branch | `feat/20261023-bilingual-site-experience` |
| Base | `98351d54d692ea8842468df5705cc2c0be0a5c60` (main at track start) |
| Head | `974c2f4` |
| Result | **Verified** — every configured layer green on the branch |

## Commands

The configured verification strategy (`static`, `unit`, `e2e`) plus the coverage
gate and the production build, run once on the branch at `974c2f4`:

| Check | Command | Exit | Result |
|---|---|---|---|
| Typecheck | `bun run typecheck` | 0 | `No type errors in 228 files` |
| Lint / format | `bun run lint` | 0 | `Checked 220 files in 258ms. No fixes applied.` |
| Unit tests | `bun test` | 0 | **515 pass / 0 fail**, 1191 expect() calls, 42 files |
| Coverage | `bun test --coverage` | 0 | all files 79.91 % funcs / 89.52 % lines; **every new logic module 100 %** (below) |
| Build | `bun run build` | 0 | 25/25 static pages in 33.2 s, standalone artifact |
| Browser suite | `bun run test:e2e` | 0 | **91 passed (2.2m)**, 0 failed, 0 skipped |

The build and the browser suite ran against the harness database
(`chasing-chapters_e2e`, `STORAGE_ADAPTER=local`, `NEXT_PUBLIC_R2_PUBLIC_URL` empty)
because the local dev database is mid-upgrade (see *Environment* below). The
harness applies the migrations and seeds itself, so the run proves the additive
migrations on a database that predates the track.

### Coverage of the new code

The gate is `coverage: { gate: 80, scope: "new-code" }`, and every module this
track introduced is fully covered:

| Module | Funcs | Lines |
|---|---|---|
| `src/lib/i18n/locale.ts` | 100.00 | 100.00 |
| `src/lib/i18n/dictionary.ts` | 100.00 | 100.00 |
| `src/lib/i18n/format.ts` | 100.00 | 100.00 |
| `src/lib/seo/metadata.ts` | 100.00 | 100.00 |
| `src/lib/seo/sitemap.ts` | 100.00 | 100.00 |
| `src/lib/seo/structured-data.ts` | 100.00 | 100.00 |
| `src/lib/feed.ts` | 100.00 | 100.00 |
| `src/collections/requireDefaultLocaleValue.ts` | 100.00 | 100.00 |
| `src/hooks/formatSlug.ts` | 100.00 | 100.00 |
| `src/lib/e2e-harness.ts` | 92.31 | 97.88 |

The all-files figure (79.91 % funcs) is lower than the 86.87 % recorded before this
track for one reason, and it is not the new code: `src/lib/__tests__/e2e-harness.test.ts`
value-imports `upsertCover` from `e2e/global-setup.ts`, which loads the Playwright
global setup (and therefore `dotenv` + Payload) into the unit run, so Bun counts
that file's ~500 lines as uncovered (23.53 % funcs / 13.47 % lines). It is recorded
as a follow-up below; the gate is scoped to new code and passes on its own terms.

## Requirements

Each requirement is proven by the phase evidence it was built in; this table
records the one integrated run that carries all of them.

| Requirement | Evidence in this run | Status |
|---|---|---|
| FR-1 path locales, unprefixed paths redirect, unsupported 404 | `e2e/locale-routing.spec.ts` (12 cases); route table below | Covered |
| FR-2 remembered preference, toggle-only write | `e2e/locale-routing.spec.ts` "a direct Indonesian URL leaves the stored preference alone" | Covered |
| FR-3 control on every page, preserves slug/depth/query | `LanguageToggle` in the navbar; AC-3 case in `e2e/locale-routing.spec.ts` | Covered |
| FR-4 typed dictionary over all public surfaces | `dictionary.test.ts` (key parity), `dictionary-source.test.ts` (no literal left) | Covered |
| FR-5 document language, localized metadata, `og:locale`, canonical | `e2e/locale-metadata.spec.ts` (4 cases); `metadata.test.ts` | Covered |
| FR-6 reciprocal `en`/`id`/`x-default` alternates | `e2e/locale-metadata.spec.ts` "emits reciprocal hreflang alternates from both locales" | Covered |
| FR-7 legacy `?locale=` permanent redirect | `e2e/locale-routing.spec.ts`; `src/proxy.ts` 308 branch | Covered |
| FR-8 sitemap in both locales with alternates | `e2e/locale-metadata.spec.ts` (2 sitemap cases); `sitemap.test.ts` | Covered |
| FR-9 `/en/feed.xml`, `/id/feed.xml`, `/feed.xml` 308, feed advertised | `e2e/locale-metadata.spec.ts` (4 feed cases); `feed.test.ts` | Covered |
| FR-10 localizable taxonomy/list/title with English fallback | `e2e/content-localization.spec.ts` (10 cases); `localization.test.ts` | Covered |
| FR-11 normalized locale on every read | `locale.test.ts`; every page normalizes `params` before Payload | Covered |
| FR-12 detail pages pre-render per locale | Route table: both detail routes `●` for both locales | Covered |
| NFR-1 accessibility of the control | `e2e/language-control-a11y.spec.ts` (contrast 4.95 / 7.77, keyboard, `aria-pressed`, `lang`) | Covered |
| NFR-2 dictionary server-side, flat client bundle | 1,532,683 bytes; Indonesian strings in the HTML and in **zero** chunks | Covered |
| NFR-3 SEO correctness | `metadata.test.ts`; the metadata table in `verification/phase-3.md` | Covered |
| NFR-4 pure locale functions | `src/lib/i18n/__tests__/locale.test.ts` | Covered |
| NFR-5 migration safety | additive migrations; the e2e run migrated a pre-track database | Covered |
| NFR-6 platform currency | Next 16.4.2 `proxy.ts`; installed i18n guide followed | Covered |
| AC-1…AC-11 | the sweep table in `verification/phase-5.md`, re-run here | Covered |

## Pre-rendering

`bun run build` produced the same route shape as every phase since Phase 1:

- `●` `/en`, `/id`, both locales of `/about`, `/reading-lists`, both detail routes
  (9 review paths and 2 reading-list paths from `generateStaticParams`), and
  `/en/feed.xml` + `/id/feed.xml`.
- `ƒ` only for the two `opengraph-image` handlers, `/[locale]/reviews` (it reads
  `searchParams` for filters — pre-existing), `/feed.xml` (the 308 handler), the
  admin and API routes, `/sitemap.xml` (`force-dynamic`), and `Proxy (Middleware)`.

**No static page became dynamic during this track.**

## Deviations carried by this track

Every phase's deviations were accepted as the smallest change that made the goal
hold; collected here so the review sees them in one place:

| Phase | Files outside the original Touches | Why |
|---|---|---|
| 1 | `ReviewCard.tsx`, `ReadingListCard.tsx`; `date-format.ts` + test; `revalidatePages.ts` + test; `like-review.ts`, `comments.ts` | In-locale root links; collapsing two locale modules into one; revalidation must name the locale-prefixed paths |
| 2 | — | None |
| 3 | `Footer.tsx`, `not-found.tsx`, `revalidatePages.ts` + test | The footer names the feed and needs the active locale; the feed now exists per locale |
| 4 | `formatSlug.ts`; `requireDefaultLocaleValue.ts` (new); 19 nullable-title guards across pages, OG handlers and five cards | Payload re-derives the slug from the translated name; `required` cannot be satisfied per locale by a body-only pipeline |
| 5 | `LanguageToggle.tsx` (one class string) | The active pill measured 3.66:1 and now measures 4.95 / 7.77:1 |

The only hand-written SQL in the track is the backfill inside the otherwise
generated `20261023_193922_localize_taxonomy_and_reading_list_content` migration,
placed between the generated DDL and the generated `DROP COLUMN` statements so the
existing English values move into the default-locale rows before their columns go.

## Environment

`bun run build` against the **local dev** database fails with
`column reviews_locales.title does not exist (42703)` because that database was
schema-pushed after `20261021_140330` was authored, so its migration ledger cannot
replay from batch 0 (`"y" | bun run payload migrate` stops on the already-present
`english_updated_at` column). This is a local-environment repair, not a track
defect: CI migrates a fresh database, and the harness database migrated and seeded
cleanly in this run. The repair is `bun run payload migrate:fresh` followed by
`bun run seed`, or one `bun run dev` (which pushes the schema) — both discard local
dev data, so it is left to the owner.

## Follow-ups

Recorded, not fixed here:

1. The 404 **body** is English while its document `lang` follows the served locale
   (`not-found.js` receives no props and reading the cookie in the root boundary
   made every `[locale]` route dynamic).
2. `/[locale]/reviews` is dynamic for its filters — pre-existing, not a regression.
3. No pre-track client-bundle baseline exists, so NFR-2 is an absolute measurement
   (1,532,683 bytes) plus proof of dictionary absence, guarded by a 1,600,000-byte
   ceiling rather than a delta.
4. A review page carries two language controls (navbar + hero), left intentionally.
5. The two `opengraph-image` handlers remain `ƒ`.
6. `src/lib/__tests__/e2e-harness.test.ts` imports `upsertCover` from
   `e2e/global-setup.ts`, which loads the Playwright setup into the unit run and
   distorts the all-files coverage figure; moving `upsertCover` into
   `src/lib/e2e-harness.ts` would fix it.
7. The local dev database needs the repair described above.

## Evidence

- `verification/phase-1.md` — locale routing (`ea7832f`)
- `verification/phase-2.md` — interface dictionary and control (`f3390e2`)
- `verification/phase-3.md` — metadata, alternates, sitemap and feeds (`c1b83e6`)
- `verification/phase-4.md` — content localization (`dfcede1`)
- `verification/phase-5.md` — pre-rendering, accessibility and the AC sweep (`5a5031a`)
- `spec.md`, `plan.md`, `review.md`
