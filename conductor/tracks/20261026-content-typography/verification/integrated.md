# Integrated Verification - Content Typography & Reading Experience

- **Track:** `20261026-content-typography`
- **Branch:** `feat/20261026-content-typography`
- **Base:** `bca3a8bd9abac8d41f065dbf1b204d1908c111b8`
- **Date:** 2026-10-26

## 1. Result

**Verified.** Every layer of the configured verification strategy was run against
the full track diff, not against a phase checkpoint. Typecheck, lint, unit, build
and e2e all pass directly; the build needed the e2e database, which is documented
in section 5 rather than papered over.

## 2. Scope of the diff

26 files, 1,235 insertions, 273 deletions - 24 source files plus `package.json`
and `bun.lock`. The two extra files are the round-2 delta fixes recorded in
section 11.

No migration, no schema change, no collection change: `git diff --numstat` over
`src/migrations`, `src/payload-types.ts`, `src/payload.config.ts` and
`src/collections` returns nothing, so NFR-3 holds. One new devDependency
(`@tailwindcss/typography`), no runtime dependency and nothing removed, so NFR-4
holds.

| Production file | Change |
| --- | --- |
| `src/app/globals.css` | `@plugin` registration; `@utility prose-teal` mapping 36 typography variables to site tokens; three semantic colour tokens (`positive`/`warning`/`info`) in `:root` and `.dark` exposed via `@theme inline` |
| `src/app/(public)/[locale]/reviews/[slug]/page.tsx` | four `prose` sites gained `prose-teal` and dropped `prose-gray`; three structured sections re-tokenized; mood badge `color-mix`; `trail` array feeding both the JSON-LD and the visible crumbs; `getAdjacentReviews`; breadcrumbs and prev/next rendered |
| `src/app/(public)/[locale]/reading-lists/[slug]/page.tsx` | `trail` array; visible breadcrumbs above the title |
| `src/app/(public)/[locale]/reading-lists/page.tsx` | inline card variant replaced by `ReadingListCard` |
| `src/app/(public)/[locale]/about/page.tsx` | `prose-teal` + `prose-p:text-muted-foreground` |
| `src/app/(public)/[locale]/reviews/[slug]/loading.tsx` | de-prosed skeleton |
| `src/components/FeaturedHero.tsx`, `ModernBookCarousel.tsx` | de-prosed to deliberate clamped classes; `StarRating` |
| `src/components/ReviewCard.tsx`, `ReadingListCard.tsx` | built on the shared `CardLink`; `StarRating` |
| `src/components/ui/card.tsx` | added `CardLink`; deleted `CardAction`, `CardDescription` |
| `src/components/reviews/StarRating.tsx` (new) | one read-only rating renderer, three sizes, localized label |
| `src/components/reviews/Breadcrumbs.tsx` (new) | one visible trail component |
| `src/lib/review-navigation.ts` (new) | `getAdjacentReviews`, bounded queries, visibility-gated |
| `src/lib/i18n/dictionary.ts` | four navigation keys in both locales; removed the orphaned `readingListsNoImage` |
| `src/app/(public)/[locale]/page.tsx`, `reviews/page.tsx`, `RelatedReviews.tsx` | forward the new required `ratingLabel` prop |

Test files: `typography-source.test.ts` (+150), `review-navigation.test.ts`
(+204), `StarRating.test.ts` (+118), `Breadcrumbs.test.ts` (+68).

## 3. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 265 files` |
| static | `bun run lint` | 0 | `Checked 258 files. No fixes applied.` |
| unit | `bun test` | 0 | 813 pass, 0 fail, 58 files |
| static | `bun run build` | 0 | route table emitted, no build error |
| e2e | `bun run test:e2e` | 0 | 112 passed, 0 failed, 0 flaky (2.0m) |

The unit layer grew from 765 tests on `main` to 813 - 48 new tests across four
new files, no existing test deleted or weakened. One test was replaced rather than
deleted: the neighbour helper's query-shape assertion became an outcome assertion
when round 1 found it could not catch the defect it was written for. The one assertion that changed
is `readingListsNoImage`'s key disappearing from both dictionaries, which the
parity test's identical-key-set assertion still enforces symmetrically.

## 4. What the track changed for a reader

