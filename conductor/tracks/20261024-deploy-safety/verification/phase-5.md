# Phase 5 — Deployment Runbook

- **Track:** `20261024-deploy-safety` (Deploy Safety)
- **Phase:** 5 of 5
- **Date:** 2026-10-25
- **Branch:** `chore/20261024-deploy-safety`
- **Base commit:** `3b28332` (phase brief); branch HEAD at phase start was `416d8fd`
  (the plan-bookkeeping commit that marked this phase in progress)
- **Head commit:** recorded in the report
- **Result:** verified

## What this phase changes

Two files, no code:

1. **`docs/DEPLOYMENT.md`** (new) — the runbook. It documents the deploy order and
   the constraint that forces it, the cost of that ordering, what the `verify` job
   does and does not prove, `migrate:status`, `migrate:down`, what a revert does
   not restore, when a revert is unsafe, how a destructive migration is declared,
   and a short closing checklist.
2. **`README.md`** — the Deployment section's step list now matches the workflow
   (Migrate → Build and Push → Deploy → Verify instead of Build → Push → Deploy),
   with a pointer to the runbook; and the Documentation list gains a second entry
   beside the PRD.

No migration, workflow, script or test was touched. `NFR-4` holds.

## Commands

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `✓ No type errors in 250 files` |
| static | `bun run lint` | 0 | `Checked 240 files. No fixes applied.` |
| unit | `bun test` | 0 | `600 pass`, `0 fail`, `1381 expect() calls`, 48 files |
| phase | `bun run typecheck && bun run lint && bun test` | 0 | all three layers green; run twice, identical results |

The verification command produces weak evidence for a docs-only phase, and the
table below is the evidence that matters instead. What the chain does prove is
that the two edits did not break anything: `biome check .` covers `docs/` and
`README.md`, so the Markdown is lint-clean, and nothing in the suite reads either
file.

**Not run, deliberately:** `bun run payload migrate:status` and
`bun run payload migrate:down`. Neither was needed to write the document — the
first needs a database this phase does not have, and the second would destroy the
development database's Indonesian translations. Their behaviour was verified by
reading the source, which is what the claims table cites.

## Claims and their sources

Every load-bearing statement in `docs/DEPLOYMENT.md`, and the line that backs it.
A claim with no source here was cut from the document rather than softened.

### The pipeline

| Claim in the runbook | Source |
| --- | --- |
| Four jobs, in order `migrate` → `build-and-push` → `deploy` → `verify` | `.github/workflows/deploy.yml:49`, `:82`, `:122`, `:163` |
| Each job depends on the one before it | `deploy.yml:85` (`needs: migrate`), `:125` (`needs: build-and-push`), `:166` (`needs: deploy`) |
| `migrate` runs `bun run payload migrate` | `deploy.yml:80` |
| Deploys are serialised by a workflow-level group `deploy-production` with `cancel-in-progress: false` | `deploy.yml:23-25` |
| A second deploy queues behind the first rather than cancelling it | `deploy.yml:16-19` (comment), `:25` (the setting) |
| `workflow_dispatch` shares the group | `deploy.yml:7`, `:21-22` |
| `next build` statically generates pages against the production database | `deploy.yml:32-33`; `.github/workflows/ci.yml:231-232` |
| A column the new code reads must exist by then or prerendering dies with `42703` | `deploy.yml:33-34` |
| Migrations cannot move after the build, because the build needs the schema | `deploy.yml:32-34`; `ci.yml:231-232` |

### The cost of the ordering

| Claim in the runbook | Source |
| --- | --- |
| A migration runs while the previous image is still serving | `deploy.yml:40-42` |
| A destructive migration breaks the currently serving image the moment it lands | `deploy.yml:38-41` |
| On 2026-10-24 the window never closed: ten columns dropped, build failed, `42703` for about ten hours | `deploy.yml:42-43`; `conductor/tracks/20261024-deploy-safety/spec.md:16-22` |
| The pipeline cannot make that window safe, only short and visible | `deploy.yml:36-43`; `spec.md:57-59` (Out of Scope: no automatic compensation) |
| `build-and-push` starts as soon as `migrate` finishes | `deploy.yml:85` (`needs: migrate`) |
| `verify` fails the run when the site stops answering | `deploy.yml:135-137`, `:144-145` |

### The smoke check

| Claim in the runbook | Source |
| --- | --- |
| `verify` runs `src/scripts/deploy-smoke.ts` | `deploy.yml:184-188` |
| Base URL is `vars.PRODUCTION_BASE_URL`, defaulting to `https://chasing-chapters.com` | `deploy.yml:172` |
| Five routes: `/api/genres?limit=1`, `/en`, `/id`, `/en/reviews`, `/sitemap.xml` | `src/lib/deploy-smoke.ts:108-114` |
| Six attempts, fifteen seconds apart | `deploy.yml:187-188`; `src/lib/deploy-smoke.ts:134`, `:137` |
| `/en/reviews/<slug>` is probed only when a published review exists | `src/lib/deploy-smoke.ts:117-118`, `:120-121`; `deploy.yml:150-152` |
| Any endpoint that never returns 200 fails the job and the run | `deploy.yml:144-145` (no `continue-on-error`) |
| It catches the 2026-10-24 shape because that shows up whether or not the new image rolled out | `deploy.yml:158-160` |
| It cannot prove the new image is serving; a rollout can outlast the window | `deploy.yml:156-157` |
| It can miss a new image that is broken but not yet live | `deploy.yml:160-162` |
| It does not judge correctness and cannot undo anything | `deploy.yml:161-162`; `conductor/tracks/20261024-deploy-safety/verification/phase-4.md` ("What this check cannot catch") |

