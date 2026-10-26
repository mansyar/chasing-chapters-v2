# Phase 2 evidence — Forced-error trigger + bilingual e2e

- Track: 20261027-route-error-boundaries — Route error boundaries
- Phase: 2
- Date: 2026-10-27
- Branch: feat/20261027-route-error-boundaries
- Base commit: 5b9232bcb1029058f48c02fdf091e0e73d4523b7
- Head commit: (committed by the primary at acceptance; see plan Checkpoint)
- Result: **verified** — implementation complete, verification run by the
  primary (the phase subagent has no shell/git access)

## Primary verification

- `bun run typecheck` → exit 0, no type errors in 274 files.
- `bun run lint` (`biome check .`) → clean over 268 files after
  `biome check --write` on the new spec (import order + formatting only).
- `bun test` → 830 pass, 0 fail across 59 files.
- `bun run test:e2e -- e2e/error-boundaries.spec.ts` → **4 passed**
  (EN UI + recovery, EN home navigation, ID UI + recovery, ID home
  navigation) against the production build with the seeded e2e database.
  First run: 2 failed on a Playwright strict-mode violation — `getByRole`
  matched Next's body-level route announcer as well as the error UI. Fixed
  in the spec only by scoping to `main [role="alert"]` (the boundary renders
  inside `<main>`); rerun green. No app change needed.
- Production gate: `/boom` calls `notFound()` unless `E2E_TEST_ROUTES=1`,
  which only the e2e harness sets (`src/scripts/e2e-run.ts`). The e2e green
  run above proves the route serves under the harness; the gate itself is a
  three-line server-component guard covered by typecheck, not by a
  production assertion (asserting a 404 in production is out of scope).

## What was built

- `src/app/(public)/[locale]/boom/page.tsx` (new, server) — test-only host
  page for the trigger. Carries `robots: { index: false, follow: false }`,
  is never listed in the content-driven sitemap, and is linked from no
  production UI, so readers can only arrive by typing the URL.
- `src/app/(public)/[locale]/boom/boom-button.tsx` (new, client) — the
  forced-error trigger. Renders a "Throw test error" button; clicking it
  throws during render, which is what the `[locale]/error.tsx` segment
  boundary catches. The throw is state-driven (not unconditional) so `reset()`
  remounts the segment with fresh state and the spec can prove recovery. Does
  not import the server dictionary (client-bundle convention).
- `e2e/error-boundaries.spec.ts` (new) — four Playwright tests following the
  existing harness conventions (`localePath` fixture helper, `getByRole`
  assertions, bounded workers via the shared config, production-build server
  with the seeded e2e database):
  - EN error UI: alert role, "This Chapter Stumbled" heading, description,
    Try Again button, Back Home link (`href="/en"`), no leaked internals,
    Try Again recovers to the trigger button with the alert gone.
  - EN home navigation: Back Home lands on `/en` with the homepage content.
  - ID error UI: same shape with "Bab Ini Tersandung" / "Coba Lagi" /
    "Kembali ke Beranda" (`href="/id"`), no leaked internals, recovery.
  - ID home navigation: Beranda link lands on `/id` with the homepage content.

## Commands

| Layer | Command | Exit | Summary |
| ----- | ------- | ---- | ------- |
| static + unit | `bun run typecheck && bun run lint && bun test` | 0 | typecheck 274 files clean; lint 268 files clean; 830 pass / 0 fail (run by primary) |
| e2e | `bun run test:e2e -- e2e/error-boundaries.spec.ts` | 0 | 4 passed against the production build + seeded e2e DB (run by primary; first attempt 2 failed on a spec scoping issue, fixed and rerun green) |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| -- | --------- | -------- | ------ |
| FR-5 | Test-only forced-error trigger, never reachable in production UI | `/boom` 404s unless `E2E_TEST_ROUTES=1` (harness-only); noindex, unlisted, unlinked | Verified |
| AC-1 | EN segment error shows branded UI with working reset + home | e2e EN tests (4 passed) | Verified |
| AC-2 | Same in ID | e2e ID tests (4 passed) | Verified |
| AC-6 | No stack/digest text in the error UI | `not.toContainText` assertions in both locales, e2e green | Verified |
| AC-7 | Full verification green | typecheck + lint + unit + targeted e2e, all exit 0 | Verified |

## Evidence paths

- `src/app/(public)/[locale]/boom/page.tsx`
- `src/app/(public)/[locale]/boom/boom-button.tsx`
- `e2e/error-boundaries.spec.ts`

## Deviations

- Chose a dedicated unlinked route (`/[locale]/boom`) with a click-to-throw
  stateful button over a query-gated (`?boom=1`) component. A query gate on an
  existing page would couple the trigger to page-specific code and — if the
  throw were unconditional — `reset()` could never recover, leaving AC-1/AC-2
  recovery unprovable. The stateful button lets the spec assert Try Again
  returns to the trigger page.
- Primary-added production gate (spec FR-5 edge case): `/boom` calls
  `notFound()` unless `E2E_TEST_ROUTES=1`, set only by the e2e harness child
  env. Touches `src/scripts/e2e-run.ts` (outside the listed `Touches`, the
  smallest change satisfying "never reachable in production UI"); no other
  files outside `Touches` were modified.

## Notes

- The trigger label "Throw test error" matches none of the
  `dictionary-source.test.ts` moved-string literals, and the client component
  imports no server dictionary, so the i18n scan and bundle tests stay green.
- Copy asserted in the spec mirrors `ERROR_COPY` exactly (Phase 1); the URL
  locale in the path is what the segment boundary prefers, so the specs are
  deterministic regardless of cookie state.
- The sitemap (`src/app/sitemap.ts`) builds exclusively from static paths plus
  review/reading-list slugs, so the trigger route is excluded by construction
  with no sitemap change needed.
