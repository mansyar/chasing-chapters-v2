# Phase R1 evidence — Review Fixes (navigator.languages + comment accuracy)

- Track: 20261027-route-error-boundaries — Route error boundaries
- Phase: R1 — Review Fixes
- Date: 2026-10-27
- Branch: feat/20261027-route-error-boundaries
- Base commit: e9e2bc095e5c4bd239970d41e73c1587278f4ff3
- Head commit: 5239241407ffafb0fdcde033f1551d589bd6e816
- Result: **verified**

## What was fixed

- R1.T1 (F1): `resolveBrowserErrorLocale` in `src/lib/error-locale.ts` now
  passes the full browser language preference —
  `acceptLanguage: navigator.languages?.join(", ") || navigator.language` —
  so `parseAcceptLanguage` ranks every preference. A reader with
  `languages: ['fr', 'id']` now resolves to `'id'` instead of English.
- R1.T2 (F2–F4): comment accuracy only —
  - F2: `src/app/(public)/[locale]/error.tsx` cookie-first chain citation
    `FR-3` → `FR-1`.
  - F3: same change in `src/app/global-error.tsx`.
  - F4: `src/app/(public)/[locale]/boom/page.tsx` production-gate comment
    reworded neutrally: the `E2E_TEST_ROUTES` flag is set only by the e2e
    harness build (`src/scripts/e2e-run.ts`); every other build omits it, so
    the route 404s in every other deployment. No claim of request-time
    evaluation of one shared artifact.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | 0 | No type errors in 275 files |
| lint | `bun run lint` | 0 | Biome clean, 268 files, no fixes applied |
| unit | `bun test` | 0 | 831 pass / 0 fail across 59 files, 3414 expect() calls (expected console noise from rejection-path/translation tests only) |
| combined | `bun run typecheck && bun run lint && bun test` | 0 | All three layers green in one run |

## Findings

| Finding ID | Fix | Test | Status |
| --- | --- | --- | --- |
| F1 | `src/lib/error-locale.ts`: `acceptLanguage: navigator.languages?.join(", ") \|\| navigator.language` | New unit test stubs `document: { cookie: "" }` and `navigator: { language: "fr", languages: ["fr", "id"] }`, expects `'id'`; restores globals in `finally` | Fixed, verified |
| F2 | `src/app/(public)/[locale]/error.tsx`: comment `FR-3` → `FR-1` | Docs-only; covered by typecheck + lint | Fixed, verified |
| F3 | `src/app/global-error.tsx`: comment `FR-3` → `FR-1` | Docs-only; covered by typecheck + lint | Fixed, verified |
| F4 | `src/app/(public)/[locale]/boom/page.tsx`: neutral production-gate comment | Docs-only; covered by typecheck + lint | Fixed, verified |

## Primary verification

Independently re-ran the phase verification command on the final tree:

- `bun run typecheck` → exit 0, no type errors in 275 files.
- `bun run lint` → exit 0, clean over 268 files.
- `bun test` → 831 pass / 0 fail across 59 files (+1 vs Phase 1: the new
  F1 regression test).

Squash guard: range `e9e2bc0..HEAD` contains exactly the one reported fix
commit `5239241` — no merge, unreported, or user commits. No squash needed;
the commit stands as the phase checkpoint.

## Evidence paths

- `src/lib/error-locale.ts` (F1 fix)
- `src/lib/__tests__/error-locale.test.ts` (F1 regression test)
- `src/app/(public)/[locale]/error.tsx` (F2 fix)
- `src/app/global-error.tsx` (F3 fix)
- `src/app/(public)/[locale]/boom/page.tsx` (F4 fix)

## Deviations

- none. All changes stayed within the phase `Touches` list.

## Notes

- The new `resolveBrowserErrorLocale` test stubs `globalThis.document` /
  `globalThis.navigator` via a narrow `unknown` cast (no `any`) and restores
  the originals in `finally`, so the adjacent SSR-fallback test (bun has no
  `document`/`navigator`) is unaffected by test order.
- No product or design decision was required; the rewordings follow the review
  findings verbatim.
