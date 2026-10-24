# Phase 2 — Preview Entry and Draft Rendering

| Field  | Value |
| ------ | ----- |
| Track  | `20261024-draft-preview-scheduling` |
| Phase  | 2 — Preview Entry and Draft Rendering |
| Date   | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base   | `2b1dfad` (`2b1dfadb3b14d595760c3cbe5a73c3e44f8d4d1c`, Phase 1 checkpoint `c76ba18` behind it) |
| Head   | `34c8681` (this file lands in the commit that follows it) |
| Result | **verified** |

Goal of the phase: an authenticated author or admin can open any review — including
one that has never been published — on its real public URL in either locale, with a
banner that names it a preview, an exit that returns to the same URL, and no
cacheable or indexable trace left behind; and the review detail routes stay
pre-rendered while all of that is true.

## Commands

The phase's configured verification, run exactly as written, on the final tree
(`bun run typecheck && bun run lint && bun test && bun run test:e2e`):

| # | Command | Exit | Numbers |
| - | ------- | ---- | ------- |
| 1 | `bun run typecheck` (`bun check`) | 0 | `✓ No type errors in 241 files [2.31s]` |
| 2 | `bun run lint` (`biome check .`) | 0 | `Checked 231 files in 406ms. No fixes applied.` |
| 3 | `bun test` | 0 | **555 pass, 0 fail**, 1289 `expect()` calls, 45 files, 3.63 s |
| 4 | `bun run test:e2e` | 0 | `next build` clean except the known `google-gax` warning, 27 static pages, **105 Playwright tests passed (3.9m)** |
| — | full chain | **0** | all four steps above |

Supporting runs inside the phase: `bunx biome check --write` (twice, formatting only),
and three development passes of `bun run test:e2e` used to fix the new spec (see
*Notes* for the flakiness that the fourth pass removed).

Unit-suite console output was the expected pre-existing failure-path noise only:
`[Revalidation] …`, the `[Translation]` matrix (`Attempt N/3 failed`, `Automatic
delayed re-run`, `Pipeline already running`, `Delayed re-run skipped`, `Marked stale
for review 1`), `[RateLimit] Blocked…` / `[RateLimit] Redis error, allowing request`,
and `[TranslationLock] Redis acquire/check/release failed` /
`[Translation] Initializing Google Cloud client…`.

## Acceptance criteria

