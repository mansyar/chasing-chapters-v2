# Review: Content Typography & Reading Experience

- **Track:** `20261026-content-typography`
- **Type:** `feature`
- **Branch:** `feat/20261026-content-typography`
- **Range:** `bca3a8bd9abac8d41f065dbf1b204d1908c111b8..HEAD`
- **Date:** 2026-10-26
- **Verdict:** `PASS WITH FINDINGS`
- **Gate:** blocked - `review.strict` is `true`, so Phase R1 must land before a PR

> The header records the severity-based verdict: no Critical or High finding was
> raised, so the track is not blocked by severity. The gate records whether
> strict mode's no-deferral rule is satisfied, and it is not yet - five findings
> are open. They agree once Phase R1 is verified.

## Summary

The track delivers what it promised. The typography plugin is installed and
themed on the site's own tokens with a complete 36-variable mapping, verified
against the plugin's own variable set - nothing missing, nothing misdirected -
and all eight inert `prose` sites are resolved deliberately (five kept, three
de-prosed). The three structured sections are tokenized with `color-mix`
replacing the hex-append trick, `StarRating` replaces all four inline renderers
without adding a `"use client"`, breadcrumbs on both detail pages share one
`trail` array with the JSON-LD they now back, and the orphan deletions are
genuinely unreferenced.

Two phases were executed by the primary rather than a `conductor-phase`
subagent, because the subagent pool was out of credits. Both evidence files say
so at the top, and the reviewer confirms that recording is honest rather than a
retrofit - including `phase-5.md` section 5, which states plainly that the
reading-lists index's look changed, why, and that the approval was given in prose
without a screenshot.

Two Medium defects survive. `getAdjacentReviews` substitutes `createdAt` into an
anchor that is then compared against the `publishDate` column, so a review with
no `publishDate` gets a neighbour link to an arbitrary unrelated review - and the
module's own doc comment says the opposite of what the code does. The
reading-lists index inherits a hardcoded `sizes` attribute that under-declares
its covers by 2x at mobile widths, which is a regression the card adoption
introduced. Three Low findings are test-brittleness and one dark-mode colour
inversion.

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
| FR-6 | `review-navigation.ts:62-138`; `reviews/[slug]/page.tsx:214-220,503-540` | `review-navigation.test.ts` | partial - F1 |
| FR-7 | `card.tsx:14-26` (`CardLink`), both cards, index | source inspection + e2e rendering | covered |
| FR-8 | `card.tsx:84`; deleted `CardAction`/`CardDescription`/`readingListsNoImage` | grep returns no references | covered |
| FR-9 | `dictionary.ts` both locales | `dictionary.test.ts:11-16` | covered |
| NFR-1 | `StarRating`/`Breadcrumbs` carry no `"use client"` | `StarRating.test.ts:110-115`, `dictionary-source.test.ts:212-216` | covered |
| NFR-2 | three files de-prosed; `priority` for above-fold covers | source diff only | partial - F2 |
| NFR-3 | no diff under migrations/types/config/collections | `integrated.md` §2 | covered |
| NFR-4 | `@tailwindcss/typography` in devDependencies only | `typography-source.test.ts:35-42` | covered |
| NFR-5 | no test deleted or weakened | 809 pass (765 before) | covered |
| AC-1 | `globals.css:4` + `package.json:65` | `typography-source.test.ts:31-42` | covered |
| AC-2 | `reviews/[slug]/page.tsx:353-383` | `typography-source.test.ts:103-121` | covered |
| AC-3 | `StarRating` + four call sites | `StarRating.test.ts:23-115` | partial - F4 |
| AC-4 | `Breadcrumbs` + both pages | `Breadcrumbs.test.ts` | covered |
| AC-5 | `review-navigation.ts` + render guard | `review-navigation.test.ts` | partial - F1 |
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

`pending`

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS WITH FINDINGS (gate: BLOCK) | 0 | 0 | 2 | 3 | 0 |
