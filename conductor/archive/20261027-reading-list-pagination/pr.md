## Summary

The reading-lists index (`/[locale]/reading-lists`) now paginates exactly like
the reviews index: 9 lists per page driven by `?page=`, with the same
prev/next + numbered pager, per-page ItemList JSON-LD, and an unchanged ISR
window. This bounds an index query that previously fetched every published
list in one unbounded `payload.find`.

## Track

- **ID:** `20261027-reading-list-pagination`
- **Type:** `feature`
- **Spec:** [`conductor/archive/20261027-reading-list-pagination/spec.md`](conductor/archive/20261027-reading-list-pagination/spec.md)
- **Plan:** [`conductor/archive/20261027-reading-list-pagination/plan.md`](conductor/archive/20261027-reading-list-pagination/plan.md)
- **Review:** [`conductor/archive/20261027-reading-list-pagination/review.md`](conductor/archive/20261027-reading-list-pagination/review.md)

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Paginated index query | 9-per-page bounded query, per-page JSON-LD, empty state intact | verified | `b31c88e` | Scaffold `metadata.json` written minified by primary tripped Biome; fixed by primary with `biome check --write`, no code change |
| 2: Pager UI and e2e coverage | Reviews-pattern pager, proven by e2e in EN+ID | verified | `5df5bc4` | e2e spec seeds/removes its own 10 probe lists; shared fixture untouched |

## Requirements

- [x] `FR-1` — `?page=` parsing, page 1 default (test: `e2e/reading-lists-pagination.spec.ts`)
- [x] `FR-2` — `limit: 9` + `page` + locale query (test: `e2e/reading-lists-pagination.spec.ts`)
- [x] `FR-3` — reviews-pattern pager when `totalPages > 1` (test: `e2e/reading-lists-pagination.spec.ts`)
- [x] `FR-4` — locale path + `?page=` pager links (test: `e2e/reading-lists-pagination.spec.ts`)
- [x] `FR-5` — per-page ItemList JSON-LD (code inspection, `verification/phase-1.md`)
- [x] `NFR-1` — bounded query cost (code inspection)
- [x] `NFR-2` — ISR `revalidate = 60` unchanged (diff inspection)
- [x] `NFR-3` — shared Pagination a11y components (code inspection + e2e)
- [x] `NFR-4` — EN/ID parity (test: `e2e/reading-lists-pagination.spec.ts`)
- [x] `AC-1`–`AC-8` — all covered (AC-1/AC-2/AC-8 by e2e, AC-3–AC-7 by inspection)

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| unit | `bun test` | pass | 813 pass / 0 fail — `conductor/archive/20261027-reading-list-pagination/verification/integrated.md` |
| lint | `bun run lint` | pass | Biome clean, 260 files |
| typecheck | `bun run typecheck` | pass | No errors, 267 files |
| build | `bun run build` | pass | Production standalone build succeeds |
| e2e | `bun run test:e2e -- reading-lists-pagination` | pass | 6/6 chromium |

## Media

![Reading-lists pager on page 2](https://github.com/user-attachments/assets/26d622f3-520b-4d7c-81b1-9ccd5ef0c49e)
Pager on `/en/reading-lists?page=2` (10 temporary probe lists + fixture;
probes removed after capture). Captured at `5df5bc4` via dev server.

## Review

- **Verdict:** `PASS`
- **Rounds:** 1
- **Fixed:** 0 findings
- **Accepted/deferred:** 0

## Deviations and risks

- None. Final diff stays within the union of phase `Touches`; no deviations reported.

## Follow-ups

- none

## Rollback

```bash
# Merge commit
git revert --no-edit -m 1 <merge-commit>

# Squash commit
git revert --no-edit <squash-commit>
```

No migrations, feature flags, or data changes — reverting the squash commit
fully restores the unbounded index.

