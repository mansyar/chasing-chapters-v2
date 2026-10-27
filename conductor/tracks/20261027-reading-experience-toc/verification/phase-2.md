# Phase 2 evidence — TOC UI + anchors + quote-share

- Track: 20261027-reading-experience-toc — Review Reading Experience + TOC
- Phase: 2 — TOC UI + anchors + quote-share (FR-1, FR-3, FR-4, FR-6; AC-1, AC-3, AC-4, AC-6)
- Date: 2026-10-27
- Branch: feat/20261027-reading-experience-toc
- Base: 49fcfb1075d36f55afbe5673150f6d6aae450d9a
- Head (implementation): a86eca11e0d499565ae58346c1d9cae1bb256774
- Result: **verified**

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| typecheck | `bun run typecheck` (`bun check`) | 0 | No type errors in 290 files |
| lint | `bun run lint` (`biome check .`) | 0 | 285 files checked, no errors |
| test (full) | `bun test` | 0 | 875 pass, 0 fail, 66 files |
| test (targeted) | `bun test` on the 3 new + 4 related suites | 0 | 49 pass, 0 fail, 7 files |
| build | `bun run build` (`next build --webpack`) | 0 | Production build succeeds; review `[slug]` routes prerender. Only warning is the pre-existing `google-gax` `package.json` resolve warning from `@google-cloud/translate`, unrelated to this phase. |

Full verification command (exit 0): `bun run typecheck && bun run lint && bun test && bun run build`.

Two fix rounds were needed, both within allowance: (1) typecheck — the `review-body` test fixture's `format: ""` widened to `string`; annotated the fixture `NonNullable<Review["reviewContent"]>`. (2) lint — Biome import-name sorting in `review-body.tsx` / `TableOfContents.tsx`, and `useExhaustiveDependencies` flagging the derived `slugKey` as an extra dep (removed the variable, effect now depends on `[entries]`).

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-1 | Review detail shows the TOC listing body H2/H3 + fixed sections in order | `TableOfContents` renders one `#anchor` link per `TocEntry` in order inside `nav aria-label`; `src/components/reviews/__tests__/TableOfContents.test.ts` ("renders one anchor link per entry in order", "indents level-3 entries"); page builds `tocEntries` once via Phase 1 `buildTableOfContents` | met (e2e visual pass owned by Phase 3) |
| AC-3 | Scrollspy highlights the active section; smooth scroll (instant on reduced motion) | `IntersectionObserver` (`rootMargin -6rem/−70%`) sets `aria-current="location"`; click handler uses `behavior: smooth` unless `prefers-reduced-motion`, then `history.pushState`; pure client behavior, no unit test per brief exemption | met (e2e owned by Phase 3) |
| AC-4 | Headings carry stable anchor ids; deep links land; copy-link copies absolute URL + hash | `ReviewBody` SSR heading converter injects `id` from the same `buildTableOfContents` call that feeds the TOC; `SectionHeading` does the same for fixed sections; mount effect scrolls to `location.hash`; `CopyLinkButton` copies `new URL('#slug', location.href)` + pushes history; `review-body.test.ts` pins id assignment order, H1 exclusion, and per-heading copy buttons | met |
| AC-6 | Each favorite quote has copy + share buttons with toast feedback | `QuoteShareButtons` copies `"<quote>" — <book> <url>`, tries `navigator.share` first with AbortError fallthrough, sonner toasts follow the `ShareButton` pattern; `QuoteShare.test.ts` pins localized labels and initial state | met |
| AC-8 | TOC hides below 2 entries but the reading-time badge always renders | `hasTableOfContents` early-return (`null`) covered by "hides entirely" test; `readingTimeLabel` (`estimateReadingMinutes` + `formatReadingTime` + `reviewReadingTime` template) renders unconditionally in the hero meta with a `Clock` icon | met |

## Evidence paths

- `src/components/reviews/TableOfContents.tsx` (P2.T1)
- `src/components/reviews/QuoteShare.tsx` (P2.T3)
- `src/app/(public)/[locale]/reviews/[slug]/review-body.tsx`, `section-heading.tsx`, `copy-link-button.tsx` (P2.T2)
- `src/app/(public)/[locale]/reviews/[slug]/page.tsx` (wiring: `tocEntries`, `bodyHeadingSlugs`, `sectionSlugFor`, `readingTimeLabel`, mobile + desktop TOC mounts)
- `src/lib/i18n/dictionary.ts` (`reviewOnThisPage`, `reviewCopyLink`, `reviewCopyQuote`, `reviewShareQuote` EN + ID)
- Tests: `src/components/reviews/__tests__/TableOfContents.test.ts`, `src/components/reviews/__tests__/QuoteShare.test.ts`, `src/app/(public)/[locale]/reviews/[slug]/__tests__/review-body.test.ts`

## Deviations

- `src/lib/i18n/dictionary.ts` — the only file touched outside `Touches`: 4 new keys (`reviewOnThisPage`, `reviewCopyLink`, `reviewCopyQuote`, `reviewShareQuote`) with EN + ID values. Smallest possible addition, expressly permitted by the brief; keeps the dictionary-source scan and parity test passing.

## Notes

- Pure UI components carry behavior tests only where cheap (TOC markup/variants, quote labels, slug→id wiring); scrollspy/smooth-scroll/deep-link landing are client behaviors reserved for Phase 3 e2e, per brief.
- TOC links and heading ids share the single `buildTableOfContents` call, so they cannot disagree on slugs; non-H2/H3 body headings render unlinked but never consume a slug.
- Evidence file committed separately after the implementation commit; both SHAs are reported in the phase report JSON.
