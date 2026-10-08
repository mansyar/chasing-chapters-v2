# Implementation Plan: PRD Parity — RSS Feed, Sort Options & Cleanup

**Track ID:** prd_parity_20261008
**Branch:** `track/prd-parity`
**Spec:** [spec.md](./spec.md)
**Status:** Pending

> Execution follows `conductor/workflow.md`: TDD for logic-bearing code (Red → Green → Refactor), quality gates per task, git-notes task summaries, and phase verification checkpoints.

## Phase 1: Toolchain Modernization [checkpoint: 42df1d1]

- [x] Task: Verify Bun supports `bun check` (check `bun --version`; upgrade Bun if needed)
  - Document the supported version in the task summary
- [x] Task: Migrate type checking to `bun check` (FR0a) — commit c5b30e8
  - Update `package.json` `typecheck` script: `tsc --noEmit` → `bun check`
  - Update husky pre-commit chain to use `bun check`
  - Update CI workflow(s) that invoke `tsc --noEmit`
  - Update `conductor/workflow.md` Development Commands / pre-commit references
  - Run `bun check`; fix all TS 7 fallout (strict defaults, side-effect CSS imports TS2882, removed compiler options in `tsconfig.json`)
  - Verify: `bun check` exits 0; grep confirms no remaining `tsc --noEmit` invocations
- [x] Task: Adopt Biome, remove ESLint + Prettier (FR0b) — commits 2651e8e, 42df1d1
  - Install Biome; run `biome migrate eslint --write` to port existing ESLint rules where mappable
  - Configure `biome.json` (formatter, linter, ignores for build outputs/generated files)
  - Update `package.json` scripts (`lint`, new `format`), husky pre-commit chain, CI
  - Remove ESLint, plugins, `eslint-config-next`, and Prettier packages + config files
  - Dedicated full-repo reformat commit (`style: adopt Biome and reformat codebase`)
  - Verify: `biome check .` passes; `bun run lint` uses Biome; no ESLint/Prettier remnants in package.json or configs
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — checkpoint 42df1d1, user approved

## Phase 2: Dependency Upgrades [checkpoint: 086319a]

- [x] Task: Audit and plan upgrades (FR0c) — `bun outdated` grouped into A (data+tooling), B (Payload), C (Next/React), D (TypeScript); risk notes recorded in commit notes
- [x] Task: Upgrade data & tooling dependency group — commit 42da1b2 (incl. Sentry v11 migration)
- [x] Task: Upgrade Payload + database stack — commit 2bbf84d (3.90.2 + drizzle aligned 0.45.2)
- [x] Task: Upgrade Next.js + React stack (canary → latest stable 16.x) — commits d6de16b (Next 16.4.0, React 19.3.0, schema-delta + email_hash drift-fix migrations), 9f8bdb4 (TypeScript 7.0.2)
- [x] Task: Full verification gate — all gates green: bun check (131 files), biome (0 errors), bun test (91 pass), build (7 static pages), e2e 25/25; tech-stack.md updated; hydration warning fixed via non-modal theme dropdown (086319a)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — checkpoint 086319a, e2e verified 25/25 with hydration warning eliminated

## Phase 3: RSS Feed [checkpoint: 79ca7c5]

- [ ] Task: Write failing tests for the feed builder (Red phase) (FR1)
  - New `src/lib/__tests__/` test file for feed generation logic (follow existing test naming/style)
  - Cover: item mapping (title/link/pubDate RFC 822/description escaping/cover img), latest-20 published-only selection, drafts excluded, channel metadata, XML entity escaping, invalid-character handling
  - Run tests; confirm they fail
- [x] Task: Implement feed builder module (Green phase) (FR1) — commit 79ca7c5
  - Create `src/lib/` feed builder (pure functions; testable without a running server)
  - Reuse canonical site URL pattern from existing env convention; no new env vars
  - Refactor if needed; confirm >80% coverage on the new module
- [x] Task: Write failing tests for the feed builder (Red phase) (FR1) — 17 tests written, confirmed failing, then green
- [x] Task: Implement `/feed.xml` route (FR1) — commit 79ca7c5
  - Route handler returning RSS 2.0 XML with `Content-Type: application/rss+xml; charset=utf-8`
  - ISR (revalidate 3600) + revalidated via revalidatePages hook; published-only query (sort -publishDate, limit 20, depth 1)
- [x] Task: Wire feed discovery (FR1) — commit 79ca7c5
  - `<link rel="alternate" type="application/rss+xml">` in root layout head (metadata.alternates.types)
  - RSS link in site footer (lucide Rss icon)
  - robots.txt reference SKIPPED — MetadataRoute.Robots has no feed field; robots.txt is not a feed-discovery mechanism (documented deviation, see git note on 79ca7c5)
- [x] Task: Add e2e coverage for the feed — commit 79ca7c5
  - Playwright spec e2e/feed.spec.ts: valid XML + content type, item content, head discovery link, footer link (4 passing)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — checkpoint 79ca7c5, user-approved

## Phase 4: Sort Options on /reviews [checkpoint: 3ffd157]

- [x] Task: Write failing tests for sort logic (Red phase) (FR2) — 7 tests, confirmed failing then green
- [x] Task: Implement sort query logic (Green phase) (FR2) — src/lib/reviews-sort.ts + page wiring — commit 3ffd157
- [x] Task: Implement sort UI dropdown (FR2) — SortSelect component, labeled, preserves other params, resets to page 1 — commit 3ffd157
- [x] Task: Add e2e coverage for sorting — e2e/sort.spec.ts 4 passing — commit 3ffd157
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) — checkpoint 3ffd157, user-approved

## Phase 5: Cleanup & Documentation Alignment

- [ ] Task: Remove dead pagination branch (FR3)
  - Delete the always-null `filter().map()` block in `src/app/(public)/reviews/page.tsx` ("Re-implementing logic clearly" comment)
  - Verify: typecheck/lint/tests green; reviews pagination still works
- [ ] Task: Align documentation (FR4)
  - README: remove "scheduled publishing" claim; RSS claim now true
  - `docs/PRD.md`: mark scheduled publishing as deferred/removed
  - `docs/ADMIN_GUIDE.md`: correct comment status list (pending/approved/rejected/reported; remove "Spam")
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Review Fixes

*(Appended automatically by `conductor-review` if issues are found.)*