| Before | After |
| --- | --- |
| Review bodies rendered as untyped plain paragraphs - `prose` classes were present at 8 sites but the plugin was never installed, so headings, lists, blockquotes and code inside a review had no styling at all | Bodies, the three structured sections, the about page and favourite quotes render with real typographic rhythm, themed to the site's teal tokens in both modes |
| The three structured sections used hardcoded `green`/`orange`/`blue` palette classes that ignored the token set | Semantic `positive`/`warning`/`info` tokens, correct in dark mode by construction |
| The mood badge built its tint by appending `20`/`40` to a hex string, which breaks for any other colour format | `color-mix()` at the same alpha weights, correct for any format |
| Four copy-pasted star renderers, none announcing the rating | One `StarRating`, three sizes, `Rated N out of 5` for screen readers in the reader's language |
| No visible breadcrumb on either detail page, though both emitted `BreadcrumbList` JSON-LD | Visible crumbs from the same trail that feeds the JSON-LD |
| No way to move between reviews | Prev/next by publication order, absent at the boundaries, suppressed on previews |
| Three card renderings in two visual languages | Two cards on one shared base; the reading-lists index adopts `ReadingListCard` |

## 5. The build layer and its database precondition

`bun run build` was run against the e2e database:

```
DATABASE_URI=postgresql://...chasing-chapters_e2e STORAGE_ADAPTER=local bun run build
```

Exit 0. `STORAGE_ADAPTER=local` is required because that database was created
under the local adapter and has no `_objectkey` column; building as `s3` fails on
`column "_objectkey" does not exist`.

The local dev database is now fully migrated (14/14), so unlike the previous
track the build also succeeds against it. That was repaired separately and is not
part of this diff.

## 6. E2E

`bun run test:e2e` → exit 0, **112 passed, 0 failed, 0 flaky (2.0m)**, ending
`[e2e] The suite finished.`

The harness checks Redis, creates and migrates `chasing-chapters_e2e`, seeds the
fixture, builds a production app and runs Playwright against port 3100.

**What this covers for the track.** The suite renders every surface this diff
touched - the review detail page, the reading-lists index and detail pages, the
home page and the review index - so a card that failed to render, a breadcrumb
that threw, or a `prose-teal` utility that broke the CSS build would fail here.
`locale-metadata.spec.ts` and `content-localization.spec.ts` also exercise the
breadcrumb JSON-LD that the visible trail now shares a source with.

**What it does not cover.** No spec asserts the visible breadcrumb text, the
prev/next links, the star rating's accessible label, or the token colours. Those
are pinned at the unit layer (`StarRating.test.ts`, `Breadcrumbs.test.ts`,
`review-navigation.test.ts`, `typography-source.test.ts`). The suite also cannot
see the reading-lists index's new card look, which is the one change a human
should eyeball - it passes whether the badge is there or not.

## 7. Cross-phase integration

- Phase 2's semantic tokens and Phase 1's `prose-teal` are independent: the
  structured sections' inner prose divs still carry `prose prose-sm prose-teal`,
  so the tinted panels and the typography inside them come from different
  mechanisms and neither overrides the other.
- Phase 3's `StarRating` is used by both Phase 5 cards, so the card
  consolidation depended on Phase 3 being done - which is why the plan lists it
  as a dependency and why the shared base could be extracted without also
  touching the rating markup.
- Phase 4's `getAdjacentReviews` reuses `publishedAndVisibleWhere`, the same
  predicate the page's own fetch uses, so a neighbour cannot link to a review the
  page itself would refuse to serve.
- Phase 5's `CardLink` is where Phase 3's rating and Phase 1's typography meet in
  a card: the title keeps `font-serif` from the site's type scale and the
  `group-hover:text-primary` interaction, neither of which the refactor changed.

## 8. Coverage

Gate: 80% for new logic-bearing code. The three new modules with logic are
covered by their own suites: `review-navigation.ts` (13 cases), `StarRating.tsx`
(15 cases through `renderToStaticMarkup`), `Breadcrumbs.tsx` (7 cases).
`typography-source.test.ts` guards the CSS contract, which has no runtime to
instrument.

## 9. Residual risks carried to review

1. **No React test harness.** Rendered output is asserted at source level
   (`renderToStaticMarkup` for the two new components, source text for the CSS
   contract). The card consolidation in particular is proven by both cards taking
   their chrome from one function, not by a rendered comparison. **Low-Medium.**