| AC | Status | Evidence |
| -- | ------ | -------- |
| AC-1 — a signed-out entry request is refused and enables nothing; a signed-in author is redirected and sees the banner | **proved** | `e2e/admin/draft-preview.spec.ts` › *refuses the entry without a session and leaves the review hidden*: a fresh `browser.newContext()` GETs `/api/preview?slug=…&locale=en` with `maxRedirects: 0` and gets **401** with **no `set-cookie`** header at all (`expect(entry.headers()["set-cookie"]).toBeUndefined()`), so no bypass cookie was minted for reuse; `/en/reviews/<slug>` and `/id/reviews/<slug>` then both **404** for that client. The signed-in half is *previews the scheduled review, switches locale in preview and exits*: after `loginAsFixtureAdmin`, the same URL answers **307**, `Location` pathname `/en/reviews/e2e-fixture-the-slow-orbit` with an **empty query string**, the context cookie jar contains `__prerender_bypass`, and the banner is visible. Unit-level: `isSameOriginPath` rejects `//host`, `/\host`, absolute URLs and bare segments. |
| AC-2 — a never-published draft renders in draft mode and 404s outside; the same for a published review with a future `publishAt` | **partly proved here** — the *future `publishAt`* half is proved; the *never-published* half is Phase 3 (`P3.T2.1`) | The scheduled fixture (`e2e-fixture-the-slow-orbit`, `publishAt` 2030-01-01) **404s** for an anonymous client in both locales and **renders its body** with the banner for the signed-in previewer (`h1` contains `E2E Fixture: The Slow Orbit`). Phase 1 already proved the public 404 for both locales (`e2e/publish-schedule.spec.ts`). No fixture review is currently in `_status: draft`, so the never-published half is left to the draft fixture Phase 3 adds — the brief allows this explicitly. |
| AC-3 — banner appears, the locale link switches locale while staying in preview, Exit returns to the same URL with the banner gone | **proved** | Same spec: banner `aside[role="status"]` visible with `Preview`; its link click lands on `/id/reviews/e2e-fixture-the-slow-orbit` with `html[lang=id]`, the banner still visible and now reading `Pratinjau` (so the bypass cookie survived the locale switch); the banner's button submits the POST exit form and returns to the *same* `/id/…` URL with `toHaveCount(0)` for the banner and the same URL now **404** through `page.request`, i.e. the authority really is gone rather than merely hidden. |
| AC-4 — previewed response is `noindex, nofollow`, `private, no-store`, has no canonical, no hreflang, no OG image, and appears in neither sitemap nor feed | **proved** | On the preview navigation: `meta[name="robots"]` matches `/noindex/` and `/nofollow/`, `link[rel="canonical"]` count **0**, `link[rel="alternate"][hreflang]` count **0**, `meta[property="og:image"]` count **0**, and the document response's `cache-control` contains **`private`** and **`no-store`**. While previewing, `GET /sitemap.xml` and `GET /en/feed.xml` both return 200 and neither body contains the slug. Unit-level: `buildPreviewMetadata` asserts `robots === { index: false, follow: false }`, `alternates === undefined`, `openGraph.images === []`. |
| AC-5 … AC-9 | out of scope | Scheduling behaviour, verified in Phase 1 / Phase 3. |
| AC-10 — production build reports both review detail routes pre-rendered | **proved** | See *Notes* → the route table, quoted from this phase's `bun run test:e2e` build. |

## Functional and non-functional requirements

