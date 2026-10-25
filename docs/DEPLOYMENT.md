# Chasing Chapters — Deployment Runbook

How a deploy runs, what it can and cannot protect you from, and what to do when
one goes wrong. Read this before running a migration by hand, and read the
"If a deploy goes wrong" section at the bottom before reverting anything.

The short version: **a revert restores shape, not data.** Check what the
`down()` of the migration you are about to undo actually does.

---

## What a deploy runs

A push to `main` (or a manual `workflow_dispatch`) starts
`.github/workflows/deploy.yml`. Four jobs, in this order, each depending on the
one before it:

| Order | Job              | What it does                                                    |
| ----- | ---------------- | --------------------------------------------------------------- |
| 1     | `migrate`        | Runs `bun run payload migrate` against the production database   |
| 2     | `build-and-push` | Builds the image and pushes it to Docker Hub                     |
| 3     | `deploy`         | Calls the Coolify webhook and returns as soon as it accepts      |
| 4     | `verify`         | Polls the live site and fails the run if it does not answer      |

The run is serialised: a workflow-level `concurrency` group named
`deploy-production` with `cancel-in-progress: false` queues a second deploy
behind the first instead of cancelling it. Two merges minutes apart therefore
run their migrations one after the other rather than interleaving them.

---

## Why migrations run first

`next build` statically generates pages against the production database. A
column the new code reads has to exist by the time the build runs, or
prerendering dies with PostgreSQL error `42703` (`undefined_column`) and no
image is produced.

That is the whole constraint. Migrations cannot be moved after the build,
because the build needs the schema they produce.

---

## What that ordering costs

The same ordering is a hazard, and it is the reason this document exists.

A migration runs while the **previous** image is still the one serving traffic.
If the migration is destructive — it drops or renames a column the deployed
image still reads — that image starts returning 500s the moment the migration
lands, and keeps doing so until the new image goes live.

On 2026-10-24 that window never closed. The migration dropped ten content
columns, the image build failed, and production served `42703` on every query
touching genres, tags, mood tags, reading lists or a review title for roughly
ten hours.

**The pipeline cannot make that window safe.** It can only make it short, and
make it visible *when the build succeeds*:

- Short, because `build-and-push` starts as soon as `migrate` finishes, so the
  gap is one image build rather than an afternoon.
- Visible *when the build succeeds*, because `verify` runs after the webhook and
  fails the run when the site stops answering. That is the first automated
  signal that a rollout did not land.

That second bullet is conditional, and the condition is exactly what failed on
2026-10-24: `verify` only runs if the image built. When the build is what
breaks, the run goes red at `build-and-push`, `deploy` and `verify` are skipped,
and nothing automated looks at the site at all — see "What `verify` proves, and
what it does not" below. A failed build is the case where a human has to check
production by hand.

The decision that actually removes the risk is a human one: do not merge a
destructive migration and a build-breaking change in the same deploy.

---

## What `verify` proves, and what it does not

The `verify` job runs `src/scripts/deploy-smoke.ts` against
`vars.PRODUCTION_BASE_URL` (defaulting to `https://chasing-chapters.com`). It
polls five routes — `/api/genres?limit=1`, `/en`, `/id`, `/en/reviews` and
`/sitemap.xml` — six times each, fifteen seconds apart, and probes
`/en/reviews/<slug>` as well when a published review exists. Any endpoint that
never returns 200 fails the job, which fails the run.

It **catches** the 2026-10-24 shape: a migration lands, the serving image can no
longer read the schema, and requests start returning 500 immediately. That
happens whether or not the new image has rolled out, so the check does not
depend on the rollout finishing.

**But it only runs when the image built.** `verify` comes after `deploy`, which
comes after `build-and-push`. When the build fails, `deploy` and `verify` are
both skipped: the run goes red at the build, and a destructive migration that
has already landed leaves production broken with no automated signal at all. On
2026-10-24 the build is exactly what failed, so this check would **not** have
run. That gap is real and nothing here closes it — if `build-and-push` fails,
check the site by hand before assuming the previous image is still healthy.

It **cannot**:

- Prove the new image is serving. A Coolify rollout can take longer than the
  seventy-five second window per endpoint, so a green run may have been talking
  to the previous container throughout.
- Catch a new image that is broken but not yet live. The run goes green and the
  breakage arrives minutes later.
- Judge correctness. A page that renders the wrong content with a 200 passes.
- Undo anything. A red run reports that the site is unhealthy; the deployment
  stays up.

---

## Listing what has run

```bash
bun run payload migrate:status
```

This prints one row per migration file in `src/migrations/`, with three columns:

| Column  | Meaning                                                    |
| ------- | ---------------------------------------------------------- |
| `Name`  | The migration file name                                     |
| `Batch` | The batch it was applied in, or empty when it never ran     |
| `Ran`   | `Yes` or `No`                                               |

**The batch number is the thing to read.** `migrate` puts every migration it
applies in one run into a single new batch, numbered one higher than the batch
already recorded for the most recently applied migration. Migrations applied in
different deploys therefore carry different batch numbers, and migrations applied
in the same deploy share one.

A `dev` row with batch `-1` is Payload's dev-push marker, written when a
development server pushed schema changes directly instead of through a
migration. It is not a migration from `src/migrations/` and `migrate:status` does
not list it, because that command only iterates the files on disk. It surfaces
instead as a confirmation prompt the next time `payload migrate` runs, which is
why the workflow pipes `echo y` into it.

---

## Reverting a batch

```bash
bun run payload migrate:down
```

**This reverts the entire latest batch, not the last migration.** If three
migrations were applied in one deploy, all three are reverted, in reverse order
of application. There is no flag to revert one.