### `migrate:status`

| Claim in the runbook | Source |
| --- | --- |
| `bun run payload migrate:status` is the listing command | `package.json:13` (`"payload": "payload"`); `node_modules/payload/dist/bin/migrate.js:90-91` |
| It prints three columns: `Name`, `Batch`, `Ran` | `node_modules/payload/dist/database/migrations/migrateStatus.js:24-28` |
| `Batch` is empty when the migration never ran | `migrateStatus.js:26` — `existingMigration?.batch` is `undefined` for a file with no row |
| `migrate` puts every migration it applies in one run into a single new batch | `node_modules/@payloadcms/drizzle/dist/migrate.js:51` (`newBatch = latestBatch + 1`), `:59` (every file gets `newBatch`) |
| The new batch is one higher than the newest recorded batch | `@payloadcms/drizzle/dist/migrate.js:25-29` (sorted `-name`), `:47-49` |
| A `dev` row with batch `-1` is Payload's dev-push marker | `node_modules/@payloadcms/drizzle/dist/utilities/pushDevSchema.js:71-74` (`name: 'dev'`, `batch: -1`) |
| `migrate:status` does not list it, because it iterates the files on disk | `migrateStatus.js:22-29` (maps over `migrationFiles`) |
| `getMigrations` excludes batch `-1` when computing the latest batch | `node_modules/payload/dist/database/migrations/getMigrations.js:11-15` |
| The dev row surfaces as a confirmation prompt on the next `payload migrate` | `@payloadcms/drizzle/dist/migrate.js:30-43` |
| The workflow pipes `echo y` into that prompt | `deploy.yml:70-72` (comment), `:80` (the command) |

### `migrate:down`

| Claim in the runbook | Source |
| --- | --- |
| It reverts the entire latest batch, not the last migration | `node_modules/payload/dist/database/migrations/migrateDown.js:24-25` (`filter(({ batch }) => batch === latestBatch)` then a `for` loop); the drizzle adapter used by this project is identical at `node_modules/@payloadcms/drizzle/dist/migrateDown.js:22-23` |
| There is no flag to revert one | `node_modules/payload/dist/bin/migrate.js:76-78` — `case 'migrate:down': await adapter.migrateDown()`, no argument |
| The revert runs in reverse order of application | Application order is ascending filename: `node_modules/payload/dist/database/migrations/readMigrationFiles.js:16` (`readdirSync(...).sort()`), applied in that order by `@payloadcms/drizzle/dist/migrate.js:53`. The revert reads them descending: `getMigrations.js:7-10` sorts `['-batch', '-name']`, and `migrateDown.js:22` filters that order into the loop |
| This project's adapter is the drizzle one | `src/payload.config.ts:1`, `:69` (`postgresAdapter`); `node_modules/@payloadcms/db-postgres/dist/index.js:1` re-exports `migrateDown` from `@payloadcms/drizzle` |

### What the localization `down()` does

| Claim in the runbook | Source |
| --- | --- |
| It recreates the ten columns, nullable | `src/migrations/20261023_193922_localize_taxonomy_and_reading_list_content.ts:120-129` |
| It copies values back only from rows where `_locale = 'en'` | same file `:135-156` (every `UPDATE ... WHERE ... _locale = 'en'`) |
| It re-applies `NOT NULL` to three columns | same file `:159-161` (`genres.name`, `tags.name`, `mood_tags.name`) |
| It `DROP TABLE ... CASCADE`s five locale tables | same file `:162-166` |
| It drops `reviews_locales.title` and `_reviews_v_locales.version_title` | same file `:167-168` |
| Every Indonesian translation in those five tables is destroyed | follows from `:162-166` — the tables are dropped, and `:135-156` reads only `_locale = 'en'` before that |
| Every Indonesian review title is destroyed too | `:167` drops the column that holds it; nothing copies the `id` rows back |
| The command takes no backup and deletes the migration's row afterwards | `@payloadcms/drizzle/dist/migrateDown.js:34-52` — `down()`, then `payload.delete` on `payload-migrations`, then commit. No dump, no snapshot |
| `20251214_135240`'s `down()` has the same shape | `src/migrations/20251214_135240.ts:111-131` (English-only copy-back), `:137-138` (`DROP TABLE ... CASCADE` on `reviews_locales` and `_reviews_v_locales`) |

### The marker convention

