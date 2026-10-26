# Review: Route error boundaries

- **Track:** `20261027-route-error-boundaries`
- **Type:** `feature`
- **Branch:** `feat/20261027-route-error-boundaries`
- **Range:** `c46f3c1..d56d5f1` (round 1) + fix delta `6200d4c..5239241` (round 2)
- **Date:** `2026-10-27`
- **Verdict:** `PASS`

## Summary

The track delivers what the spec promises: bilingual branded error UI at the
root and locale segment, Sentry reporting that cannot break rendering, and a
production-gated test-only trigger with EN/ID e2e proving recovery. Checks are
green (typecheck 275 files, lint 268, unit 830/0, error-locale 100% funcs,
production build via the e2e harness). One Medium finding blocks: the browser
resolver ignores `navigator.languages`, so a reader whose top language is
unsupported but second is supported gets English instead of their language —
a bilingual-parity (NFR-1) gap. Three Low comment inaccuracies ride along in
the same fix phase.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 830 pass / 0 fail, 59 files |
| coverage | `bun test --coverage` | pass | error-locale.ts 100% funcs / 94.87% lines (gate 80%); uncovered 91-94 are the SSR fallback |
| lint | `bun run lint` | pass | biome clean, 268 files |
| typecheck | `bun run typecheck` | pass | 275 files, 0 errors |
| build | production build via `bun run test:e2e` harness | pass | harness built the app on the final tree; suite 4/4 green |

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P1.T1, P1.T2 | `src/lib/__tests__/error-locale.test.ts` (resolver + parity), build green | covered |
| FR-2 | P1.T2 | `e2e/error-boundaries.spec.ts` EN+ID UI tests | covered |
| FR-3 | P1.T2 | e2e Try Again recovery + Back Home navigation, both locales | covered |
| FR-4 | P1.T3 | unit capture-with-context + throw-swallowing tests | covered |
| FR-5 | P2.T1 | `E2E_TEST_ROUTES` gate + noindex + harness-only flag; e2e green | covered |
| NFR-1 | P1.T1 | parity unit test + EN+ID e2e | covered (pending F1 fix for multi-language browsers) |
| NFR-2 | P1.T2 | e2e no-internals assertions, both locales | covered |
| NFR-3 | P1.T1–T3 | no new deps (only existing `@sentry/nextjs`) | covered |
| NFR-4 | P1.T2 | `role="alert"`, keyboard-native Button/Link; e2e alert scoping | covered |
| AC-1 | P2.T2 | e2e EN | covered |
| AC-2 | P2.T2 | e2e ID | covered |
| AC-3 | P1.T1 | resolver unit tests (cookie/header/EN/SSR) | covered |
| AC-4 | P1.T3 | unit Sentry route context | covered |
| AC-5 | P1.T3 | unit Sentry-failure isolation | covered |
| AC-6 | P2.T2 | e2e both locales | covered |
| AC-7 | Phase 1 + Phase 2 + integrated | typecheck + lint + unit + e2e all exit 0 | covered |

## Findings

### Critical

- none

### High

- none

### Medium

- **F1 — Browser resolver ignores `navigator.languages`**
  - **File:** `src/lib/error-locale.ts:91-94`
  - **What:** `resolveBrowserErrorLocale` passes only `navigator.language`,
    ignoring the ordered `navigator.languages` list.
  - **Why:** A reader with languages `['fr','id']` resolves to English instead
    of Indonesian — a bilingual-parity (NFR-1) gap in the exact helper the
    spec relies on for the EN/ID fallback chain.
  - **Fix:** Join the full list: `acceptLanguage:
    (navigator.languages?.join(', ') || navigator.language)` so
    `parseAcceptLanguage` ranks every preference.
  - **Requirement:** FR-1 / NFR-1
  - **Test gap:** Unit test stubbing `navigator.languages` as `['fr','id']`
    expecting `'id'`.

### Low

- **F2 — Wrong requirement citation in segment boundary comment**
  - **File:** `src/app/(public)/[locale]/error.tsx:22-24`
  - **What:** Comment cites `FR-3` (reset+home) for the cookie-first locale chain.
  - **Why:** Docs-only confusion for future readers.
  - **Fix:** Change `FR-3` to `FR-1` (or drop the ID).
  - **Requirement:** none
  - **Test gap:** none
- **F3 — Same wrong citation in global boundary comment**
  - **File:** `src/app/global-error.tsx:29-30`
  - **What:** Same `FR-3` citation for the cookie-first chain.
  - **Why:** Docs-only; same confusion as F2.
  - **Fix:** Change `FR-3` to `FR-1` (or drop the ID).
  - **Requirement:** none
  - **Test gap:** none
- **F4 — Production-gate comment overclaims per-artifact behavior**
  - **File:** `src/app/(public)/[locale]/boom/page.tsx:24-25`
  - **What:** Comment claims the same artifact 404s outside the e2e run, but
    the page prerenders, so the flag value is baked per build.
  - **Why:** Inaccurate comment; production 404 holds because production
    builds omit the flag, not because one artifact behaves both ways.
  - **Fix:** Reword neutrally: the flag is set only by the e2e harness build;
    every other build omits it, so the route 404s in every other deployment.
  - **Requirement:** FR-5
  - **Test gap:** none

## Overrides

- none

## Plan compliance

Both implementation phases have `Result: verified`, checkpoints, and evidence
with primary-run verification. Every `[x]` task was implemented; no task
dropped. The final diff stays within the union of `Touches` except two
reported deviations (segment URL-locale preference; `e2e-run.ts` harness flag
for the FR-5 production gate) — both accepted as the smallest correct change.

## Out of scope

- none

## Debt

- none (all findings go to Phase R1)

## Doc sync

`none` — the review fixes needed no doc changes; the pre-review tech-stack
notes (Sentry boundary reporting, `E2E_TEST_ROUTES` harness flag) remain
accurate after R1.

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BLOCK | 0 | 0 | 1 | 3 | 0 |
| 2 | PASS | 0 | 0 | 0 | 0 | 4 (F1–F4 fixed in `5239241`, re-verified by primary: typecheck 275 clean, lint 268 clean, 831 pass) |
