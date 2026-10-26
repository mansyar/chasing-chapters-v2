# Review: Content Typography & Reading Experience

- **Track:** `20261026-content-typography`
- **Type:** `feature`
- **Branch:** `feat/20261026-content-typography`
- **Range:** `bca3a8bd9abac8d41f065dbf1b204d1908c111b8..HEAD`
- **Date:** 2026-10-26
- **Verdict:** `PASS WITH FINDINGS`
- **Gate:** cleared - Phase R1 and its round-2 fixes are verified; all seven findings are fixed

> The header records the severity-based verdict: no Critical or High finding was
> raised, so the track is not blocked by severity. The gate records whether
> strict mode's no-deferral rule is satisfied, and it is not yet - five findings
> are open. They agree once Phase R1 is verified.

## Summary

**Round 3: the track is ready.** Every finding raised in any round is fixed and
verified - five in Phase R1 and two more in the round-2 delta. No Critical or High
finding was ever raised.

The track does what it promised. The eight `prose` usages that were inert because
the plugin was never installed now render through a token-themed typography map;
the three structured review sections and the mood badge use semantic colour tokens
instead of hardcoded Tailwind palette classes; one `StarRating` replaces four
copy-pasted renderers and announces the rating in the reader's language; both
detail pages carry a visible breadcrumb trail backed by the JSON-LD that already
existed, plus prev/next review navigation; and three card renderings collapsed onto
one shared base with the orphaned exports deleted.

Round 1 found two Medium defects the phases had missed, both in code written for
this track: the neighbour helper compared a `createdAt` value against the
`publishDate` column, so a review with no `publishDate` linked to an unrelated one;
and the reading-lists index inherited the home page's `sizes` attribute, so covers
were fetched at half the pixels they occupied on a phone. Round 2 found that two of
the round-1 fixes were themselves imperfect - the new prose guard did not understand
`className={cn(...)}`, the repo's dominant idiom, and the new `sizes` default
switched at the wrong breakpoint for the very grid it described. Both are fixed.

Two phases (4 and 5) were executed by the primary because the subagent pool ran out
of credits, so the implementer/verifier separation the workflow assumes did not hold
there. Both evidence files say so plainly, and the reviewer confirmed the recording
is honest rather than a retrofit.
## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | pass - 265 files | `verification/integrated.md` §3 |
| lint | `bun run lint` | pass - 258 files | `verification/integrated.md` §3 |
| unit | `bun test` | pass - 809 pass, 0 fail, 58 files | `verification/integrated.md` §3 |
| build | `bun run build` | pass (e2e database) | `verification/integrated.md` §5 |
| e2e | `bun run test:e2e` | pass - 112 passed, 0 failed, 0 flaky | `verification/integrated.md` §6 |
| targeted | five new/changed suites | pass - 56 pass, 0 fail, 141 expect | re-run by the reviewer |

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | `globals.css:4` (`@plugin`), `:207-244` (`@utility prose-teal`), `package.json:65` | `typography-source.test.ts:31-62` | covered |
| FR-2 | `globals.css:226-243` (18 invert variables), `:140-194` (`.dark` flip) | `typography-source.test.ts:44-62` + e2e dark-mode specs | covered |
| FR-3 | `reviews/[slug]/page.tsx:353-383`, `globals.css:42-44,108-115,166-171` | `typography-source.test.ts:98-137` | covered |
| FR-4 | `StarRating.tsx:54-82`; four call sites | `StarRating.test.ts:23-115` | covered |
| FR-5 | `Breadcrumbs.tsx:34-79`; both detail pages | `Breadcrumbs.test.ts` | covered |
| FR-6 | `review-navigation.ts:76` (anchor), `:78-80` (guard); `reviews/[slug]/page.tsx:214-220,503-540` | `review-navigation.test.ts:168-183` | covered |
| FR-7 | `card.tsx:14-26` (`CardLink`), both cards, index | source inspection + e2e rendering | covered |
| FR-8 | `card.tsx:84`; deleted `CardAction`/`CardDescription`/`readingListsNoImage` | grep returns no references | covered |
| FR-9 | `dictionary.ts` both locales | `dictionary.test.ts:11-16` | covered |
| NFR-1 | `StarRating`/`Breadcrumbs` carry no `"use client"` | `StarRating.test.ts:110-115`, `dictionary-source.test.ts:212-216` | covered |
| NFR-2 | three files de-prosed; `priority` for above-fold covers; `sizes` per surface | `typography-source.test.ts:94-140,228-251` | covered |
| NFR-3 | no diff under migrations/types/config/collections | `integrated.md` §2 | covered |
| NFR-4 | `@tailwindcss/typography` in devDependencies only | `typography-source.test.ts:35-42` | covered |
| NFR-5 | no test deleted or weakened | 813 pass (765 before) | covered |
| AC-1 | `globals.css:4` + `package.json:65` | `typography-source.test.ts:31-42` | covered |
| AC-2 | `reviews/[slug]/page.tsx:353-383` | `typography-source.test.ts:103-121` | covered |
| AC-3 | `StarRating` + four call sites | `StarRating.test.ts:105-113` (element + label per file) | covered |
| AC-4 | `Breadcrumbs` + both pages | `Breadcrumbs.test.ts` | covered |
| AC-5 | `review-navigation.ts:76-80` + render guard | `review-navigation.test.ts:168-183` | covered |
| AC-6 | `reading-lists/page.tsx:5,83-88` | source inspection; e2e renders the page | covered |
| AC-7 | `dictionary.ts` both locales | `dictionary.test.ts:11-16` | covered |

