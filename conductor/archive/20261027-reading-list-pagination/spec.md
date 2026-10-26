# Reading-List Pagination Parity — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

The reading-lists index (`/[locale]/reading-lists`) gains the same server-side pagination the reviews index already has: 9 lists per page driven by a `?page=` search param, with the reviews-style numbered pager (prev/next). This bounds an index query that today fetches every published list in one unbounded `payload.find`.

## Problem / Motivation

`src/app/(public)/[locale]/reading-lists/page.tsx` (lines 43–52) calls `payload.find` with no `limit`/`page` — every published reading list is loaded on every index render. The sibling reviews index paginates at 9 per page with a `totalPages` pager (`reviews/page.tsx` lines 66–125, 307+). As the library grows, the reading-lists index gets slower and heavier with no ceiling; readers also get no way to navigate a long index. If unsolved, index render cost grows linearly with content and the two indexes stay inconsistent.

## Goals & Success Metrics

- **Goal:** Reading-lists index query cost is bounded and the pager matches reviews-index behavior.
- **Metric:** Index `payload.find` always carries `limit: 9` + `page`; pager navigates pages in both locales; `bun test` + e2e pager flow pass.

## Scope

### In Scope

- `?page=` param parsing on the reading-lists index (same `Number(page) || 1` semantics as reviews)
- Paginated `payload.find` (`limit: 9`, `page: currentPage`, locale preserved)
- Reviews-pattern numbered pager UI (prev/next + page numbers) on the reading-lists index
- Per-page ItemList JSON-LD (lists the current page's items)
- Empty state preserved when zero lists exist
- Unit + e2e coverage (EN + ID) for the pager flow

### Out of Scope

- Search, sort, or genre/tag filters on reading-lists
- ISR window changes (`revalidate = 60` untouched)
- Sitemap changes
- Paginating the reading-list *detail* page or any other surface

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | The reading-lists index reads `?page=` and renders that page, defaulting to page 1 for missing/non-numeric values | must |
| FR-2 | The index query passes `limit: 9` and `page: currentPage` with the request locale | must |
| FR-3 | The index renders a pager (prev/next + numbered pages) in the reviews-index pattern whenever `totalPages > 1` | must |
| FR-4 | Pager links preserve the `?page=` scheme with no other-param handling (no filters exist on this index) | must |
| FR-5 | ItemList JSON-LD reflects the current page's items | should |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Index query cost is bounded regardless of total published lists (limit 9) |
| NFR-2 | ISR behavior unchanged (`revalidate = 60`) |
| NFR-3 | Pager meets the same accessibility bar as the reviews pager (keyboard-reachable links, touch-sized targets) |
| NFR-4 | EN and ID indexes paginate identically (bilingual parity) |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | `/en/reading-lists` renders at most 9 lists and a pager appears when more than 9 published lists exist | FR-2, FR-3 |
| AC-2 | `?page=2` renders the second slice; page-1 items do not repeat on page 2 | FR-1, FR-2 |
| AC-3 | `?page=abc` and missing `?page=` both render page 1 | FR-1 |
| AC-4 | Out-of-range `?page=` (0, negative, beyond totalPages) behaves exactly as the reviews index does today | FR-1 |
| AC-5 | `?page=1` renders the same content as the clean URL with no redirect | FR-1 |
| AC-6 | Empty library still renders the existing empty state, pager hidden | FR-3 |
| AC-7 | JSON-LD ItemList contains only the current page's lists | FR-5 |
| AC-8 | Pager flow passes Playwright e2e in both `/en` and `/id` | FR-1, FR-3, FR-4 |

## Edge Cases

- Non-numeric `?page=` → page 1 (mirrors reviews)
- `?page=0` / negative / beyond `totalPages` → mirror reviews behavior (no new redirect/clamp logic)
- Zero published lists → empty state, no pager
- Exactly 9 lists → single page, no pager (`totalPages > 1` gate)
- Locale preserved across pager links (`/id/reading-lists?page=2` stays Indonesian)

## Dependencies

- **Tracks:** none (reviews pager is an in-repo pattern reference, not a track dependency)
- **External:** none

## Open Questions & Assumptions

- **Assumption:** Reviews-index pager markup/styling is the pattern to copy; minor structural adaptation for the lists grid is allowed.
- **Assumption:** `totalPages` from `payload.find` is the page-count source, as on the reviews index.
- **Assumption:** No `page` clamping/redirect SEO work — deferred; mirrors reviews.

## References

- `src/app/(public)/[locale]/reading-lists/page.tsx` (unbounded query, lines 43–52)
- `src/app/(public)/[locale]/reviews/page.tsx` (pagination pattern: `?page=` line 61–72, query 117–125, pager 307+)
