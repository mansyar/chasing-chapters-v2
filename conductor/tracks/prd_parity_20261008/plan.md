# Implementation Plan: PRD Parity — RSS Feed, Sort Options & Cleanup

**Track ID:** prd_parity_20261008
**Branch:** `track/prd-parity`
**Spec:** [spec.md](./spec.md)
**Status:** Pending

> Execution follows `conductor/workflow.md`: TDD for logic-bearing code (Red → Green → Refactor), quality gates per task, git-notes task summaries, and phase verification checkpoints.

## Phase 1: Toolchain Modernization

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
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Dependency Upgrades

- [ ] Task: Audit and plan upgrades (FR0c)
  - Run `bun outdated` (or equivalent); group dependencies: runtime framework (Next/React/Payload), data (drizzle/redis/zod), tooling
  - Note breaking-change risks per group (Next canary → stable 16.x is highest risk)
- [ ] Task: Upgrade data & tooling dependency group
  - Bump drizzle, zod, redis/ioredis, dev tooling to latest compatible
  - Fix breakages; verify `bun check`, `biome check`, `bun test` green; commit per group
- [ ] Task: Upgrade Payload + database stack
  - Bump Payload to latest 3.x; run any required migrations
  - Verify admin panel loads; `bun test` green; commit
- [ ] Task: Upgrade Next.js + React stack (canary → latest stable 16.x)
  - Bump Next.js and React; resolve breaking changes (config, APIs, caching semantics)
  - Verify: `bun run build` succeeds; dev server boots; commit
- [ ] Task: Full verification gate
  - `bun check`, `biome check`, `CI=true bun test`, `bun run build`, `CI=true bun run test:e2e` all green
  - Update `conductor/tech-stack.md` with final versions (dated note per workflow Principle 2)
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: RSS Feed

- [ ] Task: Write failing tests for the feed builder (Red phase) (FR1)
  - New `src/lib/__tests__/` test file for feed generation logic (follow existing test naming/style)
  - Cover: item mapping (title/link/pubDate RFC 822/description escaping/cover img), latest-20 published-only selection, drafts excluded, channel metadata, XML entity escaping, invalid-character handling
  - Run tests; confirm they fail
- [ ] Task: Implement feed builder module (Green phase) (FR1)
  - Create `src/lib/` feed builder (pure functions; testable without a running server)
  - Reuse canonical site URL pattern from existing env convention; no new env vars
  - Refactor if needed; confirm >80% coverage on the new module
- [ ] Task: Implement `/feed.xml` route (FR1)
  - Route handler returning RSS 2.0 XML with `Content-Type: application/rss+xml; charset=utf-8`
  - ISR caching consistent with review pages; published-only query
- [ ] Task: Wire feed discovery (FR1)
  - `<link rel="alternate" type="application/rss+xml">` in root layout head
  - RSS link in site footer
  - Reference in `robots.txt`
- [ ] Task: Add e2e coverage for the feed
  - Playwright spec: `/feed.xml` returns valid XML, correct content type, contains latest review, excludes drafts
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: Sort Options on /reviews

- [ ] Task: Write failing tests for sort logic (Red phase) (FR2)
  - New unit tests in `src/lib/__tests__/` for: sort-param parsing (recent/rating/title), invalid value fallback, rating tie-break by publishDate desc, title locale-aware case-insensitive ordering
  - Run tests; confirm they fail
- [ ] Task: Implement sort query logic (Green phase) (FR2)
  - Extend the reviews query building (server-side, SSR) to apply the sort; compose with existing search/genre/pagination
  - Changing sort resets to page 1; >80% coverage on new logic
- [ ] Task: Implement sort UI dropdown (FR2)
  - Labeled, keyboard-accessible dropdown in the reviews toolbar near search/genre filters
  - Updates `?sort=` URL param preserving other params; no client-side data fetching
- [ ] Task: Add e2e coverage for sorting
  - Playwright spec: default order unchanged; `?sort=rating` and `?sort=title` order correctly; composes with filters
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

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
