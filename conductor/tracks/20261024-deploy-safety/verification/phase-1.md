# Phase 1 — Destructive Migration Markers

- **Track:** 20261024-deploy-safety — Deploy Safety
- **Phase:** 1
- **Date:** 2026-10-24
- **Branch:** `chore/20261024-deploy-safety`
- **Base:** `20e93ee5cee3defa9c4046bf718edfea18bc07fc`
- **Head:** `39f8493e9be1ecb76c73cf2e57ee8b725a3e58f0`
- **Result:** verified

## What changed

A static unit test scans every migration's `up` body for `DROP COLUMN`,
`DROP TABLE` and `TRUNCATE`, and fails unless the file carries a
`// destructive: <justification>` marker. `down` bodies are never scanned,
which is why the file is split at `export async function down` before matching.
The three migrations that already dropped in `up` now say what they drop and
why it cannot be reintroduced.

Nothing in the migration chain's SQL changed: this phase adds tests and
comments only (NFR-4).

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 247 files (1.61s) |
| static | `bun run lint` | 0 | Biome checked 237 files in 362ms, no fixes applied |
| unit | `bun test` | 0 | 592 pass, 0 fail, 1350 expect() calls, 47 files (3.79s) |

Full phase command, run exactly as written in `plan.md`:
`bun run typecheck && bun run lint && bun test` → exit **0**.

Targeted run of the new suite alone:
`bun test src/migrations/__tests__/destructive-markers.test.ts` → 10 pass,
0 fail, 20 expect() calls.

### Red state observed before the markers landed

The scan was written and run before the markers were added, so the gate is
demonstrated rather than asserted. It failed with the 21 expected statements
and nothing else:

```
(fail) destructive migration markers > requires a justification for every destructive up body
+ "20251214_135240.ts: ALTER TABLE \"reviews\" DROP COLUMN \"review_content\";"
  ... (7 more from that file)
+ "20261008_131000_commenters_email_hash_fix.ts: ALTER TABLE \"commenters\" DROP COLUMN IF EXISTS \"email\";"
+ "20261023_193922_...ts: ALTER TABLE \"genres\" DROP COLUMN \"name\";"
  ... (9 more from that file)
(fail) destructive migration markers > marks the three migrations that drop in up
 8 pass, 2 fail
```

Adding the markers turned both tests green without touching the scanner. No
other migration was flagged, which is the AC-4 claim: `20261023_195302`
(`DROP NOT NULL`) and the `DROP INDEX`/`DROP TYPE` reversals in `down` stay
silent.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-2 | A migration with `DROP COLUMN` in `up` and no marker fails `bun test`; adding the marker makes it pass. | `destructive-markers.test.ts` — "flags an unmarked up that drops a column" and "accepts the same migration once it carries a marker"; plus the real red→green run above | met |
| AC-3 | A migration whose drops appear only in `down` passes without a marker. | `destructive-markers.test.ts` — "ignores a drop that appears only in down" (fixture contains `DROP COLUMN`, `DROP TABLE` and `TRUNCATE`, all after `export async function down`) | met |
| AC-4 | All thirteen committed migrations pass the marker test. | `destructive-markers.test.ts` — "inspects every committed migration and no snapshot" (`>= 13` files, `index.ts` excluded, no `.json`) and "requires a justification for every destructive up body" (empty offender list) | met |
| FR-2 | Unit test under `src/migrations/__tests__/` scans every `up` body and fails on `DROP COLUMN`/`DROP TABLE`/`TRUNCATE` without a marker. | `src/migrations/__tests__/destructive-markers.test.ts` | met |
| FR-3 | The three dropping migrations carry markers naming what is dropped and why it cannot be reintroduced. | "marks the three migrations that drop in up" — asserts each of `20251214_135240`, `20261008_131000_commenters_email_hash_fix` and `20261023_193922_localize_taxonomy_and_reading_list_content` both drops and is marked | met |
| NFR-5 | The marker test is offline and deterministic: no database, no network, no clock. | The suite reads files with `Bun.file`/`readdir` only; no env, no sockets, no `Date`. Runs in ~50ms. | met |

## Evidence paths

- `src/migrations/__tests__/destructive-markers.test.ts` — the scanner and its cases
- `src/migrations/20251214_135240.ts` — marker on the review-body localization
- `src/migrations/20261008_131000_commenters_email_hash_fix.ts` — marker on the email→hash drop
- `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts` — marker on the outage migration

## Commits

| Commit | Task | Message |
| --- | --- | --- |
| `b658946` | P1.T1 | `test(migrations): require a marker for destructive up bodies` |
| `39f8493` | P1.T2 | `docs(migrations): declare the three destructive up bodies` |

## Deviations

None. Every file touched is inside `Touches`
(`src/migrations/__tests__/**`, `src/migrations/*.ts`).

## Notes for the primary

- **The outage migration drops ten columns, not nine.** The brief asked the
  marker to "name all nine dropped content columns"; the `up` body at
  `20261023_193922` drops ten: `genres.name`, `tags.name`, `tags.description`,
  `mood_tags.name`, `reviews.title`, `_reviews_v.version_title`,
  `reading_lists.title`, `reading_lists.description`,
  `_reading_lists_v.version_title`, `_reading_lists_v.version_description`.
  The marker names all ten. Spec FR-3 and the plan's task text both say "nine",
  so the plan wording may want correcting — the marker is correct as written.
- **`20261024_023532` and `20261008_015213` are not in the FR-3 list but are
  harmless.** Both drop columns only in `down`, so neither is flagged and
  neither needs a marker; the scan confirms this.
- **`DROP INDEX` and `DROP TYPE` are deliberately out of scope.** FR-2 names
  only `DROP COLUMN`, `DROP TABLE` and `TRUNCATE`. `20251206_170543` and
  `20251206_191512` drop indexes/tables in `down` only, so the narrower pattern
  changes nothing today, but a future migration that drops an index in `up`
  would pass. Recorded here rather than widened, since widening the pattern is a
  spec change, not an implementation detail.
- The scanner reads the file list with `readdir` and filters `.ts` plus
  `index.ts` explicitly, so the eleven `.json` drizzle snapshots beside the
  migrations can never be read as migrations. The count assertion (`>= 13`)
  means a broken directory read fails loudly rather than passing vacuously.
- The marker is a whole-line `//` comment, matched by `^\s*//\s*destructive:`.
  SQL comments (`--`, `/* */`) are stripped before matching, so a note that
  mentions a `DROP` does not force a marker; the spec accepted the converse
  trade (a `DROP` inside a SQL string literal still does).