2. **The reading-lists index changed visibly.** Badge gained, filled surface,
   `text-2xl` → `text-lg`. Approved before the work, but never seen as a
   screenshot. **Low**, but a reviewer should look at it.
3. **Neighbour links can be up to 60 seconds stale.** ISR at `revalidate = 60`;
   publishing a review revalidates `/reviews`, `/reviews/:slug` and `/` for both
   locales, but an adjacent review's page is not revalidated, so a prev/next link
   to a just-published review can lag one window. No new revalidation was added -
   it would mean revalidating every neighbour on every publish. **Low.**
4. **`has-data-[slot=card-action]` in `CardHeader` is now unreachable**, since
   `CardAction` was deleted. Left alone as the narrower change. **Low.**
5. **`prose-teal` maps 36 variables by hand.** A future typography plugin release
   that adds a variable would render that element unthemed rather than failing.
   The source test pins the variables that exist today, not the plugin's full
   surface. **Low.**

## 10. Verdict

The integrated state is sound. All five phases are verified, the full diff
typechecks, lints, tests, builds and passes e2e, no existing test was weakened,
there is no schema or runtime dependency change, and every requirement in the
spec has implementation plus behavioural test evidence.

The five residual risks are recorded rather than resolved, and two review rounds later the verdict stands: every finding either round raised is fixed, no Critical or High was ever raised, and section 11 records what changed. Item 1 is the one that
bounds how much the evidence is worth; item 2 is the one a human should look at.

## 11. Post-review state

This report was written before the review. Two review rounds followed, and what
they changed is recorded here rather than by rewriting the sections above.

**Round 1** raised five findings - two Medium, three Low - and all five were fixed
in Phase R1 at `0e4a21b`:

| Finding | Severity | What it was | Fixed in |
| --- | --- | --- | --- |
| F1 | Medium | the neighbour helper fell back to `createdAt` while querying the `publishDate` column, so a review without a publish date got a "Next review" link to an unrelated review | `0e4a21b` |
| F2 | Medium | the reading-lists index inherited the home page's `sizes`, fetching covers at roughly half the pixels they occupied on a phone | `0e4a21b` |
| F3 | Low | the prose-free guard matched the bare substring, so a prose comment failed it while a prose class added elsewhere passed | `0e4a21b` |
| F4 | Low | the `StarRating` call-site tests asserted the import, not the render | `0e4a21b` |
| F5 | Low | the code-block pair was inverted, making a `pre` the brightest thing on a dark page | `0e4a21b` |

**Round 2**, the delta re-review of those fixes, confirmed all five and raised two
Low findings against the fixes themselves, both fixed at `f2acdb7`: the new prose
guard did not understand `className={cn(...)}`, the repo's dominant idiom, so a
regression written that way still passed; and the new `sizes` default switched at
768px while the home page's grid switches at 1024, leaving the 769-1023 band
under-declared - the same defect F2 fixed on the index, one layer up.

**Layers re-run after the last fix:**

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 265 files` |
| static | `bun run lint` | 0 | `Checked 258 files. No fixes applied.` |
| unit | `bun test` | 0 | 813 pass, 0 fail, 58 files |
| e2e | `bun run test:e2e` | 0 | 112 passed, 0 failed, 0 flaky (1.6m) |

The build layer was not re-run after the review fixes. The delta touches a helper,
a component prop, a CSS variable pair and two test files - no route, no page
boundary, no dependency - so it cannot change what the build emits, and CI builds
the app as a required check on the PR.

**What the rounds changed about the residuals.** Residual 1 (no React harness) is
unchanged and is now why F4's fix is still a source assertion. Residual 2 (the
index's look never seen as a screenshot) stands - the review did not look at it
either, and it is the one thing a human should eyeball before this merges.
Residual 3 (60-second neighbour staleness) is unchanged. Residual 4 (the
unreachable `has-data-[slot=card-action]` hook) is unchanged. Residual 5
(hand-mapped `prose-teal`) is unchanged, and F5 turned out to be a consequence of
it: the pre pair was mapped by analogy with the other 34 variables rather than
considered on its own terms. Two new residuals came out of the rounds, both Low and
recorded in `review.md`: the `sizes` default and the prose guard are both
source-pinned rather than behaviour-pinned.