## Findings

### Critical

None.

### High

None.

### Medium

- **F1 - `createdAt` fallback is compared against the `publishDate` column**
  - **File:** `src/lib/review-navigation.ts:68-70`, `:83-87`
  - **What:** `const anchor = review.publishDate ?? review.createdAt;` and then both queries compare the `publishDate` column against that anchor. When `publishDate` is null the anchor is a `createdAt` value compared to a different column, so the queries match almost every review instead of none - `newer` returns the earliest-published review after that `createdAt`, `older` returns nothing. The module's own doc comment at `:58-60` says the opposite: "A published review whose `publishDate` is null ... does not participate: date comparisons do not match a null column."
  - **Why:** A review with no `publishDate` (a row predating the back-fill hook at `src/collections/Reviews.ts:494-499`) renders a "Next review" link to an arbitrary unrelated review, silently, on a public page. The comment and the behaviour disagree, so the next person to touch this will trust the comment.
  - **Fix:** Drop the fallback - `const anchor = review.publishDate;` - keeping the existing `if (!slug || !anchor) return { newer: null, older: null };`. A `createdAt` comparison, if genuinely wanted, needs a second query pair against the `createdAt` column, not the same pair against `publishDate`.
  - **Requirement:** FR-6, AC-5
  - **Test gap:** `review-navigation.test.ts:168-182` ("falls back to createdAt") asserts the query shape, not the outcome. It should assert `{ newer: null, older: null }` and zero `find` calls for a review with no `publishDate`.

