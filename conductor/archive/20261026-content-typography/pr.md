## Summary

Eight `prose` class names across the site were inert: `@tailwindcss/typography`
was never installed, so review bodies, the about page and three structured
sections rendered with no typographic styling at all. This track activates the
plugin, themes it to the site's own tokens, and finishes the reading experience
around it - one shared star rating that announces itself to screen readers,
visible breadcrumbs backed by the JSON-LD that was already there, prev/next
navigation between reviews, and three card renderings collapsed onto one base.

## Track

- **ID:** `20261026-content-typography`
- **Type:** `feature`
- **Spec:** `conductor/archive/20261026-content-typography/spec.md`
- **Plan:** `conductor/archive/20261026-content-typography/plan.md`
- **Review:** `conductor/archive/20261026-content-typography/review.md`

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Typography foundation | Plugin active, themed to site tokens, all eight `prose` usages resolved | verified | `2d61ce9` | Mechanism verified against the plugin's own source, not assumed: `@plugin` for v4, 18 base variables plus 18 invert siblings |
| 2: Structured sections tokenized | Three sections use design tokens and hold contrast in dark mode | verified | `f240322` | Three semantic tokens (`positive`/`warning`/`info`) added to `:root` and `.dark`; mood badge hex-append replaced with `color-mix` |
| 3: Shared StarRating | One read-only component replaces four inline renderers | verified | `e2e9d79` | Three sizes copied verbatim so the swap is visually neutral; label passed in because the component must not import a dictionary |
| 4: Breadcrumbs and prev/next | Visible trail on both detail pages, adjacent reviews on review detail | verified | `7f54443` | One `trail` array now feeds both the JSON-LD and the rendered crumbs; **executed by the primary** - see deviations |
| 5: Card consolidation | Two cards, one visual language, orphans gone | verified | `3a978f9` | Shared `CardLink` base; the index adopts `ReadingListCard`, which is a deliberate visible change - **executed by the primary** |
| R1: Review Fixes | Five findings from round 1 | verified | `0e4a21b` | Two Medium, three Low; all fixed with a test that fails if reverted |
| R2: Round-2 delta | Two findings the re-review raised against R1's own fixes | verified | `f2acdb7` | Both Low, both real: the new prose guard missed `cn()`, the new `sizes` default switched at the wrong breakpoint |

## Requirements

