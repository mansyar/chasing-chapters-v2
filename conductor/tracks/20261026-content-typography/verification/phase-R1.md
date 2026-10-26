# Phase R1 Verification - Review Fixes

- **Track:** `20261026-content-typography`
- **Phase:** R1 - Review Fixes
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base:** `b6dda6b0cd01ed3cca551e4c052ab02f725331ed`
- **Head:** `ab5f8a8` (last code commit; the verification command ran here with a
  clean tree. This file is added by `210bb75`, which changes no code.)

## 1. Result: PASS

All five review findings are fixed, and each fix is backed by an assertion that
was shown to fail on the code it replaced.

| Finding | Severity | Fixed in |
| --- | --- | --- |
| F1 - neighbours invented from `createdAt` | Medium | `9479600` |
| F2 - index under-declares its cover `sizes` | Medium | `935ff0d` |
| F3 - prose guard matches a bare substring | Low | `fe24cb6` |
| F4 - `StarRating` guard asserts only the import | Low | `ab5f8a8` |
| F5 - code blocks glare in dark mode | Low | `fe24cb6` |

No opportunistic refactor, no rename, no file outside the phase's `Touches` was
left modified.

## 2. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 265 files` |
| static | `bun run lint` | 0 | `Checked 258 files. No fixes applied.` |
| unit | `bun test` | 0 | 813 pass, 0 fail, 58 files |
| e2e | `bun run test:e2e` | 0 | 112 passed, 0 failed, 0 flaky |

The combined phase command
`bun run typecheck && bun run lint && bun test && bun run test:e2e` exits 0. It
was run once, at `ab5f8a8`, with a clean working tree.

The lint layer failed once before it passed, on formatting only: Biome wanted one
`expect(...).toContain(...)` call collapsed onto a single line in
`typography-source.test.ts`. Fixed by hand (one line, no `--write`), then lint
exited 0. One fix, inside the two-attempt budget.

The unit count moved 809 → 813, and the movement is accounted for exactly:

| File | Change | Delta |
| --- | --- | --- |
| `review-navigation.test.ts` | `falls back to createdAt ...` deleted | -1 |
| `review-navigation.test.ts` | `a review with no publishDate has no neighbours at all` added | +1 |
| `typography-source.test.ts` | `code blocks are a mode-stable pair, not an inverted one` added | +1 |
| `typography-source.test.ts` | `the guard matches a re-added prose class and ignores the word elsewhere` added | +1 |
| `typography-source.test.ts` | `reading-list cover sizes` - card forwards `sizes` | +1 |
| `typography-source.test.ts` | `reading-list cover sizes` - index declares its own width | +1 |

809 - 1 + 5 = 813. `typography-source.test.ts` goes from 9 to 13 tests and
`StarRating.test.ts` stays at 15: F4 renames the four existing call-site cases
and adds assertions inside them, so it adds no test and deletes none.

One thing written and then removed: a fifth `StarRating` case factoring the three
assertions into a `rendersStarRating(source)` helper, plus a case proving the
helper rejects an import with no element. It was a second abstraction around two
`toContain` calls, so the committed file asserts the three substrings directly in
the loop, which is what the brief asked for. The before/after evidence in section
4 therefore comes from the committed version, not the removed helper.

## 3. Findings

### F1 - Stop inventing neighbours from the wrong column (Medium)

**What was wrong.** `getAdjacentReviews` anchored on
`review.publishDate ?? review.createdAt`, then compared the **`publishDate`
column** against that anchor in both queries. For a review with a null
`publishDate` the anchor was a `createdAt` value, which is a different column's
value, so `publishDate > createdAt` matched essentially every published review
and `publishDate < createdAt` matched none. The doc comment three lines above
already said "a review with no slug or no date has no neighbours at all", and a
further paragraph said a null `publishDate` "does not participate". The code
contradicted its own contract, and the effect was a "Next review" link to an
arbitrary document on pre-back-fill rows.

