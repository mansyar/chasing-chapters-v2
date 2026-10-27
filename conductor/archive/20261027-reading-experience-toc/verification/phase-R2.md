# Phase R2 Evidence — CI-Red Fix (IntersectionObserver rootMargin)

- Track: 20261027-reading-experience-toc ("Review Reading Experience + TOC")
- Phase: R2 (Fix production-only IntersectionObserver crash)
- Date: 2026-10-27
- Branch: feat/20261027-reading-experience-toc
- Base: 0c365e1df27fd9774afb8a06e6289499f47a6891
- Head: a2fdde8 (commits: 46f2577 fix, a2fdde8 test)
- Result: **failed** — typecheck, lint, and unit tests pass; `bun run build`
  fails on a Windows file lock (`EPERM` unlinking a stale
  `.next/standalone/.../libvips-42.dll`) unrelated to this change. Two
  verification fix rounds were used (both Biome formatting); per the brief, no
  third round was attempted.

## Commands (in brief order)

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 291 files |
| static | `bun run lint` | 0 | `biome check .` clean across 286 files (after 2 formatting fix rounds on the new comment block) |
| unit | `bun test` | 0 | 882 pass, 0 fail across 66 files (incl. the new rootMargin regression test; 7/7 in TableOfContents.test.ts) |
| build | `bun run build` | 1 | `EPERM: operation not permitted, unlink '.../.next/standalone/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll'` — stale-output file lock, retried once with identical output |

Full output of the final chain is in the phase transcript (m0027); the lone
build retry in m0028.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| R2.T1 | rootMargin uses px only (`-96px`, keep `-70%`) + comment stating the px/% constraint | `src/components/reviews/TableOfContents.tsx` (~line 53-57), commit 46f2577 | done |
| R2.T2 | Regression test asserts every rootMargin token matches `/^-?\d+(\.\d+)?(px|%)$/`; fails on old `-6rem`, passes on fix | `src/components/reviews/__tests__/TableOfContents.test.ts` (new test), commit a2fdde8; `-6rem` cannot match the regex (suffix must be `px`/`%`), `-96px`/`0px`/`-70%` all match | done |

## Deviations

- The brief asked for the test to capture constructor options "via the
  existing mock". No IntersectionObserver mock exists anywhere in the repo
  (verified by search; the suite's `renderStatic` harness renders server-only
  markup and never runs effects, and there is no DOM harness dependency).
  The regression test pins the `rootMargin` option at the source level with
  `readFileSync`, following the repo's established source-assertion convention
  (`StarRating.test.ts`, `comment-fetch-state.test.ts`), with a comment
  explaining why.
- Evidence written to `verification/phase-R2.md` per the brief and left
  uncommitted (primary squashes); the two source/test commits above are
  committed.

## Notes

- Fix rounds used: 2 (both Biome indentation of the added comment block;
  no logic changes). The build EPERM is environmental — recommend the primary
  stop any running dev server (or clear the locked `.next` output) and re-run
  `bun run build`; no change to the two touched files can address it.

## R2.T3 round — Deterministic scrollspy in real browsers

- Date: 2026-10-27
- Head: 5cc040b (commits, in order: 7e7f186 T3a, 0ad1dec T3b, b74c82b T3c,
  02c4c0d T3d, 5cc040b verification-format fix)
- Result: **verified** — all four layers pass; the earlier `.next` file-lock
  EPERM did not recur.

## Commands (in brief order)

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 291 files |
| static | `bun run lint` | 0 | `biome check .` clean across 286 files (after 1 formatting fix round on a long assertion line in the new test) |
| unit | `bun test` | 0 | 884 pass, 0 fail across 66 files (incl. 9/9 in TableOfContents.test.ts) |
| build | `bun run build` | 0 | Production build completed; only pre-existing google-gax `package.json` warnings |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| R2.T3a | Observer picks intersecting entry nearest viewport top (`boundingClientRect.top`, document-order tie-break via `targets`), with determinism comment | `src/components/reviews/TableOfContents.tsx` (observer callback), commit 7e7f186 | done |
| R2.T3b | Click sets 800ms `useRef` timestamp lock in `scrollToEntry`; observer returns early while lock is fresh, with race comment | Same file (lock ref + early return + setter), commit 0ad1dec | done |
| R2.T3c | Empty band within 4px of document bottom sets slug to last entry; no slug clearing in any other empty case, with comment | Same file (bottom-of-page branch), commit b74c82b | done |
| R2.T3d | Static render asserts no `aria-current` pre-click + source pins `setActiveSlug(slug)`/`aria-current` wiring; source pins `boundingClientRect.top`, `lastClickAt`/`800`, `scrollHeight`/last-entry slug | `src/components/reviews/__tests__/TableOfContents.test.ts` (2 new tests), commit 02c4c0d | done |

