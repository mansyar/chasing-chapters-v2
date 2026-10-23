# Phase 5 — Pre-rendering and Track Verification

- **Track:** `20261023-bilingual-site-experience` (Bilingual Site Experience)
- **Phase:** 5 of 5 — Pre-rendering and Track Verification
- **Date:** 2026-10-24
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Base:** `3ec0e672cce799e281d2cca435925f39700dc748` (phase base)
- **Head:** `7095172` (last source/test commit; this evidence file is the commit after it)
- **Result:** pass — every acceptance criterion demonstrated in one integrated run against the
  production build, with two environment/measurement deviations and four follow-ups recorded below.

Covers `FR-12`, `AC-10`, `AC-11`, `NFR-1`, `NFR-2`.

## Commands

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `✓ No type errors in 228 files [1.15s]` |
| static | `bun run lint` | 0 | `biome check .` — `Checked 220 files in 265ms. No fixes applied.` |
| unit | `bun test` | 0 | **515 pass, 0 fail**, ~1190 `expect()` calls, 42 files, 3.1–3.7 s |
| e2e | `bun run test:e2e` | 0 | **91 passed** (2.2 m); harness build 43 s compile, TypeScript 2.2 s, **25/25 static pages in 33.6 s**, standalone artifact served on `:3100` against `chasing-chapters_e2e` |
| static | `bun run build` | 0 | `next build --webpack`; 43 s compile, TypeScript 2.0 s, `✓ Generating static pages (25/25)`; route table below |

Regression counts against the phase before: unit 515 (unchanged — Phase 5 touched no `src/` logic
except one class string), Playwright **80 → 91** (11 new specs in `e2e/language-control-a11y.spec.ts`).

Expected, non-regressive noise in the e2e run: `[Revalidation] Could not revalidate … Invariant:
static generation store missing` from the seed (pre-existing, Phase 1 note 4), the
`google-gax … Can't resolve '../../package.json'` build warnings (pre-existing), and the
`No email adapter provided` warning.

### `bun run build` environment

Run against the primary's local dev database (`DATABASE_URI=…/chasing-chapters`) the command exits
**1**:

```
Error occurred prerendering page "/en/reviews/e2e-fixture-the-lighthouse-keepers-almanac"
Failed query: select … from "reviews" …
[cause]: error: column reviews__locales.title does not exist   (code 42703)
Next.js build worker exited with code: 1
```

That is the staleness the phase brief predicted. The prescribed repair was attempted twice and
cannot succeed on this database:

1. `bun run payload migrate` — stopped at the interactive "you've run Payload in dev mode … data
   loss will occur" prompt (no stdin) and timed out; nothing applied.
2. `"y" | bun run payload migrate` — confirmed the prompt, then failed on the **first** unledgered
   file: `20261021_140330_add_english_updated_at` → `column "english_updated_at" of relation
   "reviews" already exists`. The dev database was schema-pushed *after* that migration was
   authored, so its `payload-migrations` ledger cannot be replayed from batch 0. Every later
   migration — including Phase 4's localized columns — is unreachable by `migrate`.
   `payload migrate:status` is outside this phase's permission set, and `migrate:fresh` is
   destructive, so the database was left untouched.

To produce the build evidence anyway, `bun run build` was re-run with a temporary, git-ignored
`.env.local` pointing at the harness's migrated and seeded database with the harness's storage
adapter — i.e. exactly the configuration `bun run test:e2e` builds and serves — which exits 0 and
yields the route table below. `.env.local` was emptied afterwards; the file is git-ignored
(`.env*`) and now contributes no variables. See *Deviations*.