- **F2 - The reading-lists index inherits a `sizes` attribute for a different grid**
  - **File:** `src/components/ReadingListCard.tsx:51`, `src/app/(public)/[locale]/reading-lists/page.tsx:79`
  - **What:** `sizes="(max-width: 768px) 50vw, 25vw"` is hardcoded for the home page's 2/4-column grid, but the index renders the same component in `grid gap-8 sm:grid-cols-2 lg:grid-cols-3`, which is one column below 640px. At a 390px viewport the card is ~358px wide while `sizes` declares 195px, so the browser picks a srcset candidate roughly half the needed width and the cover is upscaled ~1.8x.
  - **Why:** The covers are the index's only imagery and its LCP candidates (the page passes `priority={index < 2}`), so they render visibly soft on every phone. This is a regression the shared-card adoption introduced: the deleted inline variant declared `(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw`, which was correct for the index's breakpoints.
  - **Fix:** Add an optional `sizes?: string` to the props defaulting to the current home-page string, pass it to `<Image sizes={sizes}>`, and have the index pass `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.
  - **Requirement:** NFR-2
  - **Test gap:** No unit harness can measure this. An e2e assertion that the index card's `img` carries a `sizes` containing `100vw` would fail today.

### Low

- **F3 - The prose-free guard matches a bare substring across whole files**
  - **File:** `src/lib/__tests__/typography-source.test.ts:74`
  - **What:** `expect(source).not.toContain("prose")` against three whole files. Any future comment, variable name or identifier containing "prose" fails the test, while `prose` re-added to any other file passes.
  - **Why:** A guard that can fail for the wrong reason gets weakened or deleted the first time it cries wolf - which is the regression the test exists to prevent.
  - **Fix:** Match the class position rather than the substring: `expect(source).not.toMatch(/className="[^"]*\bprose\b/)`.
  - **Requirement:** AC-1
  - **Test gap:** none - this is the test.

- **F4 - The StarRating call-site cases assert only the import**
  - **File:** `src/components/reviews/__tests__/StarRating.test.ts:106`
  - **What:** `expect(source).toContain("reviews/StarRating")`. A call site that keeps the import but stops rendering `<StarRating>`, or renders it without `labelTemplate`, still passes.
  - **Why:** AC-3's "all four former call sites use it" is the half of the criterion this test is supposed to hold; today it holds only the import.
  - **Fix:** Also assert `expect(source).toContain("<StarRating")` and `expect(source).toContain("labelTemplate=")` per call site.
  - **Requirement:** AC-3
  - **Test gap:** none - this is the test.

- **F5 - Code blocks invert in dark mode and become a bright block**
  - **File:** `src/app/globals.css:222-223`, `:240-241`
  - **What:** `--tw-prose-pre-code: var(--background)` and `--tw-prose-pre-bg: var(--foreground)`. In light mode that gives a dark block with light text, which is right. In dark mode `--foreground` is near-white and `--background` near-black, so a `<pre>` becomes a bright block on a dark page.
  - **Why:** FR-2 names code as one of the things that must hold contrast in dark mode. Contrast is fine; the block is glaring, which is the opposite of a reading experience. `phase-1.md` records this as a possible follow-up, but the shipped mapping is the light-mode-correct one.
  - **Fix:** Pin the pair to a mode-stable value instead of a flipping pair - `--tw-prose-pre-bg: var(--muted)` with `--tw-prose-pre-code: var(--foreground)` in both sets - so the block stays dark-on-light in light mode and light-on-dark in dark mode without inverting.
  - **Requirement:** FR-2
  - **Test gap:** `typography-source.test.ts:44-62` asserts body/links/quote-borders/captions/hr plus two invert variables; asserting the pre pair would pin whatever is decided.

### Round 2 - findings raised by the delta re-review of Phase R1

Two Low findings, both introduced by the fix delta itself. Neither is a defect in
shipped behaviour: one is a guard that did not cover the repo's dominant idiom, the
other a comment that named the wrong breakpoint. Both are fixed.

#### N1 - the prose guard missed `className={cn(...)}`

- **File:** `src/lib/__tests__/typography-source.test.ts:94`
- **What:** the F3 replacement matched two literal shapes, a plain `className`
  attribute and a template-literal one. The repo's dominant className idiom is
  `className={cn(...)}` - 22 sites under `src/`, two of them inside a guarded file
  (`ModernBookCarousel.tsx:202`, `:212`). A regression written as
  `className={cn("prose", size)}` passed both patterns.
- **Why:** the guard exists to stop `prose` returning to three above-the-fold files
  (NFR-2). F3 narrowed it so it stopped crying wolf; without a third pattern it also
  stopped seeing the most likely form of the regression it protects against.
- **Fix:** added a `cn(...)` pattern and two `cn(...)` strings to the self-test's
  regression list, so the new pattern is itself asserted.
- **Requirement:** AC-1
- **Test gap:** the self-test now covers the idiom rather than assuming it.
- **Resolution:** **fixed** at `f2acdb7`. Verified the pattern matches
  `<div className={cn("prose", size)}>` and does not match the carousel's existing
  prose-free `cn(...)` usage, so it fires on the regression and stays quiet on
  legitimate code.

#### N2 - the default `sizes` described the wrong breakpoint

- **File:** `src/components/ReadingListCard.tsx:20`
- **What:** the new prop doc said the default matched the home page, but that grid is
  `grid gap-6 grid-cols-2 lg:grid-cols-4` (`[locale]/page.tsx:116`) - two columns all
  the way to 1024px - while the default switched at 768. Between 769px and 1023px the
  cover is about 50vw wide but `sizes` declared 25vw, so the browser picked a
  half-width candidate: the same under-declaration F2 fixed on the index, in the band
  the comment claimed to cover.
- **Why:** the comment told the next reader the default was correct, making the
  tablet-landscape under-fetch invisible to review - and the new test pinned the
  string, so correcting it later also meant editing the test. The value predated the
  delta; the inaccurate comment is what the delta added.
- **Fix:** the default now switches at 1023px, the grid's own breakpoint, and the doc
  comment describes the real grid. The home page fetches the pixels its covers occupy
  in that band instead of half of them.
- **Requirement:** NFR-2
- **Test gap:** none - the corrected string is pinned by
  `typography-source.test.ts:243`.
- **Resolution:** **fixed** at `f2acdb7`.

## Overrides

None.

## Plan compliance

Every phase carries `Result`, `Checkpoint` and `Evidence`. Every `[x]` task was
checked against the diff and is implemented. The final diff is within the union
of the phases' `Touches` plus reported deviations:

- `src/lib/i18n/dictionary.ts` - touched in Phases 3, 4 and 5. Authorized in
  advance for Phase 3 (`ratingLabel`), listed for Phase 4, and the Phase 5 key
  removal is the same class of change as P5.T2.1 applied to a dictionary key.
- `src/app/(public)/[locale]/page.tsx`, `reviews/page.tsx`,
  `reading-lists/[slug]/page.tsx`, `src/components/reviews/RelatedReviews.tsx` -
  the four `ratingLabel` forwards, each one line, unavoidable because
  `StarRating` cannot import a dictionary into client components (NFR-1).
- P5.T1.3's wording was amended during acceptance, because the original ("keep
  each surface's existing visual outcome") stopped describing what shipped once
  the user chose to adopt `ReadingListCard` on the index. The amendment is
  accurate and `phase-5.md` §5 states the visible change plainly.

One task text needed amending rather than ticking, which is recorded rather than
smoothed over. No task was dropped.

## Out of scope

- The five residuals in `integrated.md` §9 stand as recorded and correctly rated,
  with one exception now promoted to F2: the `sizes` attribute is a real
  regression, not a residual.
- A React test harness would let rendered output be asserted directly. That is a
  reasonable future track, not a defect here.
- `has-data-[slot=card-action]` in `CardHeader` is an unreachable CSS hook after
  `CardAction` was deleted. Left alone as the narrower change; FR-8 is scoped to
  exports.

## Debt

`review.issues.enabled` is `false`, so nothing is filed. Under `review.strict`
all five findings are fixed in Phase R1 rather than deferred.

## Doc sync

`updated`

The post-review sync recorded what the fix rounds changed rather than adding new
behaviour. `conductor/tech-stack.md` now states that code blocks use one
mode-stable `--muted`/`--foreground` pair instead of the plugin's inverting
default (F5), and that `ReadingListCard` takes a `sizes` prop so each surface
declares the grid its covers land in (F2, N2). `product.md` and
`product-guidelines.md` are untouched: nothing a reader is told about the product
changed, and the two visible differences - the reading-lists index adopting the
shared card, and code blocks becoming a panel rather than a slab - are styling
detail recorded in the phase evidence. The neighbour-anchoring fix (F1) needs no
documentation because it made the code match what the doc comment already said.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS WITH FINDINGS (gate: BLOCK) | 0 | 0 | 2 | 3 | 0 |
| 2 | PASS WITH FINDINGS (gate: cleared) | 0 | 0 | 0 | 0 | 5 |
| 3 | PASS WITH FINDINGS (gate: cleared) | 0 | 0 | 0 | 0 | 2 |
