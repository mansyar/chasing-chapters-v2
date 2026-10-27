# Phase 1 verification — React render harness for typography components

- Track: 20261027-typography-residuals — Typography residuals
- Phase: 1 — React render harness for typography components
- Date: 2026-10-27
- Branch: `refactor/20261027-typography-residuals`
- Base: `ed1d4ff7c8cde011ac29d6097e16928854cae94c`
- Code head: `178e1bf` (test: convert StarRating and Breadcrumbs call sites to render assertions)
- Result: **verified**

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` | 0 | No type errors in 278 files |
| Lint | `bun run lint` | 0 | Biome clean, 273 files checked, no fixes applied |
| Tests | `bun test` | 0 | 835 pass, 0 fail, 3420 expectations, 61 files |

The three layers ran as the single gate `bun run typecheck && bun run lint && bun test`.
Only pre-existing log noise remains: a React `jsx="true"` non-boolean-attribute
warning from `ModernBookCarousel`'s `<style jsx>` during static rendering
(harmless — the carousel renders and its StarRating assertions pass), plus the
usual translation/Redis fallback chatter from unrelated suites.

## Findings

| Task | What changed | Test | Status |
|---|---|---|---|
| P1.T1 render harness (FR-1) | New shared `renderStatic(element)` helper under `src/components/__tests__/helpers/` documenting the server-component boundary (server output only, no interactivity/effects, async Payload pages unrendersable, no new deps). Location chosen because all consumers are component render tests; `src/lib/__tests__` holds unit tests, not component fixtures. | Helper has no tests of its own; exercised by every new/converted render test below (26 render assertions across 4 files) | done |
| P1.T2 card chrome identity (FR-1, AC-1) | New `src/components/__tests__/card-chrome.test.ts`: ReviewCard and ReadingListCard render through the harness and assert identical chrome markup (anchor minus `href` plus the `data-slot="card"` region), plus hover-lift markers and custom/default `sizes` forwarding. Replaces the "shared function" source argument with rendered evidence. | 4 new tests pass | done |
| P1.T3 call-site conversion (FR-1, AC-2) | `StarRating.test.ts`: the ReviewCard call site now renders through the harness (label + fill assertions); the review-detail page wiring and the client-boundary check stay source-pinned with the reason stated (async server component fetching from Payload; cannot render in a unit test). `Breadcrumbs.test.ts`: all 7 behavioral assertions unchanged, now via the shared harness. FeaturedHero/ModernBookCarousel render tests live in the new `src/components/__tests__/star-rating-call-sites.test.ts` (see Notes for why). | Converted suites pass; all pre-existing behavioral assertions unchanged and green | done |

## Evidence paths

- `src/components/__tests__/helpers/render-static.ts` (+ identical `.tsx` twin — see Deviations)
- `src/components/__tests__/card-chrome.test.ts`
- `src/components/__tests__/star-rating-call-sites.test.ts`
- `src/components/reviews/__tests__/StarRating.test.ts`
- `src/components/reviews/__tests__/Breadcrumbs.test.ts`
- `src/lib/__tests__/typography-source.test.ts` — untouched; still green, no weakening

## Deviations

1. `src/components/reviews/__tests__/StarRating.test.ts` and
   `src/components/reviews/__tests__/Breadcrumbs.test.ts` sit outside the
   `Touches` paths, but P1.T3 explicitly requires converting their
   source assertions, so editing them is the phase goal, not scope creep.
2. The helper exists twice with identical content: `helpers/render-static.ts`
   and `helpers/render-static.tsx`. File deletion is not permitted in this
   execution environment, so both are committed and the primary should delete
   one (recommend keeping `render-static.ts`: no JSX inside, fully typed, and
   all call sites import it extensionlessly). Typecheck, lint, and tests are
   green either way.

## Primary verification

Independently re-ran the phase gate on the final tree after deleting the
`.tsx` twin (identical hash; extensionless imports resolve to the kept
`.ts`):

- `bun run typecheck` → exit 0, no type errors in 278 files.
- `bun run lint` → exit 0, clean over 272 files.
- `bun test` → 835 pass / 0 fail across 61 files (3420 expects).

Squash guard: range `ed1d4ff..HEAD` contains exactly the four reported
subagent commits — no merge, unreported, or user commits. Squashed with the
twin deletion into the phase checkpoint below.

## Notes

- The dictionary-source guard (`no client component imports the server
  dictionary`) scans test files under `src/components` too, and a first full
  run flagged the converted `StarRating.test.ts`: it held both the `"use
  client"` literal (inside the client-boundary assertion) and the new
  `getDictionary` value import. Rather than weaken the guard, the two
  dictionary-backed render tests (FeaturedHero, ModernBookCarousel) moved to
  `star-rating-call-sites.test.ts`, which contains no such literal. Both the
  guard and the boundary assertion stay intact and green.
- `typography-source.test.ts` needed no changes: no card-chrome source
  assertion existed there, and its `sizes` forwarding assertions remain as
  source-level pins alongside (not replaced by) the new render coverage.
- Residuals R2–R5 (plugin guard, review surfaces, tokens, docs) are out of
  scope for this phase and untouched.