| Req | Status | Where |
| --- | ------ | ----- |
| FR-1 — authenticated entry for one review + locale, redirect to the public URL, 401 and no `enable()` without a session | done | `src/app/(payload)/api/preview/route.ts`: `GET ?slug=&locale=`; empty slug → 400 `A slug is required`; `!hasLocale(locale)` → 400 `A supported locale is required`; `payload.auth({ headers })` then `!user` → 401 `Authentication required` **before** `draftMode()` is even awaited for enabling; the lookup runs with `draft: true`, `depth: 0`, `locale`, **no** `_status`/`publishAt` filter, `overrideAccess: false` and the authenticated `user` (so a writer can only preview their own review through the Reviews access rules, exactly as `bulk-retranslate` does); not found → 404; then `(await draftMode()).enable()` and `NextResponse.redirect(new URL(reviewPath(slug, locale), request.url))` so the cookie rides on the redirect response itself. |
| FR-1 — exit action disables draft mode and returns to the same URL | done | `src/app/(payload)/api/preview/exit/route.ts`: `POST` only, reads `returnTo` from the form body, honours it only through `isSameOriginPath` (falls back to `/`), calls `(await draftMode()).disable()` and answers `NextResponse.redirect(…, 303)`. 303 rather than the default 307 because 307 would replay the POST against a page route. The banner submits it as a plain `<form method="post">`, so exit works before hydration and no crawler following a link can end a preview. |
| FR-1 — Payload's native Preview button is wired to the document being edited, in the locale being edited | done | `src/collections/Reviews.ts`: `admin.preview` returns `/api/preview?slug=<doc.slug>&locale=<normalizeLocale(locale)>`, or `null` when the document has no slug yet (so a create view shows no button). Payload passes the document, the admin's currently selected `req.locale` and the JWT; the returned string is used verbatim as the button `href` (`@payloadcms/ui` `PreviewButton` renders `<a id="preview-button" target="_blank" href={previewURL}>`), which is why a root-relative `/api/preview…` is correct. No token is put in the URL (NFR-2). |
| FR-2 — in draft mode the public route renders the newest version in the requested locale, published or not; draft rendering additionally requires a valid session | done | `loadReview(slug, appLocale, depth)` in `src/app/(public)/[locale]/reviews/[slug]/page.tsx`: `const draftEnabled = (await draftMode()).isEnabled;` then `const user = draftEnabled ? (await payload.auth({ headers: await headers() })).user : null;` then `canRenderDraft({ draftEnabled, hasSession: user !== null })`. Only when both are true does it fetch with `draft: true, overrideAccess: false, user` and no visibility filter, returning `{ review, preview: true }`. Otherwise it runs the **unchanged** public lookup (`and: [slug, publishedAndVisibleWhere(now)]`) and returns `preview: false`. |
| FR-2 (second half) — draft mode without a session renders the public view, never draft content | done | `canRenderDraft` requires both signals; unit test *falls back to the public view when the session expired* covers the case that matters (`__prerender_bypass` outlives a logout). AC-1's anonymous request additionally proves no cookie is ever minted without a session. |
| FR-2 — a hidden review 404s for everyone who is not previewing | done | The public branch keeps `publishedAndVisibleWhere(new Date())` and `if (!review) notFound();`; `generateStaticParams` is untouched. |
| FR-3 — every previewed page shows a banner naming it a preview, offering the other locale and an exit | done | `src/components/reviews/PreviewBanner.tsx` — a server component rendered as the first child of `<article>` when `preview` is true, `<aside role="status" aria-label=…>`, dictionary copy in both locales, a plain `<a>` to `reviewPath(slug, otherLocale(locale))`, and the POST exit form carrying `returnTo={reviewPath(slug, locale)}`. |
| FR-4 / NFR-1 — no canonical, no hreflang, no OG image, `noindex, nofollow` | done | `buildPreviewMetadata` in `src/lib/preview.ts`, used by `generateMetadata` when `preview` is true. It returns `{ title, description, robots: { index: false, follow: false }, openGraph: { type, title, description, images: [] } }` and no `alternates` key. The **empty `images` array is load-bearing**: Next's `mergeStaticMetadata` only falls back to the route's `opengraph-image.tsx` when the page metadata has no `images` property (`metadata-resolution-primitives.js`), so leaving the key out would still emit `og:image`. The OG route handler itself was not gated on draft mode, as instructed. |
| NFR-1 — public routes stay pre-rendered; draft mode is a per-request bypass | done | Route table below: both review detail routes are still `●` with the same 8 paths as Phase 1 (`4 publicly visible reviews × 2 locales`), and the conditional does **not** flip the route. |
| NFR-2 — no new secret or env var, authority is the existing session cookie, no bearer token in any URL | done | The route reads `payload.auth({ headers })` (the `payload-token` cookie); the redirect target is a bare public path with an empty query, asserted in the spec; `admin.preview` puts only `slug` and `locale` in the entry URL. No env var, no token, no signing. |
| NFR-3 — draft content never reaches the ISR cache, the Redis translation cache, the sitemap or the feed; every preview response `private, no-store` and `noindex` | done | Next serves draft requests `private, no-cache, no-store, max-age=0, must-revalidate` by construction (`node_modules/next/dist/server/lib/cache-control.js`), observed as containing `private` and `no-store` on the preview navigation. Translation cache: previewing performs no write — the spec reads `translationStatus`, `translationUpdatedAt` and `_status` through `/api/reviews?…&draft=true` before and after a preview and asserts `toEqual` unchanged. Sitemap and feed both still omit the scheduled slug while previewing. |
| NFR-5 — existing surface stays green | done | 555 unit tests, 105 browser tests, typecheck and lint as tabulated. |
| FR-7 (admin list indicator, edit notice) | not started, by design | Phase 3 (`P3.T1`). |

### The shared predicate is untouched

