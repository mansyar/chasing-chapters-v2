# Phase 4 Evidence — R2 evidence screenshots

- Track: 20261027-typography-residuals — Typography residuals
- Phase: 4 — R2 evidence screenshots
- Date: 2026-10-27 (UTC)
- Branch: refactor/20261027-typography-residuals
- Phase base: 088cfcb4ec7569349552fbdbf7269bd6c8cb649e
- Head: <checkpoint>
- Result: **verified**

## Summary

The subagent wrote the capture script but could not execute it (no shell
access — the documented handoff case), so the primary ran the capture. All
four reading-lists index screenshots exist with non-trivial sizes, the dark
pair carries the `dark` class assertion inside the script (it refuses to
capture on theme mismatch and exited 0), and both spot-checked images render
the page correctly: EN dark shows the new card look on a dark background,
ID light shows the localized heading, badge, nav and footer. The dev server
was stopped afterwards; port 3000 is free.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| capture | `bun .conductor/media/20261027-typography-residuals/capture.ts` | 0 | All four screenshots captured against local `bun run dev` on port 3000 |
| files | four PNGs under `.conductor/media/20261027-typography-residuals/` | 0 | `reading-lists-en-light.png` 98 KB, `reading-lists-en-dark.png` 90 KB, `reading-lists-id-light.png` 94 KB, `reading-lists-id-dark.png` 86 KB — full-page, non-trivial, theme-correct |
| git | `git status --porcelain` | 0 | Clean apart from this evidence file (media dir is gitignored) |

## Findings

| Task | What changed | Test | Status |
| --- | --- | --- | --- |
| P4.T1 (FR-2, AC-3) | Capture script (subagent): Playwright, `BASE_URL` constant, dual `colorScheme` contexts driving next-themes system mode, `dark`-class assertion with retry, refusal on mismatch. Execution (primary): dev server on 3000, capture run exit 0, four PNGs verified by size, two spot-checked visually, server stopped | Capture script exit 0 + file sizes + visual spot-check | done |

## Evidence paths

- Script: `.conductor/media/20261027-typography-residuals/capture.ts`
- Screenshots: `.conductor/media/20261027-typography-residuals/reading-lists-{en,id}-{light,dark}.png` (gitignored PR media)

## Deviations

Execution split: script by subagent, execution by primary — the sanctioned
permission-denied handoff, recorded here instead of a blocker.

## Notes

- The screenshots double as the first human eyeball on the new card look
  (residual R2's sign-off): the card renders correctly in both modes and
  both locales — cover area with book icon, "4 books"/"4 buku" badge,
  title, clamped description.
- Seeded local data holds one reading list (the e2e fixture); the shots
  document the card look, not a full grid.
- The dev-server log showed a pre-existing hydration-mismatch warning
  (`caret-color` on the search input) and the usual dev-only
  `eval() is not supported` CSP notes — both unrelated to this track and
  left untouched.

## Primary verification

The primary executed the capture directly (the subagent has no shell
access): started `bun run dev` in the background, confirmed the index
returned 200, ran the capture script to exit 0, verified all four PNGs by
size, read the EN-dark and ID-light shots to confirm correct rendering,
then terminated the dev-server process and confirmed port 3000 free.