## Notes

- Fix rounds used: 1 (Biome line-wrap of one long `toContain` assertion;
  no logic changes; committed as 5cc040b per the no-amend rule rather than
  folded into the test commit).
- e2e (`e2e/review-toc.spec.ts`) deliberately not run — primary owns the prod
  re-run per the brief.

## R2.T4 round — Scroll-position scrollspy (observer band removed)

- Date: 2026-10-27
- Head: n/a — no commits made (see blockers); the R2.T4a + R2.T4b edits sit
  uncommitted in the working tree
- Result: **blocked** — both source edits are complete, but the verification
  chain could not be executed (shell access denied for this executor), so no
  layer is evidenced and nothing is committed.

## Changes (uncommitted)

| File | Change |
| --- | --- |
| `src/components/reviews/TableOfContents.tsx` | R2.T4a: removed the `IntersectionObserver` (and its `rootMargin`, threshold, deterministic nearest-top selection, and bottom-of-page special case); added a `CLICK_LOCK_MS = 800` module constant and an rAF-throttled `scroll` + `resize` listener with an initial compute. Rule: active = the last entry (document order) whose heading `getBoundingClientRect().top <= window.innerHeight` (the last heading that has appeared on screen); default to the first entry when none qualify. The scroll handler returns early while the click lock is fresh; listeners + the scheduled frame clean up on unmount. Comments state the rule and why the observer band could not satisfy it (bottom-landed headings vs article-followed-by-comments layout). |
| `src/components/reviews/__tests__/TableOfContents.test.ts` | R2.T4b: removed the obsolete R2.T2 `rootMargin` source pin (no observer, no `rootMargin` remains); replaced the deterministic/click-authority/bottom-aware pin with a reading-position pin — asserts no `new IntersectionObserver` construction and no `rootMargin`, pins `getBoundingClientRect` + `innerHeight`, `lastClickAt` + `CLICK_LOCK_MS = 800`, and `removeEventListener` + `cancelAnimationFrame` cleanup. The click-path `aria-current` test is unchanged and still applies (`setActiveSlug(slug)` + `aria-current` wiring untouched). |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| R2.T4a | Scroll-position rule replaces the observer band; click-lock kept as a named 800ms constant; listeners + rAF clean up | `TableOfContents.tsx` effect + `CLICK_LOCK_MS` (working tree, uncommitted) | unverified |
| R2.T4b | Obsolete rootMargin pin removed; click-path assertions kept green; lock-duration rule pinned without overfitting | `TableOfContents.test.ts` (working tree, uncommitted) | unverified |

## Commands (in brief order)

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | not run | shell denied (`permission.rejected`) |
| static | `bun run lint` | not run | shell denied (`permission.rejected`) |
| unit | `bun test` | not run | shell denied (`permission.rejected`) |
| build | `bun run build` | not run | shell denied (`permission.rejected`) |

No fix rounds used (no layer could be executed; per the brief no third round
question arose — the blocker is tooling, not a failing check).

## Confirmation

- No `IntersectionObserver` construction, `rootMargin`, `scrollHeight`
  bottom-of-page branch, `observer.observe/disconnect`, or threshold code
  remains in `TableOfContents.tsx` (verified by repo search; the word
  "IntersectionObserver" appears once, in the comment explaining why the band
  was removed, as the brief requires).
- No spec/plan/metadata/e2e files touched; no `git` operations performed.

## For the primary

1. Review the two-file diff, then commit TDD-style in order: (1) the test
   changes (`test(reviews): ...`), (2) the implementation
   (`fix(reviews): ...`).
2. Run `bun run typecheck && bun run lint && bun test && bun run build`
   (max two fix rounds), then the prod `e2e/review-toc.spec.ts` re-run —
   `:52` ("scrolling the article updates the active TOC link") is the test
   this round targets.
