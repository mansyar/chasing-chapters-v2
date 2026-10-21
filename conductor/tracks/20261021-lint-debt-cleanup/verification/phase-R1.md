# Phase R1 Verification — Review Fixes

- **Date:** 2026-10-21
- **Branch:** `refactor/20261021-lint-debt-cleanup`
- **Phase base:** `e73633a` (review round 1 recorded)
- **Covers:** F1, F2, F3, F4 (review round 1)

## Commands

| Command | Result | Summary |
| --- | --- | --- |
| `bun run typecheck` | pass | 0 errors in 172 files (after F3/F4 fixes) |
| `bun run lint` | pass | 0 warnings, 0 errors, 164 files |
| `bun test` | pass | 236 pass / 0 fail, 454 expect() calls (re-verified by pre-commit hook on each fix commit) |
| `bunx playwright test --workers=1` (repeat run for F1) | pass | 33 passed / 0 failed / 1 conditionally skipped (4.9m), on final code `140e881`, fresh dev server |

> Per-task commit hashes in this file were squashed into the R1 checkpoint
> commit and are no longer reachable; use the R1 checkpoint hash (see
> `plan.md`) for audit.

## Findings resolution

| Finding | Resolution |
| --- | --- |
| F1 (Medium) — AC-6 evidence gap | AC-6 and the spec's Open Questions amendment now name CI-equivalent mode (`--workers=1`) explicitly with the base-proven parallel-mode debt cross-reference. A repeated green full-suite run (33/0/1, fresh dev server) recorded in `verification/integrated.md`. An intermediate run hit the known environmental latency timeout (`e2e-full6.log`, load-dependent, not code-dependent — failure signature base-proven on `d600a92`); documented honestly in integrated.md. |
| F2 (Low) — dead evidence hashes | Squash notes added to `verification/phase-1.md`, `phase-2.md`, `phase-3.md` pointing at reachable checkpoints. Phase 3 `Touches` in `plan.md` now includes `e2e/comments.spec.ts` and `src/scripts/migrate-emails.ts`. |
| F3 (Low) — unjustified `as Author` cast | `src/app/(public)/reviews/[slug]/page.tsx:201` replaced with the sibling `typeof === "object"` narrowing pattern; rendered behavior identical (unpopulated relation → `null`, renders nothing); orphaned `Author` import removed. |
| F4 (Low) — mock type + cast | `reviewContent` made optional in the mock `UpdateArgs` type with a doc comment; explicit throwing guard added at the assertion site (assertion semantics unchanged); `(rt as RichText)` cast retained with a three-line justification comment (fixture shape guaranteed; `RichTextDocument` intentionally keeps traversed fields `unknown`). |

## Deviations

- None beyond the recorded choices in F4 (both fix options were pre-approved
  by the review disposition; the optional+guard variant was the reviewer's
  preferred fix).
