# Phase 1 — Locale Routing Foundation — Verification

- **Track:** `20261023-bilingual-site-experience`
- **Phase:** 1 of 5 (Locale Routing Foundation)
- **Date:** 2026-10-23
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Base commit:** `7eeb430e72017e3155cc3dec957bfb2cb563a4d1`
- **Head commit (code):** `8f98f1b` (evidence commit follows it)
- **Result:** **verified** — the phase command passes end to end: typecheck 0, lint 0,
  458 unit tests pass, and the browser suite runs 55 specs with 0 failures against a
  production standalone build. Two rework findings (dead revalidation paths, a second
  locale module) are fixed in `8ddc172` and `8f98f1b`.

An earlier attempt at this phase reported **blocked** on a stale `.next/dev` cache
that was unrelated to the source. The primary agent removed that git-ignored
directory; this file records the completed run.

## Commands

The phase command was run as one chain, in the order the brief specifies.

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` (`bun check`) | 0 | `✓ No type errors in 210 files [1105.34ms]` |
| static | `bun run lint` (`biome check .`) | 0 | `Checked 205 files in 284ms. No fixes applied.` |
| unit | `bun test` | 0 | `458 pass`, `0 fail`, 1040 `expect()` calls, 36 files |
| e2e | `bun run test:e2e` | 0 | create db → `payload migrate` → seed → `next build` → Playwright: **55 passed (2.0m)**, 3 workers |
| combined | `bun run typecheck && bun run lint && bun test && bun run test:e2e` | 0 | every layer green in one chain |
| build | `bun run build` | 0 | `next build --webpack` on Next.js 16.4.2: 23 static pages, route table below |

The unit output carries the usual expected failure-path noise (`[Revalidation]`,
`[Translation]` retry/backoff series, `[TranslationLock]` Redis fallbacks,
`[RateLimit]` Redis error, `[Translation] Attempt n/3 failed` stacks) — all
pre-existing and asserted by their own tests.

### Build output (from the e2e run)

The production build proves the routing shape directly:

```
├   /[locale]                 ● /en, ● /id
├   /[locale]/about           ● /en/about, ● /id/about
├   /[locale]/reading-lists   ● /en/reading-lists, ● /id/reading-lists
├   /[locale]/reviews/[slug]  ● /en/reviews/…, ● /id/reviews/…  (+5 more paths)
├ ƒ /[locale]/reviews
├ ○ /feed.xml   ├ ○ /robots.txt   ├ ƒ /sitemap.xml
ƒ Proxy (Middleware)
```

Both locales pre-render for the static pages and for every published review and
reading list; `/feed.xml`, `/robots.txt` and `/sitemap.xml` stay unprefixed.

### Browser suite

55 specs, 0 failures. The new `e2e/locale-routing.spec.ts` (12 cases) covers the
bare-path redirect, the remembered cookie, the malformed-cookie fallback, the
query string surviving the locale insert, the permanent `?locale=` redirect with
its preserved query, the unsupported-locale 404s, the untouched admin/feed
surfaces, the in-browser landing on `/en/...`, and the language control keeping
the rest of the URL. Both rewritten specs that assert on the toggle — 
`e2e/review-detail.spec.ts` ("should toggle language when clicking ID button")
and the new locale-routing case — pass.

## Tasks

| Task | Status | Commit | Notes |
| --- | --- | --- | --- |
| P1.T1.1 — document shell moves under the locale | done | `d1db467` | `(public)/layout.tsx` is a metadata-only pass-through; `(public)/[locale]/layout.tsx` owns `<html lang>`, fonts, Umami tags, JSON-LD, `ThemeProvider`, skip link, Navbar `Suspense`, `<main id="main-content">` and `Footer`, plus `generateStaticParams` and a `hasLocale` + `notFound()` guard |
| P1.T1.2 — route moves | done | `d1db467` | 14 files `git mv`'d under `[locale]/`; dynamic children return the locale × slug cross product |
| P1.T1.3 — normalized locale on every read | done | `d1db467` | Every public page and both `opengraph-image.tsx` read `locale` from `params`, normalize once and pass it into Payload; the `locale as "en" \| "id"` cast is gone with the `searchParams` read |
| P1.T2.1 — pure helpers + unit tests | done | `bc618c4` | `src/lib/i18n/locale.ts` and `src/lib/i18n/__tests__/locale.test.ts` (20 tests) |
| P1.T2.2 — proxy redirects | done | `c7a221d` | `src/proxy.ts`: 307 to the remembered (else default) locale, 308 for a supported `?locale=`, both preserving the other query params |
| P1.T2.3 — untouched surfaces + 404 | done | `c7a221d` | `/admin`, `/api`, `/robots.txt`, `/sitemap.xml`, `/feed.xml` and any path with a file extension pass through; an unsupported locale segment is matched by `[locale]` and 404s from the layout guard |
| P1.T3.1 — specs and fixtures | done | `a95d944` | `e2e/fixtures/locale.ts` + every spec navigates and selects on `/en/...`; admin specs unchanged |
| P1.T3.2 — redirect spec | done | `a95d944`, `67f0ac4` | `e2e/locale-routing.spec.ts`, 12 cases; the first e2e run exposed that the proxy answers with a path-only `Location`, so the assertions resolve it against the suite base URL |
| P1.T3.3 — language control | done | `d973cc6` | Path-based swap keeping slug/depth/query; both the existing toggle spec and the new locale-routing case assert the `/id/...` landing |

### Rework round 1

| Finding | Fix | Commit |
| --- | --- | --- |
| Revalidation named pre-restructure paths, so ISR caches for the per-locale pages were never invalidated | `localizedPaths()` in `src/lib/i18n/locale.ts` (built on `localizePath`) maps one logical public path to its per-locale URLs; `revalidatePages.ts` and both review actions use it. `/feed.xml` stays single and unprefixed. `src/hooks/__tests__/revalidatePages.test.ts` now asserts the exact call sequence, both locales per path | `8ddc172` |
| `date-format.ts` carried a second `AppLocale` and a second `normalizeLocale` body | `AppLocale` is now an alias of `Locale`; one `normalizeLocale` body remains, in `src/lib/i18n/locale.ts`; the review page imports it from there like every sibling. Date helpers keep their signatures and their tests | `8f98f1b` |

## Acceptance criteria

| AC | Covered here | Evidence | Status |
| --- | --- | --- | --- |
| AC-1 — `/en`, `/id` and a deep `/id/reviews/<slug>` render, `/fr/...` 404s, `/reviews` redirects to a locale path | Yes | `e2e/locale-routing.spec.ts` ("serves both locales", "redirects the root to the default locale", "redirects a bare public path to the default locale", "404s an unsupported locale segment", "404s an unsupported locale on a deep link"); build route table shows both locales pre-rendered | **Verified** |
| AC-7 — `/en/reviews/<slug>?locale=id&sort=title` → permanent redirect to `/id/reviews/<slug>?sort=title` | Yes | `e2e/locale-routing.spec.ts` ("permanently redirects a legacy locale parameter to the path form": status 308, pathname `/id/reviews/<slug>`, `sort=title` kept, `locale` dropped) and ("permanently redirects a bare path carrying the legacy parameter") | **Verified** |
| NFR-4 — pure helpers with unit tests | Yes | `src/lib/i18n/__tests__/locale.test.ts`; `bun test` exit 0 | **Verified** |
| NFR-6 — Next.js 16.4 conventions | Yes | `src/proxy.ts` (the `proxy` export and `config.matcher`), per-locale `<html lang>` in `[locale]/layout.tsx`, `params` awaited as promises | **Verified by build + suite** |

## Evidence paths

- `src/lib/i18n/locale.ts`, `src/lib/i18n/__tests__/locale.test.ts` — helpers and their unit tests
- `src/lib/date-format.ts`, `src/lib/__tests__/date-format.test.ts` — the date helpers on the single `Locale` type
- `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts` — per-locale invalidation and its asserted call sequence
- `src/app/actions/like-review.ts`, `src/app/actions/comments.ts` — review invalidation after a like or a comment
- `src/proxy.ts` — the redirect surface
- `src/app/(public)/[locale]/layout.tsx` — the per-locale document shell
- `e2e/locale-routing.spec.ts`, `e2e/fixtures/locale.ts` — the browser-level proof for AC-1 and AC-7
- `e2e/{navigation,sort,review-detail,homepage,comments,feed}.spec.ts` — rewritten to the locale-prefixed URLs
- Command output for the table above was read directly from the runs recorded in this session; the harness does not allow shell redirection into `.conductor/evidence/`.

## Deviations

| File | Reason |
| --- | --- |
| `src/components/ReviewCard.tsx` | Outside `Touches`. The card already carried a `locale` prop for its date; the root `href` now uses it, so a card links within its locale instead of bouncing through the redirect to the remembered locale. Two lines. |
| `src/components/ReadingListCard.tsx` | Outside `Touches`. Gained the same small `locale` prop (default `"en"`), used only for the root `href`, so the homepage's reading-list link resolves inside the locale the page is served at. |
| `src/lib/date-format.ts`, `src/lib/__tests__/date-format.test.ts` | Authorised by rework round 1: remove the duplicate `normalizeLocale` body and alias `AppLocale` to `Locale`. |
| `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts` | Authorised by rework round 1: revalidate the per-locale URLs and assert both locales per path. |
| `src/app/actions/like-review.ts`, `src/app/actions/comments.ts` | Authorised by rework round 1: the review-slug invalidation after a like or an approved comment follows the locale move. |

No product or design decision was made; both changes are the smallest edit that
keeps the restructure's links locale-correct.

## Notes for the primary

1. **The earlier blocker was a stale cache, not source.** `.next/dev/types` was
   git-ignored output from an earlier `next dev` session describing the
   pre-restructure routes, and `tsconfig.json` includes it by Next's default.
   Two things conspired to keep it visible: `next build` never deletes
   `.next/dev`, and its filter of that directory
   (`node_modules/next/dist/lib/typescript/runTypeCheck.js`) is a no-op on
   Windows — `getDevTypesPath()` builds `…\.next\dev\types` with backslashes
   (`node_modules/next/dist/lib/typescript/type-paths.js`) while TypeScript
   reports forward-slash file names, so `fileName.startsWith(devTypesDir)` never
   matches. After deleting the directory, typecheck, build and the whole chain
   pass with no source change. Recommended for the working tree: delete
   `.next/dev` before a verification run, or let `next dev` regenerate it after
   a route restructure.
2. *(Superseded — see note 10.)* **`bun run build` was intermittently interrupted
   by a Next 16.4 agentic upgrade nudge.** In this harness `__NEXT_AGENT_UPGRADE` is set, so the build
   assesses security advisories and, once per five-minute window, throws
   `SecurityFatalError` to show an upgrade recommendation
   (`node_modules/next/dist/lib/upgrade/nudge.js`). The nudge writes a receipt in
   `.next/cache/next-agentic-upgrade-retries/`; a build started within five
   minutes consumes it, prints "This command is continuing after the upgrade
   reminder" and proceeds, and the next build blocks again. Hence the run that
   produced the table above prefixed the chain with one priming `bun run build`.
   Nothing in the repository enables this — it is the environment.
3. **Bare links remain in `src/components/**`** — `Navbar`, `Footer`
   (`/feed.xml`, deliberately), `GenreMarquee`, `FeaturedHero`,
   `ModernBookCarousel`, `GenreSelect`. They still work through the proxy
   redirect, but on an `/id/...` page they land on the remembered preference,
   which stays English until Phase 2 writes the cookie. The plan gives
   `src/components/**` to Phase 2, so this is deferred rather than patched.
4. **Revalidation is now locale-aware** (fixed in `8ddc172`). One logical path
   maps to its rendered URLs through `localizedPaths()`, so a review write
   invalidates `/en/reviews`, `/id/reviews`, `/en/reviews/<slug>`,
   `/id/reviews/<slug>`, `/en` and `/id`; a reading list the same; `/feed.xml`
   stays a single unprefixed call until Phase 3. One thing the primary should
   know before reading the seed log: the
   `[Revalidation] Could not revalidate "…"` lines **do not disappear**, and
   cannot, without deleting the guard the brief asks to keep. Next raises that
   invariant whenever there is no request-scoped store — before it looks at the
   path at all (`node_modules/next/dist/server/web/spec-extension/revalidate.js`,
   `revalidate()`: `if (!store || !store.incrementalCache) throw new Error(...)`).
   The seed writes through Payload's local API, so every call lands in that
   branch. What changed is the payload of the message: it used to name
   `/reviews`, `/reviews/<slug>`, `/reading-lists`, `/` — routes that no longer
   exist — and now names `/en/reviews`, `/id/reviews`, `/en/reviews/<slug>`,
   `/en`, `/id`, which are the routes the build actually renders. The unit test
   asserts the exact paths, so this is checked rather than inferred.
5. **`/fr/reviews`** is matched by `[locale]` and 404s from the layout guard, not
   from the proxy — the proxy deliberately only knows the three public roots, so
   an unknown first segment falls through to routing.
6. `/feed.xml`, `src/app/sitemap.ts` and `src/app/robots.ts` were left untouched;
   they still describe the English, unprefixed site until Phase 3.
7. `src/app/not-found.tsx` still hardcodes `<html lang="en">`; localizing it is
   Phase 2 copy work.
8. The two `google-gax` "Can't resolve '../../package.json'" build warnings are
   pre-existing and unrelated to this phase.
9. **One locale module now** (fixed in `8f98f1b`). `Locale` in
   `src/lib/i18n/locale.ts` is the source of truth; `date-format.ts` keeps
   `AppLocale` as an alias so the six components that take it as a prop keep
   compiling unchanged, and `grep "function normalizeLocale"` returns exactly one
   hit. The `normalizeLocale` tests moved with the function — they already existed
   in `src/lib/i18n/__tests__/locale.test.ts`, so `date-format.test.ts` lost a
   duplicate describe block instead of gaining one.
10. `bun run build` no longer needs priming: `/` now resolves Next.js 16.4.2 and
   the agentic upgrade nudge described in the previous revision of this file does
   not fire. Note 2 above is kept for the record only.

## Primary verification

Re-run by the primary on the reworked phase, after rebasing the branch onto
`9183729` (Next.js 16.4.2) and before acceptance.

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | No type errors in 210 files |
| `bun run lint` | 0 | Checked 205 files, no fixes applied |
| `bun test` | 0 | 458 pass / 0 fail across 36 files |
| `bun run test:e2e` | 0 | 55 passed (2.0m), 0 failed, 0 skipped |
| `bun run typecheck && bun run lint && bun test && bun run test:e2e` | 0 | the configured phase command |

The first run of this gate failed on the Next.js security nudge
(`SecurityFatalError`) rather than on the phase; that was resolved by upgrading
Next on `main` to 16.4.2 in a separate change, then rebasing. It is not a phase
deviation.

Both round-1 rework items were checked in the diff, not taken on report:

- **Revalidation** — `localizedPaths` (`src/lib/i18n/locale.ts`) is the single
  path-to-locales helper; `revalidatePublicPath` in
  `src/hooks/revalidatePages.ts` and both server actions
  (`src/app/actions/like-review.ts:59`, `src/app/actions/comments.ts:142`) route
  through it, and `/feed.xml` stays a single unprefixed call until Phase 3.
  `src/hooks/__tests__/revalidatePages.test.ts` asserts the exact call sequence
  — 7 paths for a review, 6 for a reading list — so a regression cannot pass
  silently.
- **One locale module** — `grep "function normalizeLocale"` returns exactly one
  hit (`src/lib/i18n/locale.ts:57`); `date-format.ts` keeps `AppLocale` as an
  alias of `Locale` and no file imports `normalizeLocale` from it any more.

The subagent's correction to my instruction is accepted and recorded: the
`[Revalidation] Could not revalidate "…"` lines cannot disappear, because Next
throws that invariant before it inspects the path whenever there is no
request-scoped store, which is always true for the seed's local-API writes. What
mattered was the path each line names, and those are now `/en/...` and `/id/...`
instead of routes that no longer exist.

Deviations accepted: the two round-1 component changes (`ReviewCard.tsx`,
`ReadingListCard.tsx`) for in-locale card links, and the eight files authorised
for the rework round (`date-format.ts` and its test, `revalidatePages.ts` and its
test, both server actions, and the review page's import).

