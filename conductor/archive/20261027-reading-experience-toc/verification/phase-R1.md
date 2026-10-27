# Phase R1 — Review Fixes

- Track: 20261027-reading-experience-toc
- Phase: R1 — Review Fixes
- Date: 2026-10-27 (UTC)
- Branch: feat/20261027-reading-experience-toc
- Base: 6aa5557429e9c5362ea1838655cd7ec39ad082fa
- Head (code): c3344fa
- Result: verified

## Verification commands

Single chained run per brief (second attempt; first attempt stopped at lint
on an e2e formatting nit, fixed, re-ran fully green):

| Layer | Command | Exit | Summary |
| ----- | ------- | ---- | ------- |
| typecheck | `bun run typecheck` | 0 | No type errors in 291 files |
| lint | `bun run lint` | 0 | Biome: 286 files checked, no issues |
| test | `bun test` | 0 | 881 pass, 0 fail across 66 files (878 baseline + 3 new share-fallback tests) |
| build | `bun run build` | 0 | Production build completes; only pre-existing google-gax `package.json` warnings |

Full command: `bun run typecheck && bun run lint && bun test && bun run build`

## Findings (F1–F5)

| Finding | Disposition | Evidence |
| ------- | ----------- | -------- |
| F1 (AC-3, scrollspy e2e) | done — R1.T1 | `e2e/review-toc.spec.ts`: new test "scrolling the article updates the active TOC link" scrolls the last TOC target via `scrollIntoViewIfNeeded()` (no click) and expects `aria-current="location"`; existing click test untouched |
| F2 (CI e2e run) | primary-owned, not executed | Out of scope for this phase per brief |
| F3 (AC-6, share stub test) | done — R1.T2 | `src/components/reviews/QuoteShare.tsx`: extracted `shareQuoteWithFallback` (same AbortError semantics, no behavior change); `__tests__/QuoteShare.test.ts`: resolve / AbortError-swallow / generic-error-falls-through cases |
| F4 (FR-1, dual-instance comment) | done — R1.T3 | `page.tsx` mobile TOC mount: JSX comment noting shared slug list, independent active state, `display:none` pairing, convergence on next scroll; no behavior change |
| F5 (NFR-3, fixed-section h2) | done — R1.T4 | `section-heading.tsx`: `h3` → `h2`, visual classes unchanged; no existing unit tests reference the old tag (`review-body.test.ts` covers body H2/H3 only); e2e heading locators are level-agnostic except level-1 checks, so no expectation updates needed |

## Evidence paths

- `e2e/review-toc.spec.ts`
- `src/components/reviews/QuoteShare.tsx`
- `src/components/reviews/__tests__/QuoteShare.test.ts`
- `src/app/(public)/[locale]/reviews/[slug]/page.tsx`
- `src/app/(public)/[locale]/reviews/[slug]/section-heading.tsx`

## Deviations

None — all changes stay within `Touches` (`e2e/*`, `src/components/reviews/*`,
`src/app/(public)/[locale]/reviews/[slug]/*`). No files outside `Touches`
touched; no generated files or lockfiles modified.

## Notes

- First verification attempt: `lint` exited 1 on Biome formatting of the new
  e2e test signature (line-length); fixed with multiline params, re-ran the
  full chain green. One fix attempt used, within the two-retry budget.
- The new e2e scrollspy test was not executed here (headless Playwright run
  is primary-owned F2); it follows the existing `tocNav` + `aria-current`
  patterns and the brief-prescribed `scrollIntoViewIfNeeded()` flow.
- New unit tests add 3 cases (878 passing before, 881 after); no existing tests modified.

## Primary verification

- Command: `bun run typecheck && bun run lint && bun test && bun run build`
- Exit: 0 (typecheck: no errors in 291 files; lint: 286 files clean; test: 881 pass, 0 fail across 66 files; build: production build succeeds)
- Result: verified — clean tree, all files within `Touches`, evidence present. F2 (live e2e execution) remains primary-owned (see PR/CI step).
