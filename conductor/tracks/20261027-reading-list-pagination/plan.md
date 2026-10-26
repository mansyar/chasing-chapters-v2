# Reading-List Pagination Parity — Implementation Plan

> **Branch:** `feat/20261027-reading-list-pagination`
> **Base:** `main` @ `32b448fbca766fa39c6f604866451084a6b1769c`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Paginated index query

- **Goal:** The reading-lists index serves 9 lists per page from a bounded query, with per-page JSON-LD and the empty state intact.
- **Depends on:** none
- **Covers:** FR-1, FR-2, FR-5, NFR-1, NFR-2, NFR-4, AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- **Touches:** `src/app/(public)/[locale]/reading-lists/page.tsx`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

**Result:** verified
**Checkpoint:** b31c88e
**Evidence:** conductor/tracks/20261027-reading-list-pagination/verification/phase-1.md

- [x] **P1.T1: Parse `?page=` and bound the index query** — covers: FR-1, FR-2
  - [x] **P1.T1.1: Read `page` from searchParams with reviews-identical `Number(page) || 1` semantics**
  - [x] **P1.T1.2: Pass `limit: 9`, `page: currentPage`, locale-preserved `where`/`sort` to `payload.find`**
- [x] **P1.T2: Scope ItemList JSON-LD to the current page** — covers: FR-5
- [x] **P1.T3: Preserve empty state and no-pager single page** — covers: AC-6

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-reading-list-pagination/verification/phase-1.md
-->

## Phase 2: Pager UI and e2e coverage

- **Goal:** Readers can navigate reading-list pages via a reviews-pattern pager, proven by e2e in both locales.
- **Depends on:** Phase 1
- **Covers:** FR-3, FR-4, NFR-3, NFR-4, AC-1, AC-2, AC-8
- **Touches:** `src/app/(public)/[locale]/reading-lists/page.tsx`, `e2e/reading-lists-pagination.spec.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run test:e2e -- reading-lists-pagination`
- **Status:** pending

- [ ] **P2.T1: Render reviews-pattern pager (prev/next + numbers) when `totalPages > 1`** — covers: FR-3, FR-4
  - [ ] **P2.T1.1: Pager links carry locale path and `?page=`**
  - [ ] **P2.T1.2: Pager hidden on single page / empty library**
- [ ] **P2.T2: E2E pager flow in EN and ID** — covers: AC-8
  - [ ] **P2.T2.1: Page-2 slice differs from page 1, invalid `?page=` renders page 1**
  - [ ] **P2.T2.2: Locale preserved across pager navigation**

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
