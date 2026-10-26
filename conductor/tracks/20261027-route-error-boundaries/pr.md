## Summary

Route error boundaries for the public site: a locale-aware segment boundary
(`[locale]/error`) plus a hardened root boundary (`global-error`), both
rendering a branded, bilingual error UI (reset + home) with no internals
leaked, and reporting to Sentry with route/locale context. A test-only
`/boom` trigger (404 unless the e2e harness sets `E2E_TEST_ROUTES=1`)
proves the behavior in EN + ID e2e.

## Track

- **ID:** `20261027-route-error-boundaries`
- **Type:** `feature`
- **Spec:** [`conductor/archive/20261027-route-error-boundaries/spec.md`](conductor/archive/20261027-route-error-boundaries/spec.md)
- **Plan:** [`conductor/archive/20261027-route-error-boundaries/plan.md`](conductor/archive/20261027-route-error-boundaries/plan.md)
- **Review:** [`conductor/archive/20261027-route-error-boundaries/review.md`](conductor/archive/20261027-route-error-boundaries/review.md)

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Boundaries, locale resolution, Sentry reporting + unit tests | Segment + root UI, cookie→header→EN resolver, Sentry reporter, 13 unit tests | verified | `9349c9e` | Primary fixed 3 biome findings, squashed; subagent had no shell |
| 2: Forced-error trigger + bilingual e2e | `/boom` test route, EN/ID e2e (4 tests) | verified | `1015dc3` | Primary added production gate (`E2E_TEST_ROUTES`), fixed spec alert scoping |
| R1: Review Fixes | F1 navigator.languages + F2–F4 comment accuracy | verified | `5239241` | +1 regression test; re-review PASS |

## Requirements

- [x] `FR-1` — Catch failures at the public route segment and root (`src/app/(public)/[locale]/error.tsx`, `src/app/global-error.tsx`)
- [x] `FR-2` — Locale-aware messaging, same UI in EN and ID (`src/components/error-content.tsx`, `src/lib/error-locale.ts`, dictionary `error*` entries)
- [x] `FR-3` — Retry on the spot plus a way home (`ErrorContent` Try Again + Back Home)
- [x] `FR-4` — Report errors to Sentry with context, without changing UI rendering (`reportErrorToSentry`)
- [x] `FR-5` — Test-only trigger, never reachable in production UI (`/[locale]/boom`, 404 unless harness flag)
- [x] `NFR-1` — Brand, tone, and bilingual parity
- [x] `NFR-2` — No raw error details shown (e2e asserts no message/digest/Call Stack)
- [x] `NFR-3` — No new capture/reporting dependencies (existing `@sentry/nextjs` only)
- [x] `NFR-4` — Accessible via keyboard/screen reader (`role="alert"`, native Button/Link)
- [x] `AC-1` — EN segment error shows branded UI with working reset + home
- [x] `AC-2` — Same in ID
- [x] `AC-3` — Unusable locale falls back cookie → header → EN
- [x] `AC-4` — Sentry receives an event with route context
- [x] `AC-5` — A Sentry outage cannot break the rendered UI
- [x] `AC-6` — No stack trace or digest text in UI output
- [x] `AC-7` — typecheck + lint + tests + e2e all pass

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | pass | 275 files, 0 errors |
| lint | `bun run lint` | pass | 268 files clean |
| unit | `bun test` | pass | 831 pass / 0 fail |
| coverage | `bun test --coverage` | pass | `error-locale.ts` 100% funcs / 94.87% lines (gate 80%) |
| e2e | `bun run test:e2e -- e2e/error-boundaries.spec.ts` | pass | 4/4 against production build + seeded DB |
| build | production build via e2e harness | pass | harness built on final tree |

Full trail: `conductor/archive/20261027-route-error-boundaries/verification/`.

## Media

![English error UI](./error-en.png)
![Indonesian error UI](./error-id.png)

## Review

- **Verdict:** `PASS`
- **Rounds:** 2 (round 1 BLOCK: 1 Medium + 3 Low; all fixed in R1)
- **Fixed:** 4 findings
- **Accepted/deferred:** 0

## Deviations and risks

- Segment boundary prefers a valid URL locale before the cookie→header→EN
  chain; spec edge case recorded and accepted.
- `/boom` production gate touches `src/scripts/e2e-run.ts` (harness sets
  `E2E_TEST_ROUTES=1` in the child env) — smallest change satisfying "never
  reachable in production". Production builds omit the flag, so the route
  prerenders as 404.
- Risk: error boundaries only cover render failures, not 404/loading states
  (out of scope per spec).

## Follow-ups

- none

## Rollback

```bash
# Squash commit
git revert --no-edit <squash-commit>
```

No migrations, no feature flags, no data changes. Reverting restores the
previous unbranded Next.js error behavior.
