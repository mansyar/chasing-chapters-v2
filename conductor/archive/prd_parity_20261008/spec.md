# Specification: PRD Parity — RSS Feed, Sort Options & Cleanup

**Track ID:** prd_parity_20261008
**Type:** Feature
**Branch:** `track/prd-parity`
**Status:** Draft

## Overview

The README/PRD document features that do not exist in the implementation (RSS feed, sort options), while other claims describe functionality that was deliberately not built (scheduled publishing). This track closes the honest gap: it ships the two promised features, removes dead code, and aligns all documentation with reality. Additionally, the toolchain is modernized (Bun native type checking, Biome lint/format) and all dependencies are upgraded to their latest compatible versions — infrastructure changes are sequenced **before** the feature work so features are built against the final dependency versions.

## Functional Requirements

### FR0 — Toolchain & Dependency Modernization (executed first)

**FR0a — Type checking via `bun check`:**

- Replace `tsc --noEmit` with `bun check` everywhere it is invoked: `package.json` scripts, husky pre-commit chain, CI workflow, and `conductor/workflow.md`.
- `bun check` reports TypeScript 7 behavior: fix resulting fallout (e.g., `strict` default, side-effect import errors TS2882 on CSS imports, removed compiler options in `tsconfig.json`).
- Do not introduce new suppressions for pre-existing code unless the error is a false positive with a documented rationale.
- Requirement: the installed Bun version supports `bun check` (verify; upgrade Bun if needed).

**FR0b — Biome replaces ESLint + Prettier:**

- Initialize Biome config; run `biome migrate eslint --write` to port existing ESLint configuration where mappable.
- Remove ESLint, ESLint plugins/configs (incl. `eslint-config-next`), and Prettier packages and config files from the repo.
- Update scripts (`lint`, `format`), husky pre-commit chain, CI, and docs to use `biome check` / `biome format`.
- Perform **one dedicated full-repo reformat commit** so all code conforms to Biome style going forward.
- Accept rule-behavior deltas: Biome does not replicate framework-specific ESLint plugins; note any lost coverage in the track's summary rather than re-adding ESLint.

**FR0c — Dependency upgrades (full latest incl. majors):**

- Upgrade all dependencies to the latest compatible versions, including majors: Next.js 16 canary → latest stable 16.x, Payload, React, Tailwind, drizzle, zod, and all dev tooling.
- Run `bun update` / targeted version bumps; resolve breaking changes; keep the app fully functional.
- Post-upgrade verification gate: typecheck, lint, unit tests, production build (`bun run build`), and Playwright e2e suite all green before any feature work begins.
- Update `conductor/tech-stack.md` to reflect the final versions.
- Rollback safety: upgrades are committed incrementally (per-dependency-group commits) so a regression can be bisected and reverted.

### FR1 — RSS Feed (`/feed.xml`)

- A route at `/feed.xml` producing a valid **RSS 2.0** XML document.
- Contains the **latest 20 published reviews** (published status only, ordered by `publishDate` descending).
- Each `<item>` carries:
  - `<title>` — review title
  - `<link>` — absolute canonical URL to `/reviews/[slug]` (base URL from `NEXT_PUBLIC_SITE_URL`)
  - `<pubDate>` — review publish date (RFC 822 format)
  - `<description>` — review excerpt as plain text (HTML-escaped); cover image referenced via `<img>` in description when available
  - `<guid isPermaLink="true">` — canonical review URL
- Channel metadata: site title, description, language (`en`), last build date, self-referencing `atom:link`.
- Served with `Content-Type: application/rss+xml; charset=utf-8`.
- Discovery wiring:
  - `<link rel="alternate" type="application/rss+xml" title="..." href="/feed.xml">` in the site `<head>` (root layout)
  - RSS link in the site footer
  - Mention in `robots.txt`
- Feed output is cached (ISR) and revalidated alongside review pages via the existing `revalidatePages` hook pattern where applicable.

### FR2 — Sort Options on `/reviews`

- Sorting driven by a `?sort=` URL search param, composable with existing `?search=` / `?genre=` params and pagination.
- Supported values:
  - `recent` (default, current behavior: `publishDate` descending)
  - `rating` (overall rating descending; tie-break by `publishDate` descending)
  - `title` (alphabetical ascending, locale-aware, case-insensitive)
- Unknown/invalid `sort` values silently fall back to `recent`.
- No client-side data fetching: sorting is resolved server-side (SSR); the dropdown updates the URL and relies on navigation.
- UI: a labeled dropdown added to the existing reviews toolbar (near search/genre filters), preserving current query params when changed. Accessible (`<label>` associated, keyboard operable).

### FR3 — Dead Code Cleanup

- Remove the dead pagination branch in `src/app/(public)/reviews/page.tsx` (the always-null `filter().map()` block marked "Re-implementing logic clearly").

### FR4 — Documentation Alignment

- README: keep the RSS claim (now true); remove the "scheduled publishing" claim.
- PRD (`docs/PRD.md`): remove or annotate the scheduled-publishing requirement as deferred/not planned.
- `docs/ADMIN_GUIDE.md`: correct the comment status list to match the actual Payload statuses (`pending`, `approved`, `rejected`, `reported` — remove the non-existent "Spam" status).

## Non-Functional Requirements

- No new client-side JavaScript for sorting (URL-param driven).
- Feed generation must not leak drafts or unpublished content.
- Logic-bearing modules (`src/lib/`, feed builder) follow the workflow's testing requirement: unit tests written first (TDD).
- Feed XML must be W3C Feed Validator–clean (no invalid characters; escaped entities).
- Site URL resolution follows the existing env convention (verify `NEXT_PUBLIC_SITE_URL` vs `NEXT_PUBLIC_APP_URL` usage and reuse the canonical pattern; do not introduce new env vars).

## Acceptance Criteria

1. `bun check` is the project's type checker (script, husky, CI, workflow.md) and passes with zero errors; no `tsc --noEmit` invocations remain.
2. ESLint and Prettier are fully removed; `biome check` passes; the repo is fully reformatted in a dedicated commit.
3. All dependencies are on their latest compatible versions (incl. majors); build, unit tests, and e2e suite pass on the upgraded stack; `conductor/tech-stack.md` reflects final versions.
4. `GET /feed.xml` returns valid RSS 2.0 containing exactly the latest 20 published reviews with correct title/link/pubDate/description.
5. Feed does not include drafts, scheduled, or unpublished reviews.
6. RSS discovery `<link>` present in document head; footer contains an RSS link; `robots.txt` references the feed.
7. `/reviews?sort=rating` orders by rating desc (tie-break publishDate desc); `/reviews?sort=title` orders alphabetically; no param = recent; invalid param = recent.
8. Sort composes correctly with search, genre filter, and pagination; changing sort resets to page 1.
9. Dead pagination branch removed.
10. README, PRD, and ADMIN_GUIDE contain no claims of unimplemented features.
11. Unit tests cover feed item mapping/escaping and sort-param parsing (logic-bearing code per workflow).

## Out of Scope

- Scheduled publishing implementation (claim removed; candidate future track).
- Full-content RSS feeds (excerpt-based only, per decision).
- Additional sorts (oldest, most viewed, most liked).
- Per-category/author/tag feeds, Atom/JSON Feed formats.
- RSS-to-email or feed analytics.
- Re-adding framework-specific ESLint plugins lost in the Biome migration.

## Open Questions

- None — field names for excerpt/rating to be verified against the Reviews collection schema during planning (plan task).