`src/lib/publish-visibility.ts` was **not** edited. The draft branch deliberately
does not compose with it (a preview must ignore the gate); the public branch still
calls `publishedAndVisibleWhere(new Date())` exactly as before. Nothing in this
phase writes `revalidate` values.

## Files

| File | Kind |
| ---- | ---- |
| `src/app/(payload)/api/preview/route.ts` | new — entry |
| `src/app/(payload)/api/preview/exit/route.ts` | new — exit |
| `src/lib/preview.ts` | new — the decisions and paths (deviation, see below) |
| `src/lib/__tests__/preview.test.ts` | new — 12 unit cases |
| `src/components/reviews/PreviewBanner.tsx` | new — banner |
| `src/collections/Reviews.ts` | `admin.preview` |
| `src/app/(public)/[locale]/reviews/[slug]/page.tsx` | `loadReview`, draft metadata, banner |
| `src/lib/i18n/dictionary.ts` | four `preview*` keys in both locales |
| `playwright.config.ts` | `admin-draft-preview` project (deviation) |
| `e2e/admin/draft-preview.spec.ts` | new — four browser cases (deviation) |

Diff `2b1dfad..34c8681`: **10 files, +750 / −37**. `src/app/(public)/[locale]/layout.tsx`
was in `Touches` and was **not** modified: the banner is rendered by the review page
(where the state is known), and the root layout's default Open Graph image is already
overridden by the page's own metadata object.

Commits, one per task plus one test-only follow-up:

| Commit | Task |
| ------ | ---- |
| `66b36b5` `feat(preview): add the draft-preview entry and exit` | P2.T1 |
| `e4c323a` `feat(reviews): render the newest version on the public route in draft mode` | P2.T2 |
| `f84cf45` `feat(preview): mark a previewed page as one in both languages` | P2.T3 |
| `34c8681` `test(preview): serialise the draft-preview cases over the shared fixture admin` | fold-in fix (see Notes) |

## Deviations

| File | Reason |
| ---- | ------ |
| `src/lib/preview.ts` | Outside `Touches`. The entry route, the page, the banner and the unit tests all need the same definitions (`canRenderDraft`, `reviewPath`, `otherLocale`, `isSameOriginPath`, `buildPreviewMetadata`). Putting them in the page would make them untestable and would duplicate the path rule in the route; duplicating them in both files is exactly the drift the shared visibility predicate exists to prevent. The module has no I/O, no payload client, and only a type-level `next` import. |
| `playwright.config.ts` | Pre-authorised. Adds the fifth chained admin project `admin-draft-preview` (`testMatch: "**/admin/draft-preview.spec.ts"`, `dependencies: ["admin-locale-preference"]`), because the flow needs an authenticated browser and the admin chain shares fixture state. The `chromium` project keeps `testIgnore: "**/admin/**"`. |
| `e2e/admin/draft-preview.spec.ts` | Pre-authorised. New spec, four cases. |

## Notes

### The risk that decided this phase, measured

The brief's central risk was that reading the session inside the page turns both
review detail routes from pre-rendered into dynamic. It did not. From this phase's
`bun run test:e2e` build:

