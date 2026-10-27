# Phase 1 Evidence — Heading extraction + reading-time libs

- Track: 20261027-reading-experience-toc — Review Reading Experience + TOC
- Phase: 1 — Heading extraction + reading-time libs
- Date: 2026-10-27
- Branch: `feat/20261027-reading-experience-toc`
- Base: `66f79a25da289d7d767aca12b48a44e06868a44e`
- Head: `b76a9f0844a8d6af9a48b1eb2f04b598a64b5ff8`
- Result: **failed** (sole failure is pre-existing `metadata.json` formatting,
  a Conductor state file this phase is forbidden from editing; every
  phase-owned check passes — see notes)

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check`: no type errors in 282 files |
| static | `bun run lint` | 1 | `biome check .`: all phase files clean; only remaining error is `conductor/tracks/20261027-reading-experience-toc/metadata.json` formatting, pre-existing at HEAD and outside Touches/edit permissions |
| unit | `bun test` | 0 | 866 pass, 0 fail across 63 files (includes 2 new suites, 25 new tests) |

Targeted suites also pass in isolation:
`bun test src/lib/__tests__/toc-extract.test.ts src/lib/__tests__/reading-time.test.ts`.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-2 | Review with H2/H3 + all structured sections lists them in document order; missing sections omitted | `src/lib/__tests__/toc-extract.test.ts`: "merges body headings with fixed sections in page order", "omits missing and empty sections" | met (logic part) |
| AC-5 | Reading-time badge data reads e.g. "5 min read" / ID equivalent, recomputed per locale | `src/lib/__tests__/reading-time.test.ts`: ceiling/floor cases, per-locale counts, `formatReadingTime` with EN/ID templates; `reviewReadingTime` keys in `src/lib/i18n/dictionary.ts` | met (logic part) |
| AC-8 | Review with <2 total entries hides the TOC block but still shows reading-time | `hasTableOfContents` (`entries.length >= 2`); reading-time floors at 1 minute so a badge always renders | met (logic part) |

Duplicate-slug (`-2`, `-3`), emoji-only heading (`section-<index>` fallback),
nested-inline-text, and whitespace-only-section edge cases are pinned in the
TOC suite; 200/201-word ceiling and quote inclusion in the reading-time suite.

## Evidence paths

- Implementation: `src/lib/toc-extract.ts`, `src/lib/reading-time.ts`
- Tests: `src/lib/__tests__/toc-extract.test.ts`, `src/lib/__tests__/reading-time.test.ts`
- Dictionary keys: `src/lib/i18n/dictionary.ts` (`reviewReadingTime`, EN + ID)
- Commits: `260afc0` (failing tests, TDD red), `b76a9f0` (implementation, green)

## Deviations

- `src/lib/i18n/dictionary.ts` (outside Touches): added one `reviewReadingTime`
  key per locale — the smallest change the formatter task required, as the
  brief permits. The formatter takes the template string as an argument
  (`formatReadingTime(minutes, template)`) so the lib never imports the
  server-only dictionary and stays client-safe for Phase 2.
- Placeholder is `{minutes}` rather than the brief's `{n}`, following the
  dictionary's existing `{page}` / `{rating}` / `{slide}` naming convention.
- `lexicalHasText` / `extractLexicalText` are exported from `toc-extract.ts`
  (rather than duplicated) so `reading-time.ts` and Phase 2 share one text
  reader. Fixed sections are assigned `level: 2` (top-level landmarks, matching
  their visual weight on the page) while body H3s stay nested at level 3.

## Notes

- TDD followed: failing tests committed first (`260afc0`), implementation
  after (`b76a9f0`).
- `bun run lint` cannot exit 0 on this branch until the primary reformats
  `conductor/tracks/20261027-reading-experience-toc/metadata.json`
  (single-line JSON written by track tooling; Biome wants it pretty-printed).
  The file is unmodified by this phase (`git status` shows only the five phase
  files) and is on the never-edit list, so the fix belongs in the primary's
  state commit — after which the phase command should go fully green with no
  code changes.
- No new dependencies; no UI/app-route changes.
