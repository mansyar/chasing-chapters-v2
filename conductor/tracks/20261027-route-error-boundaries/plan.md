# Route Error Boundaries — Implementation Plan

> **Branch:** `feat/20261027-route-error-boundaries`
> **Base:** `main` @ `c46f3c14469a98dde07ae0af82ea3481c0ca7ec2`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Boundaries, locale resolution, Sentry reporting + unit tests

- **Goal:** Root `global-error` and `[locale]/error.tsx` render the branded bilingual UI with reset + home, report to Sentry, covered by unit tests.
- **Depends on:** none
- **Covers:** FR-1, FR-2, FR-3, FR-4, NFR-1, NFR-2, NFR-3, NFR-4, AC-3, AC-4, AC-5
- **Touches:** `src/app/global-error.tsx`, `src/app/(public)/[locale]/error.tsx`, `src/lib/i18n/*`, `src/lib/error-locale*.ts`, `src/components/error*.tsx`, co-located `__tests__/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 9349c9e
**Evidence:** conductor/tracks/20261027-route-error-boundaries/verification/phase-1.md

- [x] **P1.T1: Locale-resolution helper + dictionary entries** — covers: FR-1, NFR-1
  - [x] **P1.T1.1: Cookie→header→EN resolver with unit tests**
  - [x] **P1.T1.2: EN/ID error-UI dictionary entries + key-parity extension**
- [x] **P1.T2: Segment + global boundaries with reset/home** — covers: FR-1, FR-2, FR-3, NFR-4
- [x] **P1.T3: Sentry reporting with route context, UI-independent** — covers: FR-4, AC-4, AC-5

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-route-error-boundaries/verification/phase-1.md
-->

## Phase 2: Forced-error trigger + bilingual e2e

- **Goal:** E2e spec forces segment errors and asserts branded EN/ID UI, working recovery, and no leaked internals.
- **Depends on:** Phase 1
- **Covers:** FR-5, AC-1, AC-2, AC-6, AC-7
- **Touches:** `e2e/error-boundaries.spec.ts`, test-only trigger (route or query-gated component)
- **Verification:** `bunx playwright test e2e/error-boundaries.spec.ts` then full `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 1015dc3
**Evidence:** conductor/tracks/20261027-route-error-boundaries/verification/phase-2.md

- [x] **P2.T1: Test-only forced-error trigger, unreachable in production UI** — covers: FR-5
- [x] **P2.T2: EN/ID e2e assertions (UI language, reset, home, no stack text)** — covers: AC-1, AC-2, AC-6

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 2
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