**What changed.** `const anchor = review.publishDate;` - the `!slug || !anchor`
guard is unchanged, so a review with no `publishDate` returns
`{ newer: null, older: null }` before any query. `NavigationReview.createdAt` is
kept (it is on every document, and dropping it would be a change to the shape for
no reason) but is now documented as deliberately unread.

**The assertion that fails on revert.**
`review-navigation.test.ts` - `a review with no publishDate has no neighbours at
all` asserts `calls` has length 0 **and** the result is
`{ newer: null, older: null }`, with a `createdAt` present on the input so the
old fallback is exercised. Reverting only `review-navigation.ts` to the phase base
makes it fail:

```
error: expect(received).toHaveLength(expected)
Expected length: 0
Received length: 2
(fail) getAdjacentReviews > a review with no publishDate has no neighbours at all
 12 pass / 1 fail
```

The replaced test asserted the **shape of the query** the fallback produced
(`calls` length 2, and `createdAt`'s value inside the first `where`), so it
encoded the bug rather than catching it.

### F2 - Declare the index's own cover sizes (Medium)

**What was wrong.** `ReadingListCard` hardcoded
`sizes="(max-width: 768px) 50vw, 25vw"`, which describes the home page's grid
(`grid-cols-2 lg:grid-cols-4`). The reading-lists index renders
`grid gap-8 sm:grid-cols-2 lg:grid-cols-3` - **one** column below 640px - so on a
phone the browser was told the cover occupies half the viewport and picked a
candidate for half the width, then upscaled it. That is the NFR-2 regression the
review recorded: a soft, under-fetched LCP candidate on the surface with the most
covers.

**What changed.** `sizes?: string` added to `ReadingListCardProps`, defaulting to
the home-page string so the home page's call site is byte-identical in behaviour
(it passes nothing), and forwarded to `<Image sizes={sizes}>`. The index passes
`sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`, matching its
three breakpoints.

**The assertion that fails on revert.** `typography-source.test.ts` -
`describe("reading-list cover sizes")` asserts the prop exists, is forwarded, and
that the default is still the home-page string; the second test asserts the
index's own value. Reverting `ReadingListCard.tsx` alone fails the first:

```
error: expect(received).toContain(expected)
Expected to contain: "sizes?: string;"
(fail) reading-list cover sizes > the card forwards its `sizes` prop to the image
 12 pass / 1 fail
```

Reverting the index page alone fails the second:

```
Expected to contain: "sizes=\"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw\""
(fail) reading-list cover sizes > the index declares its own single-column mobile width
```

These are source assertions, not layout measurements - see section 7.

### F3 - Match the class position, not the bare substring (Low)

**What was wrong.** `expect(source).not.toContain("prose")` over three whole
files. Any use of the word failed the guard: a comment explaining *why* an
excerpt must not be prose, an identifier like `proseFree`, a future `prose-*`
token. A guard that fails on prose used as a word is a guard someone deletes, and
once deleted it stops protecting the thing it existed for.

**What changed.** Two patterns matched against the class attribute position:

```ts
const proseClassPatterns = [
	/className="[^"]*\bprose\b/,
	/className=\{`[^`]*\bprose\b/,
];
```

The second covers the template-literal form. Same three files, same intent. A
second test feeds the patterns three regressions and three innocent strings, so
the guard's own behaviour is asserted rather than assumed.

**The assertion that fails on revert.** Adding a real class to
`FeaturedHero.tsx` (`<div className="prose max-w-none line-clamp-3 ...">`) fails
the guard:

```
Expected substring or pattern: not /className="[^"]*\bprose\b/
(fail) typography plugin wiring > the clamped excerpts and the skeleton stay prose-free
 12 pass / 1 fail
```

And the false positive the fix removes is shown the other way: with the **old**
guard restored, a comment mentioning prose fails it:

```
Expected to not contain: "prose"
Received: "... {/* prose would break this clamped excerpt, so it stays plain */} ..."
(fail) typography plugin wiring > the clamped excerpts and the skeleton stay prose-free
 8 pass / 1 fail
```

The new guard passes that same file (13 pass, 0 fail) - which is the whole point
of F3.

### F4 - Assert the call site renders, not just imports (Low)

**What was wrong.** The `call sites` loop asserted only
`toContain("reviews/StarRating")`. A file that kept the import and stopped
rendering `<StarRating>` - exactly the regression a refactor produces - passed.
The doc comment justified the weakness on the grounds that a required
`labelTemplate` makes other consumers a type error, but typecheck cannot see a
call site that has no call at all.

**What changed.** Each of the four cases now also asserts `toContain("<StarRating")`
and `toContain("labelTemplate=")`, and the doc comment says why the import alone
is not enough.

**The assertion that fails on revert.** Removing the `<StarRating ... />` element
from `FeaturedHero.tsx`:

- with the **old** test: `15 pass, 0 fail` - the guard is blind to it;
- with the **new** test:

```
Expected to contain: "<StarRating"
(fail) StarRating > call sites > src/components/FeaturedHero.tsx renders StarRating with a labelTemplate
 14 pass / 1 fail
```

Both runs were made against the same edited `FeaturedHero.tsx`, differing only in
which version of the test file was in the tree.

### F5 - Pin code blocks to one mode-stable pair (Low)

**What was wrong.** `--tw-prose-pre-code: var(--background)` /
`--tw-prose-pre-bg: var(--foreground)`, mirrored in the invert set. That is a
deliberate inversion: in light mode it gives light text on a dark slab (fine); in
dark mode `--background` is near-black and `--foreground` is near-white, so the
slab became **a near-white block on a dark page** - a glare, and the brightest
thing on the review page.

**What changed.** `--tw-prose-pre-bg: var(--muted)` +
`--tw-prose-pre-code: var(--foreground)`, in both the base and the invert set.
This pair is mode-stable in the sense that matters: `--muted` and `--foreground`
are *each* redefined per mode to be the opposite of the other, so the block reads
dark-on-light in light mode and light-on-dark in dark mode. It never inverts into
a bright slab.

**Contrast, both modes.** Estimated from the tokens' own lightness values (not
measured in a browser):

| Mode | Text | Background | Reading |
| --- | --- | --- | --- |
| light | `--foreground` = `oklch(0.2 0.02 260)` | `--muted` = `oklch(0.94 0.01 90)` | dark on light grey, ~14:1 |
| dark | `--foreground` = `oklch(0.95 0.01 85)` | `--muted` = `oklch(0.25 0.02 260)` | light on dark grey, ~11:1 |

`--muted` was checked against the alternative the brief raised and kept: it is
`oklch(0.25)` in dark mode, *lighter* than the page's `--background`
(`oklch(0.15)`), so the block reads as a panel rather than a hole in the page -
the conventional dark-mode code block - while staying nowhere near the glare of
`--foreground` at `oklch(0.95)`. No other token was needed.

**The assertion that fails on revert.** `typography-source.test.ts` -
`code blocks are a mode-stable pair, not an inverted one` asserts the four new
declarations and rejects the four old ones. Reverting `globals.css` fails it:

```
Expected to contain: "--tw-prose-pre-bg: var(--muted);"
(fail) typography plugin wiring > code blocks are a mode-stable pair, not an inverted one
```

## 4. Before / after, by reverting to the phase base

Each fix was checked against `git checkout <phase-base> -- <path>` followed by
`git restore --staged <path>` after the run, so nothing was staged and the tree
returned to `ab5f8a8` clean. `git status --short` was empty afterwards.

| Finding | Path reverted | Test run | Before (base) | After (`ab5f8a8`) |
| --- | --- | --- | --- | --- |
| F1 | `src/lib/review-navigation.ts` | `review-navigation.test.ts` | `Expected length: 0 / Received length: 2`, 12 pass 1 fail | 13 pass, 0 fail |
| F2 | `src/components/ReadingListCard.tsx` | `typography-source.test.ts` | `Expected to contain: "sizes?: string;"`, 12 pass 1 fail | 13 pass, 0 fail |
| F2 | `src/app/(public)/[locale]/reading-lists/page.tsx` | `typography-source.test.ts` | `Expected to contain: sizes="(max-width: 640px) 100vw, ..."`, 11 pass 2 fail | 13 pass, 0 fail |
| F3 | `src/components/FeaturedHero.tsx` + a `prose` class | `typography-source.test.ts` | new guard: 12 pass 1 fail (fires); **old** guard on a prose *comment*: 8 pass 1 fail (false positive) | 13 pass, 0 fail |
| F4 | `src/components/FeaturedHero.tsx` + the `<StarRating>` element removed | `StarRating.test.ts` | old guard: 15 pass, 0 fail (blind); new guard: 14 pass 1 fail (fires) | 15 pass, 0 fail |
| F5 | `src/app/globals.css` | `typography-source.test.ts` | `Expected to contain: "--tw-prose-pre-bg: var(--muted);"` | 13 pass, 0 fail |

**F5 has no before/after in the review's sense** - it is a visual finding with no
earlier screenshot to compare against, and this phase has no browser screenshot
either. What is proven is the token pair in the source and the assertion that
pins it; what is not proven is what the block looks like. See section 7.

## 5. Files changed and commits

| Commit | Message | Files |
| --- | --- | --- |
| `9479600` | `fix(navigation): anchor neighbours on publishDate only` | `src/lib/review-navigation.ts`, `src/lib/__tests__/review-navigation.test.ts` |
| `935ff0d` | `fix(cards): let the reading-list index declare its own cover sizes` | `src/components/ReadingListCard.tsx`, `src/app/(public)/[locale]/reading-lists/page.tsx` |
| `fe24cb6` | `fix(typography): make code blocks one mode-stable pair` | `src/app/globals.css`, `src/lib/__tests__/typography-source.test.ts` |
| `ab5f8a8` | `test(ratings): assert each call site renders StarRating with a label` | `src/components/reviews/__tests__/StarRating.test.ts` |

All seven paths are inside the phase's `Touches`.

## 6. Deviations

| File | Reason |
| --- | --- |
| `src/lib/__tests__/typography-source.test.ts` | The plan gives R1.T2 (F2) two source tasks and no test task. Two tests were added there anyway, because F2's failure mode is invisible at runtime and the phase would otherwise ship an unguarded prop. The file is in `Touches` and the added block is namespaced in its own `describe`. |

No other deviation. `src/components/FeaturedHero.tsx` was edited **only** during
the before/after runs in section 4 and restored each time; it is not part of any
commit and is not in the diff against the phase base.

## 7. Notes - what is not proven

- **F5's appearance is not verified.** The pair is right in the source and pinned
  by a test, and the contrast figures in section 3 are computed from the tokens'
  lightness values. Nobody has looked at a rendered `pre` in either theme. The
  light-mode block also changed - it was dark text on a white slab, it is now dark
  text on a light-grey slab - which is a visible change the review did not ask
  for, arrived at because one pair has to serve both modes. If a reviewer wants
  the light-mode block to stay stark white, the fix is a per-mode override, not a
  different token.
- **F2's outcome is not measured.** The tests assert the prop and the two
  declarations; they do not assert which srcset candidate a browser picks. The
  under-fetch the review found was a real measurement on a phone; the fix is
  correct by construction (the `sizes` now matches the grid) but no Lighthouse run
  or device test confirms the recovery. Physical iPhone testing is a
  workflow-declared human-only exception and was not performed.
- **F1's fix is a behaviour change for pre-back-fill rows.** Those reviews now
  have no neighbours at all, where before they had a wrong one. That is what the
  doc comment promised, and the review asked for it, but it means a published
  review with a null `publishDate` shows no prev/next nav. `publishDate` is
  back-filled on publish, so this only reaches rows that predate the back-fill.
- **The e2e suite does not cover prev/next navigation.** It has no test for the
  neighbour links at all, so F1's fix rests on the unit test above. Nothing in
  this phase added e2e coverage for it - the finding was scoped to the helper.
- **No React render harness.** F4 remains a source assertion because the repo has
  no component-render harness; the future-track note in `review.md` still stands.
- **`StarRating` call-site test is four source files.** It proves each file
  contains an element with a `labelTemplate`, not that the element renders the
  right rating. That is the same class of check the review asked to strengthen,
  one level up.