| Claim in the runbook | Source |
| --- | --- |
| `DROP COLUMN`, `DROP TABLE` and `TRUNCATE` in `up` require a `// destructive:` marker | `src/migrations/__tests__/destructive-markers.test.ts:21` (pattern), `:27` (marker), `:76-77` (the rule) |
| `down()` bodies are never scanned | same file `:24` (`DOWN_FUNCTION`), `:40-44` (split), `:15-16` (the reason) |
| Three migrations currently carry a marker | `20251214_135240.ts:3`, `20261008_131000_commenters_email_hash_fix.ts:17`, `20261023_193922_...ts:12`; asserted at `destructive-markers.test.ts:212-216` |
| It is enforced in CI and pre-commit | `ci.yml:77-78` (`bun test`); `.husky/pre-commit:3` (`bun test`) |
| `DROP NOT NULL`, `DROP CONSTRAINT`, `DROP DEFAULT` are not flagged | `destructive-markers.test.ts:145-158` (`RELAXED` fixture), `:249-254` |
| `DELETE FROM` is not flagged | same fixture, `:153`, and `:251-252` (the comment naming `20261023_195302`) |
| SQL comments are stripped before matching | `destructive-markers.test.ts:53-55`, `:272-274` |
| A `DROP` inside a string literal still forces a marker | the converse of `:53-55`; recorded as an accepted trade in `spec.md:114-115` |
| The marker is matched anywhere in the file, not positionally | `destructive-markers.test.ts:66-68` (`MARKER.test(source)`, whole file) |
| The scan asserts at least thirteen files, so a broken glob fails loudly | `destructive-markers.test.ts:189` |
| There is no automatic rollback in the pipeline | `spec.md:57-59` (Out of Scope) — the choice, not an oversight |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-10 | `docs/DEPLOYMENT.md` exists, the README links to it, and it states what `migrate:down` cannot restore | `docs/DEPLOYMENT.md` exists. `README.md:225` links it from the Deployment section and `README.md:240` from the Documentation list. "What a revert does not restore" names the mechanism, not a generality: the five `*_locales` tables are dropped with `CASCADE`, the `down()` copies back only `_locale = 'en'` rows, and Indonesian review titles go with `reviews_locales.title` — each cited in the table above | **met** |
| FR-9 | The runbook documents listing applied migrations, reverting one batch, what a revert does not restore, and when it is unsafe; the README's Deployment section links to it | Four sections in `docs/DEPLOYMENT.md` — "Listing what has run", "Reverting a batch", "What a revert does not restore", "When a revert is unsafe" — plus two README links | **met** |

## Deviations

| File | Reason |
| --- | --- |
| — | None. Both changed paths are inside `Touches`. |

## Notes for the primary

- **The brief's two load-bearing facts both held, and one is worth restating
  precisely.** `migrate:down` reverts the whole latest batch — confirmed twice,
  because this project goes through `@payloadcms/db-postgres`, whose `migrateDown`
  is re-exported from `@payloadcms/drizzle` (`db-postgres/dist/index.js:1`), not
  the copy in `payload/dist`. Both files filter by `batch === latestBatch` and
  loop; neither takes an argument. The runbook cites both so a future Payload
  upgrade that diverges them is visible.
- **A correction to the brief, in the document's favour.** The brief said the
  localization `down()` destroys the five `*_locales` tables and their Indonesian
  translations. It also drops `reviews_locales.title` and
  `_reviews_v_locales.version_title` at lines 167-168 — so Indonesian *review
  titles* are lost too, and they are not covered by the "five tables" phrasing.
  The runbook says so explicitly. This matters because the review title is the one
  localized field the admin guide tells authors to type by hand
  (`docs/ADMIN_GUIDE.md:229-231`), which makes it the likeliest piece of
  Indonesian content to actually exist.
- **`20251214_135240` is the same trap one layer down.** Its `down()` copies the
  English review body back and then `DROP TABLE ... CASCADE`s `reviews_locales`.
  The runbook names it, because "read the `down()` before relying on it" is much
  more convincing with two real examples than with one.
- **The `verify` job's limitations are stated as limitations.** Per Phase 4's
  evidence, a green run may have been talking to the previous container the whole
  time. The runbook says that plainly and then says what the check *does* catch,
  so a reader does not conclude the gate is worthless.
- **No secrets in the runbook.** It names `vars.PRODUCTION_BASE_URL` (a
  repository variable, not a secret) and nothing else. The Required GitHub Secrets
  table stays in `README.md:229-235` where it already was; the README edit did not
  touch it.
- **`biome check .` covers the new file.** `docs/DEPLOYMENT.md` is Markdown, so
  Biome does not format it, but it does appear in the 240-file count and did not
  draw a finding. Trailing whitespace was checked separately with a `[ \t]+$`
  grep over both changed files: no matches.
- **The README edit is two hunks, nothing restructured.** The step list gained
  Migrate at the front and Verify at the end plus a two-line pointer paragraph,
  and the Documentation list gained one bullet. The emoji headings, the secrets
  table and the surrounding sections are untouched.