- [x] `FR-1` ΓÇö `prose` classes render through an installed, token-themed plugin (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `FR-2` ΓÇö all eight usage sites resolved, none left inert (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `FR-3` ΓÇö the three structured sections use design tokens, no hardcoded palette colours (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `FR-4` ΓÇö one shared read-only `StarRating` at all four former call sites (test: `src/components/reviews/__tests__/StarRating.test.ts`)
- [x] `FR-5` ΓÇö visible breadcrumbs on both detail pages, consistent with the existing JSON-LD (test: `src/components/reviews/__tests__/Breadcrumbs.test.ts`)
- [x] `FR-6` ΓÇö prev/next links in `publishDate` order, absent at both boundaries and on previews (test: `src/lib/__tests__/review-navigation.test.ts`)
- [x] `FR-7` ΓÇö `ReviewCard` and `ReadingListCard` share one base card, index uses `ReadingListCard` (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `FR-8` ΓÇö exports orphaned by this track removed (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `FR-9` ΓÇö the rating announces "Rated N out of 5" in the reader's language (test: `src/components/reviews/__tests__/StarRating.test.ts`)
- [x] `NFR-1` ΓÇö no new `"use client"` directive (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `NFR-2` ΓÇö no layout regression on the above-the-fold surfaces (test: `src/lib/__tests__/typography-source.test.ts`)
- [x] `NFR-3` ΓÇö no schema change, no migration
- [x] `NFR-4` ΓÇö one devDependency, no runtime dependency added
- [x] `NFR-5` ΓÇö existing tests pass, none deleted or weakened
- [x] `AC-1` ΓÇª `AC-7` ΓÇö all covered; see `review.md` for the per-criterion evidence table

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 ΓÇö no type errors in 265 files | `conductor/archive/20261026-content-typography/verification/integrated.md` |
| static | `bun run lint` | 0 ΓÇö 258 files, no fixes | same |
| unit | `bun test` | 0 ΓÇö 813 pass, 0 fail, 58 files | same |
| static | `bun run build` | 0 ΓÇö route table emitted | same |
| e2e | `bun run test:e2e` | 0 ΓÇö 112 passed, 0 failed, 0 flaky (1.6m) | same |

The unit suite grew from 765 tests on `main` to 813. No existing test was deleted
or weakened; one was replaced - the neighbour helper's query-shape assertion
became an outcome assertion when round 1 showed it could not catch the defect it
was written for.

Two phases (4 and 5) were executed by the primary because the subagent pool ran
out of credits. The implementer/verifier separation the workflow assumes did not
hold for those, so their evidence files say so in their first section and every
claim in them is a command output or a quoted source line.

## Media

Captured at `20aae28` against a local dev server.

- The reading-lists index with the adopted `ReadingListCard`: book-count badge,
  filled card surface, `text-lg` title - the deliberate visible change from this
  track, in both themes.
  ![Reading lists index, light](https://github.com/user-attachments/assets/0319e8e5-8c78-4360-a486-9262acefd593)
  ![Reading lists index, dark](https://github.com/user-attachments/assets/67159af7-684a-4f85-beb5-47c762185601)
- A review detail page: the breadcrumb trail above the cover, the shared
  `StarRating`, and the tokenized structured sections below - light and dark.
  ![Review detail, light](https://github.com/user-attachments/assets/9f682681-8fdf-4940-b207-4456f521bf90)
  ![Review detail, dark](https://github.com/user-attachments/assets/51ca0322-5a99-4571-bf84-741f92d25e5f)
- Prev/next navigation at the foot of a review.
  ![Prev/next navigation](https://github.com/user-attachments/assets/b455b2e1-8240-431a-b9b8-1d514858d6e9)

## Review

- **Verdict:** `PASS WITH FINDINGS`
- **Rounds:** 2
- **Fixed:** 7 findings (2 Medium, 5 Low)
- **Accepted/deferred:** 0 ΓÇö `review.strict` is on, so nothing was deferred

No Critical or High finding was raised in either round. The two Medium defects
were both in code written for this track: the neighbour helper compared a
`createdAt` value against the `publishDate` column, and the reading-lists index
inherited the home page's `sizes` so covers were fetched at roughly half the
pixels they occupied on a phone.

## Deviations and risks

- **The reading-lists index looks different.** Adopting `ReadingListCard` there
  gives it the book-count badge, a filled card surface and a `text-lg` title
  instead of `text-2xl`. This was put to you before any code was written and
  approved; P5.T1.3 was reworded at acceptance rather than left claiming a
  visual outcome that did not ship.
- **Two phases executed by the primary**, as above.
- **Light-mode code blocks changed too.** F5 pinned one mode-stable
  `--muted`/`--foreground` pair, so a `pre` went from dark-on-white to
  dark-on-light-grey. One pair has to serve both modes; keeping stark white would
  need a per-mode override.
- **The `prose-teal` map is hand-written** - 36 variables read from the plugin's
  source and mapped to tokens. A plugin upgrade that renames a variable would not
  fail loudly, though the source test pins the ones that matter.
- **No React render harness** in this project, so the call-site and prose guards
  are source assertions. They fail on the regressions they were written for
  (demonstrated in `verification/phase-R1.md` ┬º4) but they read source text.
- **The index's new look was never seen as a screenshot** by the review. It is
  the one thing worth eyeballing before merge, and it is what the media on this PR
  is for.

## Follow-ups

None filed - `review.issues.enabled` is `false` in `workflow.md`. Two candidates
worth a future track: a React test harness (which would turn five source
assertions into render assertions), and a Lighthouse or real-device pass to
measure what F2's `sizes` correction actually bought.

## Rollback

```bash
# If merged as a merge commit:
git revert --no-edit -m 1 <merge-commit>

# If squashed:
git revert --no-edit <squash-commit>
```

No migration, no feature flag and no data change is involved, so a revert is
complete. Reverting restores the eight inert `prose` class names and the four
duplicated star renderers; nothing else depends on this track.