### Route table (`bun run build`, 25 static pages)

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
├ ƒ /api/translation/bulk-retranslate
├ ƒ /feed.xml
├ ○ /robots.txt
└ ƒ /sitemap.xml
ƒ Proxy (Middleware)
```

Both detail routes pre-render **per locale** (`FR-12`, `AC-10`): the review route emits the
cross-product of `SUPPORTED_LOCALES` × published slugs (`9` paths here, `[+5 more]`), the
reading-list route `2`. The e2e harness builds the same table independently (two builds today, both
identical in shape), so the result is not an artifact of one `.next` directory.

## Pre-rendering

Why the detail routes are static, in source:

- `src/app/(public)/[locale]/reviews/[slug]/page.tsx:84` — `generateStaticParams()` returns
  `SUPPORTED_LOCALES.flatMap(…)` (`:99`), one entry per locale per published review.
- `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx:69` / `:84` — the same cross-product for
  published reading lists.
- `src/app/(public)/[locale]/layout.tsx:47` — `generateStaticParams()` returns one entry per locale,
  so the document shell (`<html lang>`) is prerendered per locale too.
- `export const revalidate = 60` on both detail pages (`:31`, `:17`) keeps them SSG with ISR where
  it belongs, not dynamic.

Nothing in the public tree reaches for a request-time API: a scan of `src/app/(public)/**` for
`cookies()`, `headers()`, `draftMode()`, `connection()`, `unstable_noStore` and
`export const dynamic =` finds **no page or layout**. The only `searchParams` reader is
`[locale]/reviews/page.tsx:56,65,68`. `src/app/(public)/layout.tsx` renders no markup at all, so no
boundary above the locale shell can go dynamic.

Reasoning for **every** `ƒ` entry in the table:

| Route | Why it is `ƒ` | Verdict |
| --- | --- | --- |
| `/[locale]/reviews` | reads `searchParams` for `q`/`genre`/`tag`/`sort`/`page` (pre-existing; Phase 3 note) | expected, pre-existing, **not** a regression |
| `/[locale]/reviews/[slug]/opengraph-image-1v12u2` | route handler that renders a PNG per request for its `params`; has no `generateStaticParams` of its own | expected — and it does **not** make the page dynamic (the page stays `●`) |
| `/[locale]/reading-lists/[slug]/opengraph-image-g9de6a` | same | expected |
| `/feed.xml` | permanent-redirect handler to `/en/feed.xml` (`308`), never prerendered | expected (`FR-9`) |
| `/sitemap.xml` | `dynamic = "force-dynamic"` by design — it queries both locales' published rows | expected (`FR-8`) |
| `/api/[...slug]`, `/api/translation/bulk-retranslate`, `/admin/[[...segments]]` | Payload handlers/admin, unprefixed by `FR-1` | expected |
| `Proxy (Middleware)` | the `src/proxy.ts` locale redirect | expected also |

`○ /_not-found` and `○ /robots.txt` are static as before.

So the phase goal holds: **detail pages pre-render per locale, and nothing went dynamic to make the
language control work.** The control reads `useSearchParams()` on the client only (Phase 2), which
is why it never forced the detail routes to render on demand.

## Accessibility (`NFR-1`)

Measured and asserted by `e2e/language-control-a11y.spec.ts` against the standalone production
build, so no client-side testing dependency was added (the specs only read attributes, computed
styles and keyboard focus).

**Control semantics** (both locales, `…spec.ts:148`):

| Check | `/en/about` | `/id/about` |
| --- | --- | --- |
| accessible group name | `role="group"` + `aria-label="Language"` | `role="group"` + `aria-label="Bahasa"` |
| active option announced | `EN` `aria-pressed="true"`, `ID` `aria-pressed="false"` | `EN` `false`, `ID` `true` |
| each label carries its own language | `lang="en"` / `lang="id"` | same |
| the target is named in words | `title="English"` / `title="Bahasa Indonesia"` | same |

A screen reader can therefore answer "which language am I reading, and what will the other button
do" without relying on colour, position or the letters `EN`/`ID`.

**Contrast** — computed in the browser from the *rendered* colours (a 1×1 canvas resolves each
`oklch()` token to sRGB, then WCAG relative luminance), not from the stylesheet:

| Theme | Active label | Measured | WCAG 2.2 AA (4.5:1) |
| --- | --- | --- | --- |
| light | `--foreground` on `--primary` | **4.95:1** | pass |
| dark | `--primary-foreground` on `--primary` | **7.77:1** | pass |

Before this phase the active pill painted `--primary-foreground` (white) on the light theme's teal,
which measures **3.66:1** — a real failure for a label of that size. `LanguageToggle.tsx` now uses
`text-foreground dark:text-primary-foreground`; the dark theme keeps the original pairing because
its `--foreground` on the lighter teal would measure ~2.3:1. Both ratios are pinned in the spec, so a
token change that silently drops below 4.5:1 fails the build.

**Keyboard** (`…spec.ts:209`, both themes): tabbing from the top of `/en/about` reaches the group
(the spec asserts `document.activeElement` sits inside `[role="group"]` with `aria-pressed`), the
focused option carries a non-`none` `box-shadow` focus ring from
`focus-visible:ring-2 ring-ring ring-offset-2` (asserted as a real `rgb(…)` shadow), `Tab` moves to
`ID`, and `Enter` navigates to `/id/about`, where the Indonesian heading renders. No keyboard trap,
no focus lost to `body`.

**Document language coverage** — `<html lang>` matches the served locale on every public page shape,
in both locales (`…spec.ts:307`): `/`, `/about`, `/reviews`, a review detail page, `/reading-lists`
and a reading-list detail page — 12 assertions — plus the chrome check that the locale's own skip
link is present exactly once and the other locale's is absent. The 404s are covered explicitly
(`…spec.ts:333`):

- `/fr/reviews` → `404`, `<html lang="en">` (root boundary, English — correct for an unsupported
  segment)
- `/en/reviews/not-a-published-review` → `404`, `<html lang="en">`
- `/id/reviews/not-a-published-review` → `404`, `<html lang="id">` (the locale shell wraps the root
  boundary, so the document language is the one the URL asked for)

## Bundle (`NFR-2`)

Measured from the served production build by the spec (`…spec.ts:253`), because the shell's
`Get-ChildItem`/`Select-String` are refused by this machine's permission set (see *Deviations*):

- **1,532,683 bytes** of uncompressed JavaScript across every `script[src]` the Indonesian home page
  (`/id`) loads — framework, main-app, layout, page and the route's client components.
- The spec asserts a ceiling of **1,600,000 bytes** (4 % headroom). The first measurement exceeded a
  placeholder 1,000,000 ceiling, which is how the real number was captured; that assertion was
  replaced with the pinned ceiling, not removed.
- **Dictionary absence — the claim that matters:** the `/id` HTML contains `Lewati ke konten` and
  `Daftar Bacaan`, and **none** of those chunks contains either string (the offenders list is
  asserted empty). The structural counterpart still holds in `src/lib/i18n/__tests__/dictionary-source.test.ts`:
  no `"use client"` file may value-import `@/lib/i18n/dictionary` (type-only imports are allowed).
- **Delta:** no pre-track byte baseline exists — the repo has no recorded total for `98351d5`, and
  producing one needs a second build from that commit, which this phase did not do (branch switching
  is out of scope). So no byte delta is claimed here. What is absolute is that **0 of the 1,532,683
  bytes come from the dictionary**, which bounds the track's client cost to the control component
  itself. No material regression is observed; the pinned ceiling is the guard that would surface
  one.

## Acceptance criteria (`AC-1` … `AC-11`)

Every row was re-demonstrated in this phase's run (91 passed) against the standalone production
build — not cited from an earlier phase.

| AC | Criterion | URL(s) exercised | Proof in this run |
| --- | --- | --- | --- |
| AC-1 | `/en`, `/id` and `/id/reviews/<slug>` render; `/fr/...` 404s; `/reviews` redirects to a locale URL | `/en`, `/id`, `/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac`, `/fr/reviews`, `/fr/reviews/<slug>`, `/reviews` | `locale-routing`: *serves both locales*, *404s an unsupported locale segment*, *404s an unsupported locale on a deep link*, *redirects a bare public path to the default locale* (307 → `/en/reviews`) |
| AC-2 | Toggle then `/` lands on the toggled locale; the cookie survives a new session; a direct `/id/...` link does not change the preference | `/en/reviews/<slug>` → `/id/...`, then `/about`, then `/` | `locale-routing`: *the language control remembers the choice across a reload* (cookie `NEXT_LOCALE=id`, `SameSite=Lax`, expiry > now + 1 day, survives a reload and a bare `/about` → `/id/about`), *a direct Indonesian URL leaves the stored preference alone*, *remembers the chosen locale from the cookie*, *falls back to English for an unusable remembered locale* (stale cookie) |
| AC-3 | Toggling on `/en/reviews?sort=title&page=2` lands on `/id/reviews?sort=title&page=2` | `/en/reviews?sort=title&page=2` | `language-control-a11y`: *switches the browse page without dropping its query string* (`/id/reviews`, `sort=title`, `page=2`); `locale-routing`: *the language control keeps the rest of the URL* (detail page, `?sort=title`) |
| AC-4 | Every public page renders its Indonesian interface at `/id/...`; a test proves identical `en`/`id` key sets | 6 page shapes × 2 locales | `language-control-a11y`: *declares id on every public page* (Indonesian skip link present once, English absent) for home / about / browse / review detail / reading lists / reading-list detail; parity: `src/lib/i18n/__tests__/dictionary.test.ts` — *both locales expose an identical key set*, *no locale carries a blank string*, *the language labels name each language in its own words* (in the 515) |
| AC-5 | `/id/reviews/<slug>` serves `<html lang="id">`, Indonesian metadata, self canonical, `og:locale: id_ID`; the English mirror | `/en/reviews/<slug>`, `/id/reviews/<slug>` | `locale-metadata`: *declares the document language per locale*, *describes the Indonesian review page in Indonesian* (`Baca ulasan … karya …. Rating: …/5 bintang.`, `og:locale=id_ID`, alternate `en_US`), *describes the English review page in English*, *canonicalizes each review page to its own locale*; `language-control-a11y` confirms `lang` on 12 page shapes |
| AC-6 | HTML carries reciprocal `hreflang` for `en`, `id`, `x-default` pointing at path URLs | every page above, both locales | `locale-metadata`: *emits reciprocal hreflang alternates from both locales*, *keeps the browse page's alternates on the path, not the query* (`x-default` → `/en/...`); unit `src/lib/seo/__tests__/metadata.test.ts` |
| AC-7 | `/en/reviews/<slug>?locale=id&sort=title` permanently redirects to `/id/reviews/<slug>?sort=title` | that exact URL, plus a bare path carrying `?locale=id` | `locale-routing`: *permanently redirects a legacy locale parameter to the path form* (308, `sort=title` preserved, `locale` dropped), *permanently redirects a bare path carrying the legacy parameter* |
| AC-8 | Sitemap lists both locale variants with `alternates.languages`; `/feed.xml` → `/en/feed.xml`; `/id/feed.xml` declares Indonesian | `/sitemap.xml`, `/feed.xml`, `/en/feed.xml`, `/id/feed.xml` | `locale-metadata`: Feeds — *redirects the pre-locale feed to English permanently* (308), *serves the English feed*, *serves the Indonesian feed with Indonesian item text* (`<language>id</language>`, self link, `/id/reviews/` hrefs); Sitemap — *lists every fixture review in both locales with hreflang*, *lists both locales of the static pages and the reading list* |
| AC-9 | Indonesian genre name and reading-list description render on `/id`; a cleared value falls back to English, never blank | `/id/reviews/e2e-fixture-the-lighthouse-keepers-almanac`, `/id/reviews/e2e-fixture-salt-and-paper-lanterns`, `/id/reading-lists`, `/id/reading-lists/e2e-fixture-rainy-season-reading-list`, plus the English mirrors | `content-localization` (all 10 specs): `Fiksi Ilmiah` on the id page with `Sci-Fi` absent, English page unchanged, `Fantasy` falling back, `Permata Tersembunyi` / `Hangat`, localized genre filter, `Daftar Bacaan Musim Hujan` and its description, English body for an untranslated review |
| AC-10 | Review and reading-list detail routes build pre-rendered | both detail routes, both locales | route table above: `●` for `/en|/id/reviews/<slug>` and `/en|/id/reading-lists/<slug>`; `generateStaticParams` cross-product in both pages; no request-time API in the public tree |
| AC-11 | The browser suite passes with locale-explicit URLs and Indonesian coverage for the toggle, translated chrome and locale metadata | the whole suite | **91 passed** (2.2 m) against the standalone production build; 11 new specs in `e2e/language-control-a11y.spec.ts` |

`FR-12` is `AC-10`; `NFR-1`/`NFR-2` are the accessibility and bundle sections above. `NFR-6`
(Next.js 16.4 conventions) is unchanged and still holds — `src/proxy.ts`, per-locale `<html>` in
`(public)/[locale]/layout.tsx`, no `middleware.ts`.

## Deviations

| File / command | Why |
| --- | --- |
| `src/components/reviews/LanguageToggle.tsx` (inside `Touches`) | fixed the light-theme active label from 3.66:1 to 4.95:1 (`text-foreground dark:text-primary-foreground`) — `NFR-1` required it, not merely recorded |
| `e2e/language-control-a11y.spec.ts` (new, inside `e2e/**`) | the phase's browser evidence: contrast, keyboard walk, semantics, `lang` coverage, dictionary absence + bundle size |
| `.env.local` (git-ignored, not in `Touches`) | created to run `bun run build` against a migrated database, then **emptied**. `Remove-Item` is refused by this machine's permission set, so the file could not be deleted; it is matched by `.env*` in `.gitignore` and now sets no variables. **The primary should delete it** (`Remove-Item .env.local`) — with it empty, `bun run build` behaves exactly as before. |
| local dev database (environment, not a file) | `bun run payload migrate` cannot replay its dev-push ledger (see above). Untouched by this phase; the green build used the harness database instead. |

No product, copy or design decision was made. No dependency was added. No generated file
(`importMap.js`, drizzle snapshots, `payload-types.ts`) was edited.

## Measurement deviations

The brief allowed `Get-ChildItem`/`Select-String` for the bundle numbers. On this machine the
permission set rejects them (`{"error":{"type":"permission.rejected","message":"Permission denied: shell"}}`),
as it does `Remove-Item` and `payload migrate:status`. Only Git, the named verification commands and
`bunx biome check --write` execute. The bundle numbers therefore come from the browser spec
(`page.request` sizes of the chunks the page loads) rather than from `.next/static/chunks`, which is
the brief's stated alternative — the totals cover the JS a public page *actually references*
(1,532,683 bytes), not every chunk the build emits.

## Follow-ups (deliberately left behind)

1. **The 404 body is English.** `not-found.js` accepts no props, so the root boundary cannot read
   the locale, and reading the locale cookie there was refused in Phase 2 because it flips every
   `[locale]` route from `●` to `ƒ`. The *document* is correct per served locale now (asserted
   above); localizing the body needs a prerender-safe locale signal.
2. **`/[locale]/reviews` stays dynamic** for its filters. Pre-existing, unchanged, and out of
   `AC-10`'s scope; it is the only page-shaped `ƒ` in the tree.
3. **The local dev database needs a rebuild** before `bun run build` works without the harness:
   `payload migrate:fresh` (destroys local dev data) or one `bun run dev` to push the schema.
4. **No pre-track bundle baseline** exists, so `NFR-2` is evidenced by an absolute measurement plus
   the dictionary-absence proof and a pinned ceiling, not by a diff against `98351d5`.
5. **Two language controls on a review page** — one in the navbar (`FR-3`, every page) and the hero
   one the detail layout has always had. Both are correct and tested; the duplication is a design
   question, so it is recorded rather than changed.
6. **The two `opengraph-image` handlers remain `ƒ`.** They render per request for their `params`;
   pre-rendering them would need their own `generateStaticParams` and is not part of `FR-12`.

## Files touched

- `src/components/reviews/LanguageToggle.tsx` — contrast fix on the active option
- `e2e/language-control-a11y.spec.ts` — 11 new specs (new file)
- `conductor/tracks/20261023-bilingual-site-experience/verification/phase-5.md` — this file

## Primary verification

Re-run by the primary on the same tree, after the phase reported, before acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | `✓ No type errors in 228 files [1200.10ms]` |
| `bun run lint` | 0 | `Checked 220 files in 257ms. No fixes applied.` |
| `bun test` | 0 | **515 pass / 0 fail**, 42 files |
| `bun run test:e2e` | 0 | **91 passed (2.2m)**, 0 failed, 0 skipped |
| `bun run build` | 0 | 25/25 static pages; route table byte-for-byte the same shape as the one above |

**On the build environment.** The phase's build ran against the harness database through a
temporary `.env.local`. The primary reproduced it with process environment only
(`DATABASE_URI` → `chasing-chapters_e2e`, `STORAGE_ADAPTER=local`, empty
`NEXT_PUBLIC_R2_PUBLIC_URL`) and deleted the leftover empty `.env.local`, so that deviation is
closed: nothing outside git-ignored territory was left behind, and no repository file depends on
it. The same command against the local dev database still fails with
`column reviews_locales.title does not exist`, which is that database's unreplayable dev-push
ledger and not a track defect — CI and the harness both migrate from a consistent ledger, and the
e2e run proves the migration chain applies cleanly on top of an existing scheme. Recorded for the
user as a local-environment repair, not as a phase failure.

**Diff against Touches.** Three paths, all inside: `src/components/reviews/LanguageToggle.tsx`,
the new `e2e/language-control-a11y.spec.ts`, and this evidence file. No unreported file.

**Checked in the code, not the report.**

- The contrast fix is the smallest change that satisfies NFR-1: one class string, no structural
  or behavioural change, applied only to the active option. The reasoning holds — white on the
  light theme's `--primary` measures 3.66:1, which is below the AA floor for a label of that size,
  while `--foreground` on the same fill measures 4.95:1, and the dark theme keeps
  `--primary-foreground` because `--foreground` there would land near 2.3:1.
- The accessibility spec measures what a reader would see rather than what the stylesheet
  promises: it resolves the `oklch()` tokens through a canvas and computes WCAG luminance from
  the resulting sRGB values, drives the control with `Tab`/`Enter`, and asserts a real
  `box-shadow` ring. The two ratios are pinned, so a future token change below 4.5:1 fails the
  suite.
- The bundle claim is the one that matters and it is proven, not asserted: the Indonesian strings
  are present in the served HTML and absent from every chunk that page loads, with a pinned
  ceiling on the total. No pre-track byte baseline exists, so NFR-2 is evidenced as an absolute
  measurement plus the absence proof — honest, and recorded as a follow-up rather than papered
  over with a fabricated delta.
- Pre-rendering: `generateStaticParams` on `[locale]/layout.tsx` and both detail routes returns
  the locale cross-product, no page or layout in the public tree touches a request-time API, and
  the only `searchParams` reader is the browse page that owns the filters. Every `ƒ` entry in the
  route table has a stated reason.
- The 404 finding is stated accurately: the document language follows the served locale for
  locale-scoped 404s because the locale shell wraps the root boundary, while the body copy stays
  English. Both are asserted, and the body is a follow-up rather than a claim.

Deviations accepted. Squashed `8dd6df8..40c6a6e` into one phase commit.
