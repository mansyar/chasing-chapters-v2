# Review: Review Reading Experience + TOC

- **Track:** `20261027-reading-experience-toc`
- **Type:** `feature`
- **Branch:** `feat/20261027-reading-experience-toc`
- **Range:** `e1b7068..715c8ee`
- **Date:** `2026-10-27`
- **Verdict:** `approved` (round 2 re-review; merge gated on F2 — `e2e/review-toc.spec.ts` green in CI)

## Summary

The track delivers a review reading experience: TOC extraction + reading-time
libs (Phase 1), sticky/mobile TableOfContents with scrollspy, SSR anchor ids,
deep-link + copy-link, and quote share buttons (Phase 2), EN/ID parity plus a
new `e2e/review-toc.spec.ts` (Phase 3). An independent read-only reviewer
examined the diff (26 files, +2242/−13) against spec, plan, style guides, and
the primary's re-run checks, and returned PASS WITH FINDINGS: 2 Medium, 3 Low,
no Critical/High, no style-guide violations. Phase R1 resolves F1, F3, F4, F5;
F2 (live e2e execution) is owned by CI before merge.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| test | `bun test` | pass | 881 pass / 0 fail, 66 files (866 pre-track → 881; +15 new TOC/reading-time/share/parity cases) |
| lint | `bun run lint` | pass | biome clean, 286 files |
| typecheck | `bun run typecheck` | pass | 291 files, 0 errors |
| build | `bun run build` | pass | full production build; review routes prerender |
| e2e | `e2e/review-toc.spec.ts` | not-run | statically verified (typecheck + lint clean); needs DB + production server — must go green in CI before merge (F2) |

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | P2.T1 | `TableOfContents.test.ts` + e2e desktop/mobile suites (pending run) | covered |
| FR-2 | P1.T1 | `toc-extract.test.ts` | covered |
| FR-3 | P2.T1 + R1.T1 | click test + new scroll-driven e2e test (pending run) | covered |
| FR-4 | P2.T2 | `review-body.test.ts` + e2e deep-link/copy-link (pending run) | covered |
| FR-5 | P1.T2 | `reading-time.test.ts` + e2e badge assertions (pending run) | covered |
| FR-6 | P2.T3 + R1.T2 | `QuoteShare.test.ts` incl. share-stub cases + e2e quote-copy (pending run; share path skipped by design) | covered |
| FR-7 | P3.T1 | `dictionary.test.ts` parity + e2e Indonesian suite (pending run) | covered |
| AC-1 | P2.T1 | component tests + e2e (pending run) | covered |
| AC-2 | P1.T1 | `toc-extract.test.ts` document-order/omission cases | covered |
| AC-3 | P2.T1 + R1.T1 | scroll-driven e2e assertion added (pending run) | covered |
| AC-4 | P2.T2 | slug/id wiring tests + e2e (pending run) | covered |
| AC-5 | P1.T2 | ceiling/floor/per-locale cases | covered |
| AC-6 | P2.T3 + R1.T2 | quote-copy e2e (pending run); share path stub-tested | covered |
| AC-7 | P3.T1 | parity + source-scan tests + e2e Indonesian suite (pending run) | covered |
| AC-8 | P1.T1 + P2.T1 | `hasTableOfContents` gate + null-render tests | covered |
| AC-9 | P3.T2 | all static layers exit 0; e2e layer pending CI | partial (F2) |
| AC-10 | P3.T2 | token/target/focus assertions + e2e reduced-motion/keyboard (pending run) | covered |
| NFR-1..NFR-5 | P1–R1 | no package.json change; 44px assertions; nav aria-label + focus-visible; bg-card tokens; lib unit tests | covered |

## Findings

| ID | Severity | File | Disposition |
| --- | --- | --- | --- |
| F1 | Medium | `TableOfContents.tsx` (observer path untested) | fixed in R1.T1: scroll-driven e2e test added (`scrollIntoViewIfNeeded` + `aria-current` expectation) |
| F2 | Medium | `e2e/review-toc.spec.ts` (never executed) | open: must go green in CI before merge; recorded as AC-9 partial |
| F3 | Low | `QuoteShare.tsx` (share branch untested) | fixed in R1.T2: `navigator.share` stub unit tests (resolve / AbortError / fallthrough) |
| F4 | Low | `TableOfContents.tsx` (dual-instance state) | fixed in R1.T3: accepted with explanatory code comment, no behavior change |
| F5 | Low | `section-heading.tsx` (h1→h3 skip) | fixed in R1.T4: fixed sections render as `h2`, visual classes unchanged |

## Deviations

- `src/lib/i18n/dictionary.ts` (outside Phase 1–2 Touches): review-label keys added — smallest necessary change, permitted by briefs.
- `dictionary-source.test.ts` scan now excludes `__tests__` segments: test files must contain expected literals to assert rendered output and never ship; public-tree guard unchanged (primary fix, inside Touches).

## Round 3 (final, post-R2/R3) — approve-with-followups

Scope: `31a9715..HEAD` — R2 (observer → scroll-position scrollspy rewrite after the production-only `rootMargin: "-6rem"` SyntaxError crashed all 26 CI review-page renders; plus deterministic-selection and click-lock intermediates), R3 (share-button exact-name e2e scoping), close-out move to `archive/`. CI fully green on the branch (static, Docker, full E2E). Verdict: approve, no blockers; F1/F2 fixed pre-merge, F3–F5 accepted as-is.

## Findings (all Low)

| ID | Severity | File | Disposition |
| --- | --- | --- | --- |
| F1 | Low | `spec.md` FR-3/NFR-1 (still named IntersectionObserver) | fixed pre-merge: wording amended to scroll-position rule with R2 rationale, IDs unchanged |
| F2 | Low | `e2e/review-toc.spec.ts:61` (stale "observer owns" comment) | fixed pre-merge: reworded to scroll-position handler |
| F3 | Low | `TableOfContents.test.ts` (pins tokens, not the comparison rule) | accepted: renderStatic cannot run effects; e2e `:52` owns the behavior |
| F4 | Low | `CLICK_LOCK_MS = 800` (short manual-scroll dead zone; long smooth scrolls can outlast it) | accepted: transient highlight lag only, no wrong navigation; revisit only if e2e flakes |
| F5 | Low | initial highlight favors last entry on fully-visible short articles; dual mobile/desktop listeners (pre-existing) | accepted: awareness only, no leak (cleanup verified), negligible cost |

## Deviations (round 3)

- `e2e/review-detail.spec.ts` (outside R2 Touches): fuzzy `/share/i` assertion scoped to `{ name: "Share", exact: true }` — required by the track's own new "Share quote" buttons; original intent preserved and uniqueness more strictly enforced.
