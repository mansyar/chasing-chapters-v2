# Phase 3 Verification — Shared StarRating

- **Track:** 20261026-content-typography — Content Typography & Reading Experience
- **Phase:** 3 — Shared StarRating (FR-4, AC-3)
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base commit:** `c7796be43f27ac4c5317e7eafe0b8c96212ad438`
- **Head commit:** `396c95f08737fcee3cae89a5d0ae131327d9a1a9`
- **Result:** ✅ **Verified** — all four verification layers exit 0.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Targeted (pre-check) | `bun test src/components/reviews/__tests__/StarRating.test.ts` | 0 | 15 pass / 0 fail, 469 ms |
| Typecheck | `bun run typecheck` (via full chain) | 0 | No type errors in 261 files |
| Lint | `bun run lint` (via full chain) | 0 | Biome checked 254 files, no fixes needed |
| Unit tests | `bun test` (via full chain) | 0 | 789 pass / 0 fail |
| E2E | `bun run test:e2e` (via full chain) | 0 | 112 Playwright tests passed (2.1 m) against the production build on the `_e2e` database |

Verification command run exactly as written in the brief, as one chain:
`bun run typecheck && bun run lint && bun test && bun run test:e2e`

(The Redis / translation "errors" in the log are expected test fixtures —
fallback-behaviour tests that assert on their own failure paths. The build's
`google-gax` module warning is pre-existing and unrelated.)

## Acceptance criteria

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC-3 / FR-4 | One shared read-only `StarRating` replaces all four inline renderers | `StarRating.test.ts` "call sites" block asserts each of the four files imports `reviews/StarRating`; typecheck proves no other star renderer remains (the inline `Star` imports were deleted) | ✅ |
| AC-3 | Size variants covered | Tests render sm/md/lg and assert the exact wrapper gap and star size classes | ✅ |
| AC-3 | Full and empty rendering at 5 and 1 (and 3) | Tests count `fill-primary` (5/1/3) and `text-muted-foreground/30` occurrences in real markup | ✅ |
| AC-3 | Accessible label | Tests assert `sr-only` markup containing `Rated 4 out of 5` (en template) and `Dinilai 2 dari 5` (id template) | ✅ |
| NFR-1 | No new `"use client"` | Test asserts the StarRating source contains no `"use client"`; typecheck/lint pass | ✅ |
| NFR-4 | No new dependency | `react-dom` was already a project dependency (react-dom 19.3.0); package.json untouched | ✅ |
| NFR-5 | Existing tests pass, none deleted or weakened | `bun test` 789 pass / 0 fail (previous suites unchanged) | ✅ |

## Component API

**`src/components/reviews/StarRating.tsx`** — a read-only presentational component
(no `"use client"`, no hooks, no event handlers; safe in both server and client
trees).

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `rating` | `number` | required | The 0–5 rating to display |
| `labelTemplate` | `string` | required | A localized `{rating}` template (the dictionary value), interpolated by the component |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Visual variant |
| `className` | `string` | — | Extra classes on the wrapper (none used by the four call sites) |

**Sizes** (exact visual classes carried over from the former renderers):

| Size | Wrapper | Star | Former renderer |
|---|---|---|---|
| `sm` | `flex gap-1` | `h-3.5 w-3.5` | ReviewCard |
| `md` | `flex gap-0.5` | `h-4 w-4` | FeaturedHero, ModernBookCarousel |
| `lg` | `flex gap-2` | `h-5 w-5` | Review detail page |

**Fill logic** — unchanged everywhere: filled `fill-primary text-primary`,
empty `text-muted-foreground/30`.

**Label mechanism** — the component imports `formatMessage` from
`@/lib/i18n/format` (client-safe, dictionary stays server-side) and renders
`<span className="sr-only">{formatMessage(labelTemplate, { rating })}</span>`
first, followed by five `aria-hidden="true"` `Star` icons. Callers pass
`dictionary.ratingLabel` as a prop; the component never imports the dictionary
itself. Star icons also render `aria-hidden` so the stars and the sr-only span
cannot be double-read.

**Out-of-range decision — clamp.** `rating` is clamped to `[0, 5]` via
`Math.min(5, Math.max(0, rating))` before rendering and before the label is
interpolated. Documented in the component's JSDoc: a rating outside the range
renders the nearest honest edge (0 or 5) and announces that same value — it
never silently renders nonsense such as six stars or a fractional count.

## Test technique

**Used: `react-dom/server`'s `renderToStaticMarkup`** (the brief's preferred
technique). `react-dom` imported fine under Bun — no fallback needed. The test
builds real elements with `createElement(StarRating, props)` and asserts on the
resulting HTML string.

What it proves:

- Real server render output, not source text: actual class names on the
  wrapper and icons, per-size gaps and icon dimensions.
- Fill/empty counts at ratings 5, 1, 3, and clamping at 9 and −2 (both the
  rendered star counts and the announced value).
- The accessible label exists, is interpolated with the real rating value, is
  `sr-only`, and honors whichever localized template it is given (both en and
  id templates exercised).
- Each of the four call sites imports the component (source assertion,
  `dictionary-source`-style, backed up by typecheck because `labelTemplate` is
  required).
- The component file carries no `"use client"` directive.