That is worth stating plainly because "down" reads like "undo the last one".
Before running it, check `migrate:status` and count how many migrations share the
highest batch number.

---

## What a revert does not restore

`down()` restores *shape*, not *data*. How much data survives is decided by each
migration individually, and for the localization migration the answer is: the
English values, and nothing else.

`20261023_193922_localize_taxonomy_and_reading_list_content` dropped ten columns
after copying their values into per-locale tables. Its `down()`:

1. Recreates the ten columns, nullable.
2. Copies values back **only from rows where `_locale = 'en'`**.
3. Re-applies `NOT NULL` to the three columns that had it before.
4. `DROP TABLE ... CASCADE` on `genres_locales`, `tags_locales`,
   `mood_tags_locales`, `reading_lists_locales` and `_reading_lists_v_locales`,
   then drops `reviews_locales.title` and `_reviews_v_locales.version_title`.

Step 4 is the loss. **Every Indonesian translation in those five tables is
destroyed, and so is every Indonesian review title** — that one lived in a column
of `reviews_locales` that the `down()` drops rather than copies back. The command
takes no backup first: it runs `down()`, deletes the migration's row, and that is
all it does. The English content comes back because step 2 copied it; the
Indonesian content does not come back at all.

The general lesson is not about this one migration: read the `down()` of the
migration you are about to revert before you rely on it. Some restore everything,
some restore the default locale, some drop tables outright. The review-body
localization, `20251214_135240`, has the same shape one layer down — its `down()`
also `DROP TABLE ... CASCADE`s `reviews_locales` and `_reviews_v_locales` after
copying the English values back, so it too restores English and discards
Indonesian.

---

## When a revert is unsafe

Reverting is unsafe in four situations, and at least one of them applies to most
real incidents.

- **New code is already deployed.** The serving image reads the columns the
  revert just dropped, so the site breaks in a new way instead of recovering.
- **The batch holds more than one migration.** Reverting takes unrelated
  migrations with it, including ones whose `down()` loses data.
- **The `down()` is lossy.** Data that a forward fix would have kept is gone
  permanently.
- **Either order has a window.** The previous image expects the previous schema,
  so "roll back the image first" and "revert the schema first" both leave a
  moment where the two disagree. There is no free ordering.

Rough guidance:

| Situation                                       | Prefer                                         |
| ----------------------------------------------- | ---------------------------------------------- |
| Data is at stake                                | A forward fix: a new migration that repairs it |
| The site is down and the `down()` is understood | A revert, accepting the data loss              |
| The `down()` is lossy and the data matters      | A forward fix, always                          |
| You have not read the `down()`                  | Neither — read it first                        |

There is deliberately no automatic rollback in the pipeline. The localization
`down()` discards translations, so reverting has to be a decision someone makes
with that fact in front of them, not a step a workflow takes on its own.

---

## Declaring a destructive migration

Any migration whose `up()` contains `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`,
`RENAME ... TO` or `TRUNCATE` must carry a justification comment:

```ts
// destructive: drops the ten content columns the `*_locales` tables replace —
// ...what is dropped, and why it cannot be reintroduced.
export async function up({ db }: MigrateUpArgs): Promise<void> {
```

`src/migrations/__tests__/destructive-markers.test.ts` fails `bun test` when a
flagged file has no marker, so this is enforced in CI and in the pre-commit hook
rather than by memory. `down()` bodies are not scanned: reverting is the one
place a drop belongs. (The exception is a file with no `up` at all — the scan
then reads the whole file rather than assume there is nothing to find.)

Three migrations currently carry a marker: `20251214_135240`,
`20261008_131000_commenters_email_hash_fix` and
`20261023_193922_localize_taxonomy_and_reading_list_content`.

**Scope, precisely.** The scan flags `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`,
`RENAME ... TO` and `TRUNCATE`. A rename is included because it breaks a deployed image exactly
the way a drop does: the old name is gone and every query using it fails with
`42703`. `DROP NOT NULL`, `DROP CONSTRAINT` and `DROP DEFAULT` are **not**
flagged — they loosen a constraint, they do not remove data. `DELETE FROM` is not
flagged either, and neither is `DROP INDEX`, which costs performance rather than
correctness. SQL comments are stripped before matching, so a note mentioning a
`DROP` does not force a marker, though a `DROP` inside a string literal does.

The scan reads from `up` to `down` and survives either declaration order, so a
file that declares `down` first is still inspected rather than silently passing.
A comment that merely mentions the `down` signature is not mistaken for it.

**Placement is convention, not enforcement.** The test looks for the marker
anywhere in the file; putting it directly above the statement it justifies is
what makes it readable at review time. That is the point: on 2026-10-24 a
ten-column drop landed under a comment claiming migrations were additive, and
nobody had to justify it. The marker turns that into a sentence someone writes
and a reviewer reads.

---

## If a deploy goes wrong

Work through this in order. Do not skip step 2.

1. **Check the run.** Which job failed — `migrate`, `build-and-push`, `deploy`,
   or `verify`? A failed `build-and-push` means the database has moved and no new
   image exists; a failed `verify` means the image may be fine and the site is
   not.
2. **Look at the schema.** `bun run payload migrate:status`. Note the highest
   batch and how many migrations are in it.
3. **Read the `down()`** of every migration in that batch. Write down what it
   restores and what it destroys.
4. **Decide: revert or forward fix.** If data is at stake, forward fix. If the
   site is down and the `down()` is understood, reverting is legitimate.
5. **Only then act.** A revert is one command and it is not reversible:
   `bun run payload migrate:down`.
6. **Tell someone what was lost.** If a lossy `down()` ran, record which
   translations or records are gone while the deploy is still fresh.
