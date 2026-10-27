# Review Reading Experience + TOC — Implementation Plan

> **Branch:** `feat/20261027-reading-experience-toc`
> **Base:** `main` @ `e1b7068a2780cf7fe8f80981bc9b0014b65437be`
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, or `blocked`.
> Only the primary agent writes this file. Phase subagents report results and the
> primary records them.

## Phase 1: Heading extraction + reading-time libs

- **Goal:** Pure extraction and reading-time functions with unit tests green
- **Depends on:** none
- **Covers:** FR-2, FR-5, AC-2, AC-5, AC-8 (logic part)
- **Touches:** `src/lib/toc-extract*`, `src/lib/reading-time*`, `src/lib/__tests__/*`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified

- [x] **P1.T1: TOC extraction lib** — covers: FR-2
  - [x] **P1.T1.1: Slugify + dedupe** — unique stable slugs, emoji/special-char handling, `section-<index>` fallback
  - [x] **P1.T1.2: Lexical H2/H3 walk + fixed-sections merge** — document order, missing sections omitted, <2 entries flag
- [x] **P1.T2: Reading-time lib** — covers: FR-5
  - [x] **P1.T2.1: Word count across Lexical nodes** — body + whatILoved/couldBeBetter/perfectFor + quotes, per locale
  - [x] **P1.T2.2: Formatter + dictionary keys** — 200wpm ceiling, EN/ID strings

**Result:** verified
**Checkpoint:** f2f94f4
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-1.md

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-1.md
-->

## Phase 2: TOC UI + anchors + quote-share

- **Goal:** Review detail shows sticky/mobile TOC with scrollspy, anchors deep-link, quotes shareable
- **Depends on:** Phase 1
- **Covers:** FR-1, FR-3, FR-4, FR-6, AC-1, AC-3, AC-4, AC-6
- **Touches:** `src/components/reviews/TableOfContents*`, `src/components/reviews/QuoteShare*`, `src/app/(public)/[locale]/reviews/[slug]/*`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** pending

- [ ] **P2.T1: TableOfContents component** — covers: FR-1
  - [ ] **P2.T1.1: Markup + responsive** — sticky aside lg+, collapsible mobile, hide when <2 entries, 44px targets
  - [ ] **P2.T1.2: Scrollspy** — IntersectionObserver active link, smooth scroll (instant on reduced-motion), focus-visible
- [ ] **P2.T2: Anchor IDs + deep-link + copy-link** — covers: FR-4
- [ ] **P2.T3: Quote share buttons** — covers: FR-6

<!--
The primary appends after acceptance:
**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/20261027-reading-experience-toc/verification/phase-2.md
-->

## Phase 3: i18n parity + e2e + polish

- **Goal:** EN/ID parity proven, e2e covers navigation/anchors/share, a11y/dark-mode clean
- **Depends on:** Phase 2
- **Covers:** FR-7, AC-7, AC-9, AC-10, NFR-1..NFR-5
- **Touches:** `src/lib/i18n/*`, `e2e/*`, `src/app/(public)/[locale]/reviews/[slug]/*`
- **Verification:** `bun run typecheck && bun run lint && bun test && bun run build`
- **Status:** pending

- [ ] **P3.T1: Dictionary + per-locale integration** — covers: FR-7
- [ ] **P3.T2: E2E + a11y polish** — covers: AC-7, AC-10

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings ...
- **Depends on:** Phase 3
- **Covers:** review findings
- **Touches:** ...
- **Verification:** ...
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** — covers: <finding ID>
-->