What it does not prove: pixel-level visual fidelity (Tailwind class strings are
asserted, not rendered CSS), real assistive-technology announcement behaviour,
and hydration — though the component is stateless and static so there is
nothing to hydrate. The existing e2e suite (112 tests, including the homepage
carousel and review-detail stars tests) covers the rendered pages end to end.

## Per-call-site changes

| Call site | Before | After | Size mapping |
|---|---|---|---|
| `src/components/FeaturedHero.tsx` (~59–71) | `div.flex.gap-0.5` + 5 `Star` `h-4 w-4` | `<StarRating rating labelTemplate size="md" />` (default) | md |
| `src/components/ModernBookCarousel.tsx` (~112–124) | identical to FeaturedHero | `<StarRating rating labelTemplate size="md" />` | md |
| `src/components/ReviewCard.tsx` (~51–63) | `div.flex.gap-1` + 5 `Star` `h-3.5 w-3.5` | `<StarRating rating labelTemplate size="sm" />` | sm |
| `src/app/(public)/[locale]/reviews/[slug]/page.tsx` (~246–257) | wrapper `flex items-center justify-center lg:justify-start gap-2 text-primary` + 5 `Star` `h-5 w-5` (`fill-current` inheriting wrapper colour) | wrapper keeps alignment classes; `<StarRating rating labelTemplate size="lg" />` | lg |

All four sites had no accessible announcement before; all four now announce the
localized "Rated N out of 5" / "Dinilai N dari 5".

**Detail-page wrapper decision (recorded per T2.2):** the wrapper's
`text-primary` class was dropped together with its `gap-2`. It was dead after
the swap — the component owns its own colours (`fill-primary text-primary`
explicitly rather than the old `fill-current` inheritance) and its own gap at
the `lg` size — and dropping it makes the component's ownership unambiguous.
Visually identical: the filled stars are the same `primary` colour either way.

## Files changed

- `src/components/reviews/StarRating.tsx` (new) — the component
- `src/components/reviews/__tests__/StarRating.test.ts` (new) — 15 tests
- `src/lib/i18n/dictionary.ts` — `ratingLabel` key in `en` and `id`
- `src/components/FeaturedHero.tsx` — swap to `StarRating` (md)
- `src/components/ModernBookCarousel.tsx` — swap to `StarRating` (md)
- `src/components/ReviewCard.tsx` — swap to `StarRating` (sm) + required `ratingLabel` prop
- `src/app/(public)/[locale]/reviews/[slug]/page.tsx` — swap to `StarRating` (lg)
- `src/app/(public)/[locale]/page.tsx` — pass `ratingLabel` to `ReviewCard`
- `src/app/(public)/[locale]/reviews/page.tsx` — pass `ratingLabel` to `ReviewCard`
- `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx` — pass `ratingLabel` to `ReviewCard`
- `src/components/reviews/RelatedReviews.tsx` — pass `ratingLabel` to `ReviewCard`

## Deviations

1. **`src/lib/i18n/dictionary.ts`** — expected deviation, authorized by the
   primary in the brief: the accessible label must be localized (a hardcoded
   English sr-only string on an Indonesian page would be an i18n defect), so
   the dictionary gained one key in both locales:
   `ratingLabel: "Rated {rating} out of 5"` (en) /
   `"Dinilai {rating} dari 5"` (id, typed over en — a missing key is a compile
   error).
2. **Four `ReviewCard` callers outside Touches** — making the label localized
   required a `ratingLabel: string` prop on `ReviewCard`, which is a required
   forward to `StarRating`. Every `ReviewCard` caller had to pass it:
   `src/app/(public)/[locale]/page.tsx`,
   `src/app/(public)/[locale]/reviews/page.tsx`,
   `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx`, and
   `src/components/reviews/RelatedReviews.tsx`. Each already held `dictionary`
   in scope; the change is one prop per call site
   (`ratingLabel={dictionary.ratingLabel}`) with no behavioural change. Not
   making the prop required would have silently left those cards unannounced
   to screen readers (an AC-3 defect), and making the StarRating label
   optional would have weakened the guarantee everywhere.
3. **Detail-page wrapper dropped `text-primary`** — a deliberate decision
   recorded above, not a drift.

No other files outside `Touches` were modified.

## Evidence paths

- This report: `conductor/tracks/20261026-content-typography/verification/phase-3.md`
- Full verification log: captured by the shell harness (`sh_1778588e3001KEJBM4w8GSbO4a.out`); key results are tabulated above
- Unit test file: `src/components/reviews/__tests__/StarRating.test.ts`

## Notes

- `FeaturedHero` and `ModernBookCarousel` are `"use client"` components; they
  render the server-safe `StarRating` without the StarRating file itself
  gaining a client directive (verified by test). `ModernBookCarousel` keeps its
  `cn` import (still used by the indicator dots); `FeaturedHero` no longer
  needed `cn` or `Star` and both imports were removed.
- The e2e suite already covered the star renderers indirectly —
  `homepage.spec.ts` "should server-render the featured carousel without
  hydration errors" and `review-detail.spec.ts` "should display rating stars" —
  and both still pass on the swapped implementation.
- The out-of-range clamp is the only behavioural addition; it is documented in
  the component JSDoc and pinned by two dedicated tests.
