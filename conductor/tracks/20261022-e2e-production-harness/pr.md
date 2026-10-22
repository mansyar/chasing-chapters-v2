# feat(e2e): give the end-to-end suite a production build, a fixture and a signal

## Summary

The end-to-end suite could not be used as evidence: on `main` it failed 16 of 31 tests, every
failure a `page.goto` timeout against a compiling dev server, while a direct request to the same
page returned `200`. The suite also had no data of its own — the seed script creates only genres,
tags and mood tags — so the specs had to skip themselves when the database held no review, and the
admin surfaces the previous track shipped had no browser coverage at all.

This track makes the layer usable: the suite runs against a **production build** served as the
standalone artifact, against a **database of its own** seeded with a **deterministic, idempotent
fixture**, with the translation provider replaced by an **offline stub** so nothing touches the
network, a **bounded worker count**, a **CI job** next to the required check, and browser coverage
for the three author-facing translation surfaces. Two real application defects the suite exposed
were fixed with regression tests.

## Track

- Spec: `conductor/tracks/20261022-e2e-production-harness/spec.md`
- Plan: `conductor/tracks/20261022-e2e-production-harness/plan.md`
- Review: `conductor/tracks/20261022-e2e-production-harness/review.md`
- Integrated verification: `conductor/tracks/20261022-e2e-production-harness/verification/integrated.md`

## What happened

| Phase | Checkpoint | What it did |
| --- | --- | --- |
| 1. Production-Build Harness and Bounded Workers | `c6ffbdc` | The suite is served from the standalone artifact instead of a dev server; the worker count resolves to 3 by default, 1 in CI, and is overridable with `PLAYWRIGHT_WORKERS`. The first green e2e run in the repository's history. |
| 2. Deterministic Fixture and Green Public Suite | `fff8ab1` | A fixture of four published reviews (translated, failed, stale), a reading list, two featured reviews and a throwaway admin, upserted idempotently; the public specs now assert against it unconditionally. 37 passed, 0 skipped. |
| 3. Test-Mode Provider Stub and Admin DOM Specs | `0712969` | `TRANSLATION_TEST_MODE=1` replaces the Google client with a deterministic stub that bypasses the translation cache; the attention bell, the bulk re-translate action and the edit-view poller gained browser specs. 40 passed. |
| 4. CI Job and Final Verification | `4dd1ee3` | A second CI job runs the suite next to the required `Typecheck, Lint, Test, Build` check, whose name and body are untouched; the local run is documented in the README. |
| 5. Fix the Admin Locale Preference Defect | `4e726eb` | The suite exposed a defect: the admin's locale preference was never stored, because the write did not join the login's transaction. Fixed in the app, with a unit and a browser regression test. 41 passed. |
| R1. Review Fixes (round 1) | `3c46191` | Eight findings closed: the suite got a database of its own, the cover image was restored as required and stored on the local disk for the run, the preference owner went back into the data, the revalidation guard was narrowed, the Indonesian content is seeded, and the standalone server replaced `next start`. |
| R2. Review Fixes (round 2) | `3be17dd` | Five findings closed: the fixture repairs its cover document instead of duplicating it, the README tells the truth about the e2e database, `STORAGE_ADAPTER` is listed in `.env.example`, and the run fails fast when Redis is unreachable. |

## Requirements

- [x] **FR-1** — the suite is served from a production build
- [x] **FR-2** — the worker count is bounded and configurable
- [x] **FR-3** — a deterministic fixture, upserted into the suite's own database
- [x] **FR-4** — the public specs assert against the fixture instead of skipping
- [x] **FR-5** — browser coverage for the three translation surfaces
- [x] **FR-6** — the translation provider is stubbed; nothing leaves the machine
- [x] **FR-7** — the suite runs in CI next to the required check
- [x] **FR-8** — application defects the suite proves are fixed, with regression tests
- [x] **NFR-1** — at most three workers plus one application server
- [x] **NFR-2** — test data only; no real credentials and no production data
- [x] **NFR-3** — the existing checks stay green and keep their name
- [x] **NFR-4** — deterministic runs, no dependence on wall-clock thresholds
- [x] **NFR-5** — a small, legible harness change
- [x] **AC-1** .. **AC-8** — all pass (see the integrated verification)

## Verification

| Layer | Command | Result |
| --- | --- | --- |
| static | `bun run typecheck` | 0 — no type errors |
| static | `bun run lint` | 0 — no fixes applied (Biome's formatter runs as a diagnostic, so this covers the format check) |
| unit | `bun test --coverage` | 0 — **436 pass / 0 fail** across 35 files; coverage 85.17% funcs / 88.92% lines (gate: 80% on new code) |
| static | `bun run build` | 0 — 15/15 static pages in 39.1s |
| e2e | `bun run test:e2e` | 0 — create database → check Redis → apply schema → seed → build → serve the standalone artifact → **41 passed (2.2m)**, 0 failed, 0 skipped |

## Review

Three rounds, 17 findings, all closed.

- Round 1 — `BLOCK` (1 High, 3 Medium, 4 Low): the fixture competed with the developer's own rows
  inside fixed-size query windows and the admin specs asserted collection-wide absolute counts, so
  any review in a failed or stale state turned the suite red.
- Round 2 — `PASS WITH FINDINGS` (5 Low): the fixture's cover could be duplicated, the README
  overstated what the e2e database goes through, the spec was only partially amended,
  `.env.example` did not list the storage switch, and nothing checked Redis.
- Round 3 — `PASS WITH FINDINGS` (4 Low, all documentation): the README still misdescribed the
  database's lifecycle, the fixture's Indonesian-content comment stated an invariant it does not
  keep, NFR-5's list of moving parts was incomplete, and the integrated verification was stale.
  All four are closed in the post-review documentation sync.

## Deviations and risks

- **The bulk-action surface is a component on the reviews admin path, not a Payload list-view bulk
  action.** Payload 3.90 hardcodes the list view's bulk actions and the only injection point is the
  root `src/collections/Reviews.ts`. The spec was amended to describe what shipped.
- **The `media` collection is untouched.** A first delivery added
  `upload.filesRequiredOnCreate: false`; it was rejected and reverted — it weakens a production
  invariant and bought nothing, because every cover render site is already guarded.
- **The storage adapter is selectable.** `STORAGE_ADAPTER` picks `s3` (the default, the production
  path) or `local` (Payload's own disk storage, which the e2e run uses so the fixture's cover needs
  no object storage or credentials).
- **The suite runs against its own database**, derived from `DATABASE_URI` with an `_e2e` suffix.
  The developer's own reviews, taxonomy and media are never read, written or deleted; the e2e
  database is never dropped.
- **The migrations are applied only when the e2e database is new.** Payload's drift prompt is
  answered automatically and the schema the run uses is the one Payload syncs when the seed connects
  in development mode. The README says so.
- **Redis is a hard prerequisite of the run**; without it the app degrades to no cache and the rate
  limit the comment spec depends on would change behaviour, so the run stops with a message that
  names the variable.

## Follow-ups

- A DOM/admin e2e harness beyond the three translation surfaces — the admin is still mostly
  unverified.
- A durable job queue for the translation retry, which is still an in-process timer and is lost on
  a redeploy.
- A translation-health view over the whole catalogue.

## Rollback

`git revert` the squashed merge. The migration this track adds (`20261021_140330_add_english_updated_at`
from the previous track) is not touched here; the only schema object this track introduces is the
`STORAGE_ADAPTER` switch, which defaults to `s3` — the production behaviour — and the e2e database,
which is disposable and never dropped.
