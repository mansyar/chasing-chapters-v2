# Phase 2 — Structured sections tokenized

- **Track:** 20261026-content-typography — Content Typography & Reading Experience
- **Phase:** 2
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base commit:** `26712e4` (`26712e46df0744878ddbd302bdfba3cd1163df7e`)
- **Head commit:** `1e5801f` (`1e5801f8106ee3d68ad25d3d93022798e2e2d951`)
- **Result:** verified

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 259 files |
| static | `bun run lint` | 0 | Biome clean (chain continued) |
| unit | `bun test` | 0 | 774 pass, 0 fail across 55 files |
| e2e | `bun run test:e2e` | 0 | 112 passed (1.9m), production build + Playwright |

All four ran as the single chain the plan specifies:
`bun run typecheck && bun run lint && bun test && bun run test:e2e`. The e2e
build emitted the two pre-existing `google-gax` module warnings and the
"static generation store missing" revalidation log noise from the seeding
script — both pre-existing behaviour, not from this phase.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-2 | A source-level test asserts no hardcoded Tailwind palette colour classes remain in the review detail page's structured sections | `src/lib/__tests__/typography-source.test.ts` — `structured section tokens` describe (4 tests); part of the 774 passing | pass |

FR-3 is covered by the token work itself (below) plus the badge fix.

## Token definitions chosen

Three semantic base tokens — `positive`, `warning`, `info` — deliberately not
content-coupled (they describe intent, not "What I Loved"), defined in
`globals.css` and exposed through `@theme inline` so `bg-positive`,
`border-positive`, `text-positive` (and any other colour utility) generate.

| Token | `:root` (light) | `.dark` (dark) | Maps to |
| --- | --- | --- | --- |
| `--positive` | `oklch(0.45 0.1 155)` | `oklch(0.8 0.11 155)` | What I Loved (green hue family) |
| `--warning` | `oklch(0.5 0.12 60)` | `oklch(0.8 0.12 60)` | Could Be Better (amber-orange hue family) |
| `--info` | `oklch(0.45 0.1 250)` | `oklch(0.8 0.11 250)` | Perfect For (blue hue family) |

**Design:** one base token per mood. The base step *is* the heading-text
colour; backgrounds and borders derive from it with Tailwind v4 alpha
modifiers (`bg-positive/10`, `border-positive/30`), which Tailwind compiles to
`color-mix()` against the resolved token value. Every role is single-sourced
and the `.dark` values are picked for the dark background rather than
inherited: in light mode the base is dark (heading text on the near-white
page), in dark mode it is light (heading text on the `oklch(0.15)` dark
background), and the same `/10` `/30` modifiers tint the panel in the
opposite direction around each mode's background.

**oklch derivation, not Tailwind hexes:** the site's existing token set runs
roughly lightness 0.15–0.99 and chroma 0.005–0.25 (`--primary` teal
`oklch(0.6 0.118 184.704)`, charts at chroma 0.07–0.26). The hues sit in the
same neighbourhoods the site already touches (green 155 vs chart-2 dark's
162; amber 60 between chart-1's 41 and chart-4/5's 70/84; blue 250 between
chart-3's 227 and chart-1 dark's 264), with chroma held at 0.1–0.12 — well
inside the range, and visibly muted compared to Tailwind's 0.15–0.25
palette chroma so the sections read as part of the site rather than as
imported swatches. Lightness 0.45–0.5 in light mode matches the previous
heading treatment (green-800/orange-800/blue-800 are all oklch L ≈ 0.38–0.51)
and 0.8 in dark mode matches the previous light-300 headings (L ≈ 0.87)
while staying clearly separated from the dark background.

**Contrast in dark mode (judged from the values, not measured):** dark
heading at L 0.8 over a panel tinted from an L 0.15 background is a large
lightness gap, comfortably past the previous green-300-on-green-950
treatment; light-mode headings at L 0.45–0.5 over a near-white tint match the
previous accepted pairing. Contrast on the section body text is unchanged —
the inner `prose prose-sm prose-teal dark:prose-invert` divs still carry
`--foreground`-driven colours from Phase 1.

## Markup changes

The three structured sections in
`src/app/(public)/[locale]/reviews/[slug]/page.tsx`:

- What I Loved: `bg-positive/10 p-6 rounded-xl border border-positive/30`,
  heading `text-positive`.
- Could Be Better: the `warning` equivalents.
- Perfect For: the `info` equivalents, `md:col-span-2` preserved.

Layout (`p-6 rounded-xl`), the heading treatment
(`font-serif text-xl font-bold mb-4 flex items-center gap-2`), the inner
`prose prose-sm prose-teal dark:prose-invert` divs, the copy and the
`RichText` rendering are untouched.

## Mood badge fix

The hex-append trick (`mood.color + "20"` / `+ "40"`) produced a valid colour
only for 6-digit hex. Replaced with format-safe `color-mix()`:

- background: `color-mix(in srgb, ${mood.color} 12.5%, transparent)`
  — old `20` hex suffix = 32/255 ≈ 12.5% alpha, matched.
- border: `color-mix(in srgb, ${mood.color} 25%, transparent)`
  — old `40` hex suffix = 64/255 ≈ 25% alpha, matched.
- text: keeps the full `mood.color`.

Mixing with `transparent` in `srgb` reduces the alpha channel
proportionally, so the rendered weight is the same as the old suffixes for
today's hex colours and stays valid for any future colour format.

## Source test coverage

`src/lib/__tests__/typography-source.test.ts` gained two describes:

- `structured section tokens` — slices the page source between the
  `{/* Structured Sections */}` and `{/* Favorite Quotes */}` markers and
  asserts (a) no `bg-green-`/`bg-orange-`/`bg-blue-`/`border-*-`/`text-*-`
  palette classes remain (the substrings also match the `dark:` variants),
  (b) `bg-*/10`, `border-*/30` and `text-*` semantic utilities are present
  for all three tokens, (c) `md:col-span-2` survives, (d) `globals.css`
  defines `--color-<token>: var(--<token>)` and both modes' `oklch` values.
- `mood badge colour safety` — asserts the `+ "20"` / `+ "40"` hex-append
  pattern is gone and both `color-mix(in srgb, ${mood.color} ...)` weights
  are present.

## Evidence paths

- This report: `conductor/tracks/20261026-content-typography/verification/phase-2.md`
- Full verification log:
  `C:\Users\Ansyar\.local\share\opencode\shell\8ae539429bd40b66df5ea77da29b3d1efcef9f22\sh_177775226001rCuiGfHQmVBjOR.out`

## Deviations

- `src/app/globals.css` was added to Touches by the primary (recorded in the
  phase brief); no further deviation.
- None beyond that: all changes are inside the Touches list.

## Notes

- Rendered contrast is judged from the token values, not measured in a
  browser: the light/dark token pairs were chosen to match the lightness
  relationships of the previously accepted palette pairings. A visual pass in
  both modes is the review's call if wanted.
- The dark-mode panel tint now lightens the dark background slightly (a light
  token at 10% alpha) where the old `green-950/20` darkened it; both are
  subtle washes and the three-colour rhythm is preserved. If the primary or
  review prefers a darkening tint in dark mode, that is a one-line token
  change (add a second dark step), not a markup change.
- The e2e suite exercises the review detail page's structured sections
  (`should display the structured review sections`) and passed.
- Husky pre-commit (bun check + biome + bun test) ran clean on the commit.
