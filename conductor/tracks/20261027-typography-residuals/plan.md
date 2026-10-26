# Typography residuals — Implementation Plan

> **Branch:** `refactor/20261027-typography-residuals`
> **Base:** `main` @ `1fde725338f5e284130ed38581fb786218092711`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: React render harness for typography components

- **Goal:** Rendered-output assertions replace source assertions for the Card chrome consolidation, Breadcrumbs, and StarRating call sites.
- **Depends on:** none
- **Covers:** FR-1, AC-1, AC-2
- **Touches:** `src/lib/__tests__/helpers/*`, `src/components/__tests__/*`, `src/lib/__tests__/typography-source.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 1c27059
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-1.md

- [x] **P1.T1: Render harness helper** — covers: FR-1
  - [x] **P1.T1.1: Shared `renderToStaticMarkup` helper with server-component boundary documented**
- [x] **P1.T2: Card chrome rendered-identity assertions** — covers: FR-1, AC-1
- [x] **P1.T3: Convert Breadcrumbs/StarRating source assertions to render assertions** — covers: FR-1, AC-2

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-1.md
-->

## Phase 2: Neighbour-page revalidation on review changes

- **Goal:** Publishing, unpublishing, or updating a review also revalidates its prev/next neighbours' pages in both locales; no-neighbour case is a safe no-op.
- **Depends on:** none
- **Covers:** FR-3, AC-4, AC-5
- **Touches:** `src/hooks/revalidatePages.ts`, `src/hooks/__tests__/revalidatePages.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 222699d
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-2.md

- [x] **P2.T1: Neighbour lookup + revalidation in `revalidateReviewPages`** — covers: FR-3, AC-4
  - [x] **P2.T1.1: Reuse publishDate neighbour ordering; both locales via `localizedPaths`**
- [x] **P2.T2: No-neighbour / draft edge cases** — covers: FR-3, AC-5

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-2.md
-->

## Phase 3: Dead hook removal + plugin guard test

- **Goal:** Dead CSS hook gone; `prose-teal` coverage pinned against the installed plugin so upgrades fail loudly instead of silently untheming.
- **Depends on:** none
- **Covers:** FR-4, FR-5, AC-6, AC-7
- **Touches:** `src/components/ui/card.tsx`, `src/lib/__tests__/typography-*.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** 3154bb5
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-3.md

- [ ] **P3.T1: Remove unreachable `has-data-[slot=card-action]` hook** — covers: FR-4, AC-6
- [ ] **P3.T2: Plugin-derived variable guard test** — covers: FR-5, AC-7
  - [ ] **P3.T2.1: Enumerate `--tw-prose-*` from installed `@tailwindcss/typography`, assert each mapped in `prose-teal`**

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-3.md
-->

## Phase 4: R2 evidence screenshots

- **Goal:** Reading-lists index screenshots (EN+ID, light+dark) captured and attached to the PR for human sign-off; track does not complete without approval.
- **Depends on:** Phase 1
- **Covers:** FR-2, AC-3
- **Touches:** `.conductor/media/20261027-typography-residuals/*`
- **Verification:** `bun .conductor/media/20261027-typography-residuals/capture.ts`
- **Status:** pending

- [ ] **P4.T1: Capture and attach the four screenshots** — covers: FR-2, AC-3

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-typography-residuals/verification/phase-4.md
-->

<!--
Review fixes are appended by `conductor-review` as:

## Phase R<n>: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 4
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R<n>.T1: Resolve <finding ID>** — covers: <finding ID>
-->