```
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

`●` is SSG, `ƒ` is dynamic. `/[locale]/reviews/[slug]` is **`●`** with
`[+5 more paths]`, i.e. **8 pre-rendered paths** = 4 publicly visible fixture reviews
× 2 locales — exactly what `generateStaticParams` produced in Phase 1, with the
scheduled review still excluded. `ƒ /[locale]/reviews` (browse) is the pre-existing
shape of that route, which reads filter search parameters; no file on it was touched.
The two new `ƒ` entries are the two route handlers, which is what route handlers are.

**No bisect was needed or run.** The conditional never reached the dynamic bailout, so
bisecting `draftMode()` → `headers()` → `payload.auth` would have had nothing to
attribute. The mechanism, read from `node_modules/next/dist/server/request/draft-mode.js`
rather than assumed: `draftMode()` in a `prerender` work unit returns an empty draft
mode whose `isEnabled` getter is `false`, and **reading `isEnabled` does not call any
dynamic-tracking function** — only `enable()`/`disable()` (which this phase never calls
from the page) go through `trackDynamicDraftMode`. `headers()`, `payload.auth` and the
`draft: true` read are all inside `if (previewing)`, which is false during the static
render.

### The observed `Cache-Control`, and one honest gap

The spec asserts, on the browser navigation to the previewed document, that
`cache-control` **contains `private`** and **contains `no-store`** — both observed
true. The literal full header was not printed by the suite, so the exact string is
quoted from the version's own constant rather than from the wire:
`node_modules/next/dist/server/lib/cache-control.js` returns
`private, no-cache, no-store, max-age=0, must-revalidate`, which is the value
`base-server.js` sets for a draft request. This phase wrote **no** `Cache-Control`
code; if Phase 3 wants the literal on the wire, tightening that one assertion to
`toBe("private, no-cache, no-store, max-age=0, must-revalidate")` is the cheap way to
pin it.

### AC-2's halves

- **Proved here:** a published review whose `publishAt` is in the future renders in
  draft mode and 404s outside, in both locales (browser, `e2e-fixture-the-slow-orbit`).
- **Left to Phase 3:** a review whose `_status` is `draft` and which has never been
  published. No fixture review is in that state today, so creating one is
  `P3.T2.1`'s job; the code path is the same `draft: true` read with no `_status`
  filter, but it is unproven until a draft fixture exists.

### What was learned that the brief did not anticipate

1. **`NextResponse.json(body, { status })` does not type-check in this Next version**
   (`'status' does not exist in type 'ResponseInit'`). The entry and exit routes use
   plain `Response.json(…)` for errors, which is also what `bulk-retranslate` does.
2. **`NextResponse.redirect` defaults to 307**, which would replay the exit `POST`
   against a page route. The exit route passes `303` explicitly.
3. **The redirect `Location` is absolute**, not root-relative: the entry route builds
   it with `new URL(path, request.url)`. The spec therefore asserts the parsed
   `pathname` and that `search` is empty, not the raw header string.
4. **A route handler is a fine exit**: the Next guide's "a Server Action or a POST
   Route Handler" both work, and the POST route handler keeps the banner a pure
   server component with no client JavaScript and no hydration dependency for the
   exit to work.
5. **The Open Graph suppression detail matters**: `openGraph.images: []` is required.
   Omitting the key is *not* enough — `mergeStaticMetadata` only skips the file
   convention when the page metadata owns an `images` property.
6. **The new spec was flaky under `fullyParallel`**, and that is an observation about
   the harness, not about the feature. The four cases log in as the same fixture
   admin; under 3 workers the entry navigation intermittently reached the route
   handler without the session cookie and read back the 401 branch (1 pass, 1 fail on
   the identical tree, both with `105 passed` / `104 passed 1 failed`). Serialising
   the four cases (`test.describe.configure({ mode: "serial" })`, commit `34c8681`)
   is what the admin chain already does for surfaces that share fixture state, and
   the suite has passed on every run since — including this phase's final chain and
   the run immediately before it.
7. Nothing observed contradicts the Next 16.4.2 documentation the brief pointed at:
   `draftMode()` is async, a new bypass cookie value is generated per build, and the
   `private, no-store` policy is Next's, not ours.

### Residual risks

- The never-published draft half of AC-2 rests on Phase 3's fixture.
- The exit route accepts a `returnTo` from a form body; `isSameOriginPath` rejects
  protocol-relative and absolute targets, but a *path* is honoured as given (a
  same-site path is not an open redirect). The banner only ever sends the current
  review path.
- `payload.auth` is called once per preview request, and once more by the entry
  route; neither is on the public path.

## Primary verification

Re-run by the primary on this tree, after the phase reported.

| Command | Exit | Result |
| ------- | ---- | ------ |
| `bun run typecheck` | 0 | `✓ No type errors in 241 files [1.93s]` |
| `bun run lint` | 0 | `Checked 231 files in 459ms. No fixes applied.` |
| `bun test` | 0 | **555 pass, 0 fail**, 45 files |
| `bun run test:e2e` | 0 | **105 passed (3.5m)**, 0 failed, 0 skipped |
| configured phase command | 0 | all four above |

The four new cases passed by name in my run, not only in the phase's:
`refuses the entry without a session and leaves the review hidden` (494 ms),
`previews the scheduled review, switches locale in preview and exits` (5.4 s),
`previews a published review and exits back to it` (3.6 s), and
`writes no translation state and lists nothing while previewing` (3.6 s).

**Diff against `Touches`.** `2b1dfad..HEAD` is 11 paths: the ten the phase lists
plus the evidence file. Every path is inside `Touches` —
`src/app/(payload)/api/preview/**`, the review page, `src/collections/Reviews.ts`,
`src/lib/i18n/dictionary.ts`, `src/components/reviews/PreviewBanner.tsx`,
`src/lib/__tests__/**` — or one of the three reported deviations
(`src/lib/preview.ts`, `playwright.config.ts`, `e2e/admin/draft-preview.spec.ts`).
No unreported file. Four commits, none a merge or a user commit.
`src/app/(public)/[locale]/layout.tsx` was in `Touches` and needed no change.

**Checked in the code, not the report.**

1. `src/lib/preview.ts` keeps the rule a pure function of two booleans and imports
   nothing but a type from `next`, so the decision cannot drift between the entry
   route, the page and the banner. `canRenderDraft` requires both halves, which is
   the `__prerender_bypass`-outlives-logout case.
2. The entry route returns 401 **before** `draftMode().enable()`, so a refused
   request cannot mint a cookie it could reuse — and the spec asserts the absence of
   `set-cookie` rather than trusting the status code. The draft lookup runs
   `overrideAccess: false` with the authenticated `user`, so preview authority is
   the document's own access rule, not "any signed-in user sees anything".
3. The exit is `POST` with `303`, honours `returnTo` only through
   `isSameOriginPath`, and the banner submits a plain form — so the exit works
   before hydration and no crawler following a link can end a preview.
4. `openGraph.images: []` is load-bearing rather than cosmetic: Next only skips the
   route's `opengraph-image.tsx` file convention when the page metadata owns an
   `images` property. Omitting the key would have shipped an Open Graph image on a
   preview page while the unit test still passed.
5. The page reads `draftMode()` first and the session only inside that branch. I
   confirmed the consequence in my own build's route table, not the phase's:
   `/[locale]/reviews/[slug]` lists three paths and `[+5 more paths]` — **8
   pre-rendered paths, 4 visible reviews × 2 locales**, the same set Phase 1
   produced. `ƒ /[locale]/reviews` is the browse route's pre-existing shape (it
   reads filter parameters) and no file on it was touched. The only new `ƒ` entries
   are the two route handlers.
6. The spec proves the authority is *gone* after Exit rather than merely hidden:
   the banner is gone **and** the same URL answers 404 to the same client.

**One correction made by the primary.** The spec's docblock cited `NFR-9`, a
requirement this spec does not have; it meant `NFR-3` (draft content never reaches
the caches, the sitemap or a feed). One-word comment fix, no behaviour change.

**Residual risks, recorded rather than papered over.**

- AC-2's never-published half is unproven until Phase 3 adds a `_status: draft`
  fixture. The code path is the same `draft: true` read with no status filter, but
  "the same code path" is an argument, not evidence.
- The `Cache-Control` assertion checks for `private` and `no-store` substrings, not
  the literal header. The literal is Next's own constant; Phase 3 can pin it.
- Previewing any review an author can *read* is allowed by that author's access
  rule. Access to preview therefore follows the collection's access policy rather
  than being narrowed to the author's own documents; worth a reviewer's opinion,
  not a rework.

Squashed the phase into one commit.
