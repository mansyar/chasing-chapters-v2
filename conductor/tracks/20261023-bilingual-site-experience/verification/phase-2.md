# Phase 2 verification — bilingual site experience

| | |
|---|---|
| Track | `20261023-bilingual-site-experience` |
| Phase | 2 — interface dictionary and language control |
| Date | 2026-10-23 |
| Branch | `feat/20261023-bilingual-site-experience` |
| Base | `56d87eea116bed9ef656864112e31d062fdd716b` |
| Head | `db3d9b5` |
| Result | **verified** |

## Commands

The exact phase command from the brief:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e
```

| Command | Exit | Numbers |
|---|---|---|
| `bun run typecheck` (`bun check`) | 0 | no type errors in **214 files** (1.3 s) |
| `bun run lint` (`biome check .`) | 0 | **209 files** checked, no fixes applied |
| `bun test` | 0 | **476 pass / 0 fail**, 1074 `expect()` calls, **38 files** (3.45 s) |
| `bun run test:e2e` | 0 | **57 passed / 0 failed / 0 skipped** (2.7 m), 3 workers, production standalone build on :3100 |
| whole chain | 0 | — |

The unit output still carries the known failure-path noise (`[Translation]`, `[TranslationLock]`,
one Redis `connection refused`, `[Revalidation] ... static generation store missing` during the
e2e seed). All of it is pre-existing expected behaviour: those tests assert the fallback paths.

Build route table from this run (unchanged from Phase 1 — see the notes on the 404):

```
○ /_not-found
● /en  ● /id                            (1m)
● /en/about  ● /id/about
● /en/reading-lists  ● /id/reading-lists
● /en/reading-lists/<slug>  ● /id/reading-lists/<slug>
● /en/reviews/<slug> (+5 more paths)  ● /id/reviews/<slug>
ƒ /[locale]/reviews
ƒ /[locale]/*/opengraph-image-*
○ /feed.xml  ○ /robots.txt  ƒ /sitemap.xml  ƒ Proxy
```

## Acceptance criteria

| AC | Claim | Evidence |
|---|---|---|
| **AC-2** | Toggling then visiting `/` lands on the toggled locale; the cookie survives the session; a direct `/id/...` visit does not change the preference | `e2e/locale-routing.spec.ts` — "the language control remembers the choice across a reload": click ID on `/en/reviews/<slug>?sort=title`, cookie `NEXT_LOCALE=id` with `sameSite=Lax` and an expiry > 24 h, reload `/en/about`, cookie still `id`, then `/about` redirects to `/id/about`. "a direct Indonesian URL leaves the stored preference alone": cookie seeded `en`, `/id/about` renders `Tentang Chasing Chapters`, cookie still `en`. `LanguageToggle` writes the cookie only on click; no server render writes it (`grep` for `LOCALE_COOKIE_NAME` shows writes only in `LanguageToggle`, reads only in the proxy). |
| **AC-3** | `/en/reviews?sort=title&page=2` → `/id/reviews?sort=title&page=2` | Path building is `localeSwitchHref(pathname, locale, search)` in `src/lib/i18n/locale.ts`: `localizePath` swaps the segment, the query is re-appended verbatim, `""`/`"?"` leave no dangling `?`. Unit-tested in `locale.test.ts` (`sort=title&page=2`, `?q=dune`, slug and depth preservation); browser-tested by the existing "keeps the rest of the URL" spec, which asserts the pathname and `sort=title` survive the ID click. |
| **AC-4** | Every public page renders Indonesian interface text; the two dictionaries expose identical key sets | `dictionary.ts`: `en` object literal `as const`, `DictionaryKey = keyof typeof en`, `id: Dictionary` (compile-time parity). `dictionary.test.ts` compares sorted key sets at runtime, asserts every dictionary is non-empty, no blank Indonesian value, and that the locales genuinely differ. `dictionary-source.test.ts` scans `src/app/(public)` + `src/components` (admin and OG excluded, comments stripped) for the ~70 literals this phase moved, in JSX text nodes and `placeholder`/`aria-label`/`title`/`alt`; it fails if any survives. Browser side: `/id/about` and the `/id` pages render dictionary text in the new persistence spec. |

## What changed

**P2.T1 — typed dictionary (commit `ebb8198`)**

- `src/lib/i18n/dictionary.ts`: flat key space (~140 camelCase keys, grouped by comment sections),
  `en as const` → `DictionaryKey` → `id: Record<DictionaryKey, string>`, `getDictionary(locale)`
  normalising through the one `normalizeLocale`.
- `src/lib/i18n/format.ts`: `formatMessage(template, values)` split out so client components can
  interpolate without importing the dictionaries.
- `src/lib/i18n/locale.ts`: new pure `localeSwitchHref(pathname, locale, search)`.
- `src/lib/i18n/__tests__/dictionary.test.ts`: parity, fallback, formatting.
- `src/lib/i18n/__tests__/dictionary-source.test.ts`: the AC-4 source scan plus a
  "no client component imports the server dictionary" guard (type-only imports allowed).

**P2.T2 — interface copy (commit `7e87795`)**

- Shell: `Navbar` (links, search field, mobile menu, search aria-labels, locale-aware search
  target), `Footer`, skip link, `mode-toggle`, plus `LanguageToggle` mounted in the navbar so every
  public page has it.
- Pages: home, review browse (headings, search placeholder, genre/tag filters, sort labels, filter
  summary, empty state, pagination), review detail (hero byline, panels, quotes, tags/mood/reading
  log, related reviews), reading lists (both), About (whole prose), comments (form, list, section
  loading/empty), `ui/pagination` (labels now props instead of literals).
- Every client component receives strings as props; nothing imports `dictionary.ts` at runtime from
  a client file.

**P2.T2 — pre-rendering fix (commit `db3d9b5`)**

- `src/app/not-found.tsx`: dictionary-driven but statically rendered in English (see notes).

**P2.T3 — control behaviour (commits `084be0c`, and the toggle itself in `7e87795`)**

- `LanguageToggle`: `role="group"` + dictionary group name, `aria-pressed` per option, `lang` on
  each button, visible `title` with the full language name, focus-visible ring, active pill plus
  ring and text weight (not colour alone). `useSearchParams` retained because the query must
  survive (`?sort=`, `?page=`, `?q=`); it did not force any page dynamic — the review detail route
  is still pre-rendered.
- `e2e/locale-routing.spec.ts`: two new specs (preference survives across navigation/reload;
  a direct `/id/...` does not overwrite it).

## Deviations

None. Every changed path is inside the brief's `Touches`
(`src/lib/i18n/**`, `src/components/**`, `src/app/(public)/**`, `src/app/not-found.tsx`, `e2e/**`).

## Notes for the primary

1. **The root 404 stays English — this is the note-8 finding, and it was earned twice over.**
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`
   (Reference → Props) says `not-found.js`/`global-not-found.js` **accept no props**, so a
   segment-level `[locale]/not-found.tsx` could not read `params` either. The only remaining signal
   was the locale cookie. Reading it (`await cookies()` in the root boundary) did work at runtime —
   but it made **every** `[locale]` route render on demand: the build flipped `● /en`, `● /en/about`,
   `● /en/reading-lists`, `● /en/reviews/<slug>` and their `id` twins to `ƒ`. A root `not-found`
   boundary belongs to each route's tree, so the dynamic API recursed through all of them. That
   breaks NFR-2/FR-12, so the trade was refused: `not-found.tsx` now uses
   `getDictionary(DEFAULT_LOCALE)` — dictionary-sourced, no cookie read, route table back to
   Phase 1's `●`. **Debt for Phase 3/5:** a genuinely localized 404 needs either a locale signal
   that survives prerendering or an explicit decision to serve 404 dynamically; Phase 3 owns
   `global-not-found`/metadata, which is the natural place to settle it.
2. **Two language controls on a review page.** `LanguageToggle` now lives in the navbar (FR-3: every
   public page) and the review-detail hero still renders one, because `review-detail.spec.ts` uses
   it and the hero is a natural place for it. Both are the same component and both work; the e2e
   specs disambiguate with `.first()`. If the duplication is unwanted it is a Phase 5 sweep
   decision, not a bug.
3. **Client bundle (note 11).** No dictionary module reaches the client: `dictionary.ts` is imported
   only by server components and by tests; client components take `dictionary: Dictionary` as a
   *prop* with `import type`, and interpolation comes from `format.ts`, which holds one regex and no
   copy. That is enforced, not just intended — `dictionary-source.test.ts` fails the suite if any
   file containing `"use client"` gains a **value** import of `@/lib/i18n/dictionary` (type-only
   imports are allowed). I did not measure chunk bytes; the structural guarantee is the stronger
   and cheaper check, and the build printed no new client chunk names.
4. **`RelatedReviews` still does not pass `locale` to its `payload.find`.** The heading and body now
   come from the dictionary, but the related reviews it selects are fetched without a locale, so
   after Phase 4 they would come back in the default locale. It is a content-resolution gap, not an
   interface one, so Phase 4 should add `locale` there with the rest of the content work.
5. **`metadata` left alone.** Page `metadata` objects, `generateMetadata`, `generateItemListSchema`
   names ("Book Reviews", "Reading Lists"), the OG image strings and the breadcrumb `name` arrays are
   untouched — Phase 3. Some of them still contain literals that appear in `MOVED_STRINGS`; the
   source scan deliberately reads JSX text nodes and user-facing attributes only, so `metadata`
   objects do not trip it.
6. **Content is untouched** (genres, tags, mood tags, reading-list and review titles/bodies) as
   instructed — Phase 4.
7. **Sub-task granularity.** The commits are task-level rather than sub-task-level: dictionary +
   tests, interface copy, pre-render fix, browser proof.

## Primary verification

Independently re-run by the primary on `56d87ee..HEAD` before accepting the phase.

| Command | Exit | Result |
|---|---|---|
| `bun run typecheck` | 0 | `No type errors in 214 files` |
| `bun run lint` | 0 | `Checked 209 files in 305ms. No fixes applied.` |
| `bun test` | 0 | **476 pass / 0 fail**, 38 files |
| `bun run test:e2e` | 0 | **57 passed (3.2m)**, 0 failed, 0 skipped |
| configured phase command | 0 | `bun run typecheck && bun run lint && bun test && bun run test:e2e` |

The diff `56d87ee..HEAD` is 33 paths, all inside the phase's Touches (`src/lib/i18n/**`,
`src/components/**`, `src/app/(public)/**`, `src/app/not-found.tsx`, `e2e/**`) plus the evidence file.
No unreported file, and the phase reported no deviations.

Checked in the code rather than accepted on report:

- **AC-4 is a real guard.** `dictionary-source.test.ts` first asserts the scan matched more than 20
  files, so a broken path or glob fails loudly instead of passing vacuously; it strips comments,
  extracts JSX text nodes and the `placeholder`/`aria-label`/`title`/`alt` attributes only, and
  checks roughly 70 strings this phase moved. A separate case asserts no `"use client"` file
  value-imports `@/lib/i18n/dictionary`, which is the NFR-2 claim.
- **FR-2 holds by construction.** `LOCALE_COOKIE_NAME` has exactly one write site
  (`LanguageToggle.selectLocale`) and one read site (`src/proxy.ts`), so following a shared `/id/...`
  link cannot rewrite a reader's preference. The toggle carries `?q=`/`?sort=`/`?page=` through
  `localeSwitchHref`, and marks the active option with `aria-pressed`, `lang`, a group label and a
  weight+ring treatment rather than colour alone.
- **The 404 trade-off is sound, and its citation is accurate.** `not-found.md` → Reference → Props
  states `not-found.js` and `global-not-found.js` components accept no props, so a segment-level
  `[locale]/not-found.tsx` could not read `params` either. Reading the locale cookie there made every
  `[locale]` route render on demand, which would have cost FR-12 and the pre-rendered pages, so
  refusing the trade was correct. The page still renders a valid `<html lang="en">` document with
  navbar and footer, and its copy comes from the dictionary, so it localizes as soon as a locale
  signal can reach that boundary. Recorded as debt, not as a deviation.
- **Route table unchanged from Phase 1** — `● /en`, `● /id` and the pre-rendered detail routes are
  still static after the copy migration; no page became dynamic.

Accepted. Squashed `ebb8198..128271d` into one phase commit.
