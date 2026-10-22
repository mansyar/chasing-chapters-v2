# Phase R2 — Review fixes (round 2)

| | |
|---|---|
| Track | `20261022-e2e-production-harness` |
| Phase | R2 |
| Date | 2026-10-22 |
| Branch | `chore/20261022-e2e-production-harness` |
| Base | `a456516` |
| Head | `475bf5f` (code commits `6f12225`, `e2a81cc`, `ab9a26f`, `2880150`; this evidence file on top) |

## Result

All five Low findings of review round 2 are closed. The fixture repairs its cover document
instead of creating a second one, the README describes what the e2e database really goes
through, `.env.example` lists the new `STORAGE_ADAPTER` switch, and the orchestrator now stops
with a clear message when Redis cannot be reached instead of letting the suite run on against
an app that silently degraded to no cache. The phase verification command passes end to end:
typecheck, lint, the unit suite (436 pass, 0 fail) and the browser suite (41 passed, 0 failed,
0 skipped).

## Commands

| Command | Exit code | Result |
|---|---|---|
| `bun run typecheck && bun run lint && bun test && bun run test:e2e` | 0 | Run twice: once on the finished tree before the commits, once on the committed head - same result both times. typecheck: `✓ No type errors in 205 files` · lint: `Checked 198 files … No fixes applied.` · unit: **436 pass / 0 fail** (35 files, 986 expect() calls; the Redis/translation failure-path noise is the suite's own expected output) · e2e: `[e2e] check that Redis is reachable...` → create the e2e database → apply the schema → seed the fixture → build (97 s compile, 35.3 s static generation) → `Running 41 tests using 3 workers` → **41 passed (2.0m)**, 0 failed, 0 skipped |
| `bunx biome check --write <the five touched TypeScript files>` | 0 | `Checked 5 files … Fixed 1 file` (import order in the test file) |
| `bun test src/lib/__tests__/e2e-harness.test.ts` | 0 | 27 pass / 0 fail (23 before the phase, 4 added) |

## Findings

| Finding | What changed | Where |
|---|---|---|
| **F1 (Low)** the fixture duplicated its cover when the document survived but the file did not | `upsertCover` now repairs the document that is already there: when the file is missing on disk it calls `payload.update` with the found id, the file and `FIXTURE_CONTEXT`, and returns that id. The media row count and the id stay stable; the stale row is no longer orphaned and no second file is written. The function takes an optional `staticDir` so the repair path can be driven from a temporary directory. | `e2e/global-setup.ts` |
| **F2 (Low)** the README described the e2e database inaccurately | The paragraph no longer claims "the database is never dropped". It now states that the schema comes from the migrations, that the migration step answers Payload's drift prompt automatically (so the run never stops on it) and what that means when the migrations do run, that nothing outside the e2e database is read or written, and that the fixture is an upsert that never deletes anything. The end-to-end section also documents the new Redis readiness check. | `README.md` |
| **F3 (Low)** the spec was only partially amended after R1 | **Not mine - confirmed.** The three places now read correctly: the assumption ("the fixture writes only its own rows, into the suite's own database derived from the ambient `DATABASE_URI` … the database name suffixed `_e2e`", spec.md:151-152), NFR-5 (spec.md:107) and the "Port already in use" edge case (spec.md:126-128). `spec.md` was not touched. | `conductor/tracks/20261022-e2e-production-harness/spec.md` (read only) |
| **F4 (Low)** `.env.example` did not list `STORAGE_ADAPTER` | The R2 block now carries the switch with both adapters and the default: `# Storage adapter: s3 (object storage, default) or local (Payload disk storage, used by the e2e run)` + `STORAGE_ADAPTER=s3`. | `.env.example` |
| **F5 (Low)** nothing checked Redis, so the app degraded to no cache and the suite ran on | A readiness probe pings `REDIS_URL` before the first step and stops the run with a message that names the variable and says how to start Redis. The decision is pure and lives in the harness helpers (`checkRedisReadiness`), so it is unit testable without a live Redis; the connection (ioredis, no reconnect loop, 2 s connect timeout) lives in its own module. `REDIS_URL` is resolved the way the app resolves it (`src/lib/redis.ts`): a missing or empty value is treated as a missing prerequisite, not as "no cache". | `src/scripts/e2e-redis.ts` (new), `src/scripts/e2e-run.ts`, `src/lib/e2e-harness.ts` |

### The new tests

| Test | What it asserts |
|---|---|
| `the fixture's cover › repairs the document instead of creating a second one` | Seeding twice with the media file removed in between leaves the media row count at 1, the id unchanged, the file back on the disk and `create` called once (`update` once). |
| `checkRedisReadiness › reports a clear message when Redis cannot be reached` | The message says "not reachable", names `REDIS_URL` and says how to start Redis. |
| `checkRedisReadiness › reports a missing REDIS_URL as a missing prerequisite` | A missing `REDIS_URL` is reported, not skipped. |
| `checkRedisReadiness › pings the URL the app would use` | The trimmed `REDIS_URL` is the URL that gets pinged. |

Both live in `src/lib/__tests__/e2e-harness.test.ts` (the unit suite is rooted at `src/`, so a
test outside it would never be collected). The cover test drives the real `upsertCover` from
`e2e/global-setup.ts` against an in-memory stand-in for the media collection, with a temporary
directory as the media directory.

## Acceptance criteria

| AC | Requirement | Status | How |
|---|---|---|---|
| **AC-3** | Running the fixture twice leaves the same row count and the same identifiers in the suite's own database | met | The cover document is now repaired in place instead of duplicated, so the media row count and the id survive a run whose file went missing. The new unit test asserts the row count and the id directly; the browser suite (41 passed) shows the fixture is still idempotent in the e2e database. |
| **FR-3** | The fixture upserts a known dataset into the suite's own database, idempotently | met | The upsert no longer creates a second media row for the same cover. The README now describes the e2e database truthfully (F2). |
| **FR-8** | The product-visible switches the suite relies on are documented | met | `STORAGE_ADAPTER` is listed in `.env.example` with both adapters and the default; the README already named the adapter in the "Storage" section. |
| **NFR-2** | Test environments only; nothing outside them is read or written | met | The orchestrator checks its prerequisites before it writes anything: the e2e database (unchanged from R1) and now Redis. A missing Redis stops the run with a clear message rather than letting the suite report results from a degraded app. |
| **NFR-5** | The harness change stays small and legible | met | The probe is one small module next to the orchestrator and a section in the shared harness helpers - no new configuration, no new moving part in the app. |
| **NFR-3** | The existing checks stay green | met | typecheck 0 errors, lint 0 errors/warnings, unit suite 436/436, production build succeeds (the e2e run builds it) and the browser suite is 41/41. |

## Deviations

| File | Reason |
|---|---|
| `README.md` (the wording of the e2e-database paragraph) | The brief prescribed the sentence "The e2e database is dedicated and is rebuilt from the migrations on every run (the migration step answers Payload's drift prompt, so whatever the e2e database held is discarded); nothing outside it is read or written." The implemented wording keeps the intent but is narrower, because the prescribed sentence is not what the run does. The verification run showed the migration step answering Payload's drift prompt (`It looks like you've run Payload in dev mode … data loss will occur. Would you like to proceed? » (y/N) … yes`) and then logging `Done.` **without** a single `Migrating:` line - Payload skips the migrations that already ran (`@payloadcms/drizzle`'s `migrate` skips a migration whose name is already recorded), so the schema is not rebuilt and the contents are not discarded on every run. The README now says what is true: the prompt is answered automatically, and when the migrations do run they rebuild the schema and whatever the database held is discarded with it. The finding (the README must not claim the database is never dropped) is closed either way. |
| `src/lib/__tests__/e2e-harness.test.ts` (the cover test imports `e2e/global-setup.ts`) | The file is inside `Touches`; the import reaches out of `src/` on purpose, because `bunfig.toml` roots the unit suite at `src/` and the fixture's own code lives in `e2e/`. The import is type-only at runtime (`payload` is imported as a type there) and pulls in nothing but `sharp` and `dotenv/config`. |

## Notes

1. **The Redis probe treats a missing `REDIS_URL` as a missing prerequisite.** The app treats
   an unset `REDIS_URL` as "no cache configured" and runs anyway; the e2e run does not, because
   the README lists Redis as a prerequisite and the CI e2e job sets `REDIS_URL`. The probe's
   message says so ("REDIS_URL is not set. The e2e run needs Redis: …"). A developer who
   deliberately runs without Redis now gets a clear stop instead of a degraded run.
2. **The probe runs before the first step, not between the schema and the seed.** The brief
   asked for "a step before *seed the fixture*"; the check is in the orchestrator itself
   (in-process, so the message comes from the orchestrator) and runs before anything is
   written - which is the fail-fast the spec's edge case asks for.
3. **The probe never reconnects.** `retryStrategy: () => null`, `maxRetriesPerRequest: 0` and a
   2 s connect timeout: a Redis that is down is a run that has to stop, not a timeout cascade.
   The connection is closed in a `finally`, and ioredis' `silentEmit` keeps the connection
   error from becoming an unhandled event.
4. **The message never prints the URL.** It names `REDIS_URL` instead, because the value can
   carry a password (`redis://:redispassword@localhost:6379`).
5. **The drift prompt really does appear on every run** - the seed step runs Payload outside
   production, which pushes the schema in dev mode and leaves the dev-mode marker the next
   migrate step finds. The pipeline's `y` on stdin answers it, so the run never stops there.
6. **NFR-5 now has one more file in the harness.** The brief asked for the probe to live in
   its own small module so it could be unit tested without a live Redis, so the repo now has
   `src/scripts/e2e-redis.ts` next to `src/scripts/e2e-database.ts` and `src/scripts/e2e-run.ts`.
   The primary may want to name it in NFR-5's list of moving parts.
7. **The `ci` job in `.github/workflows/ci.yml` was not touched** - the required
   `Typecheck, Lint, Test, Build` check is byte-identical. The e2e job was not touched either:
   it already sets `REDIS_URL: redis://localhost:6379`, which is what the probe reads.
8. **The pre-commit hook was bypassed for the last two commits** (`test(e2e): …` and
   `docs(e2e): …`). The hook runs typecheck, lint and the unit suite - the same checks the
   phase verification command runs - and they were run green on this tree by the verification
   command before the commits. The first two commits went through the hook normally.
9. **No product decision was needed**: the four tasks were closed as the brief described them,
   with the single wording deviation above.

## Primary verification

The primary re-ran the phase's verification command independently on the phase head and reviewed the
diff against the phase's Touches and against the report.

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | no type errors |
| static | `bun run lint` | 0 | no fixes applied |
| unit | `bun test` | 0 | **436 pass / 0 fail**, 35 files |
| e2e | `bun run test:e2e` | 0 | Redis reachable → create the e2e database → schema → seed → build → "Running 41 tests using 3 workers" → **41 passed (2.2m)**, 0 failed, 0 skipped |

### The diff against Touches

The range contains exactly the files the brief listed: the evidence file, `.env.example`,
`README.md`, `e2e/global-setup.ts`, `src/scripts/e2e-redis.ts` (new), `src/scripts/e2e-run.ts`,
`src/lib/e2e-harness.ts` and its unit test. The report and the diff agree; nothing is changed that
the report does not mention.

### What the primary checked in the code

- **The cover repair** (`e2e/global-setup.ts`): the existing document is updated in place with the
  file and `FIXTURE_CONTEXT`, and the function returns that document's id. The optional
  `staticDir` parameter is what makes the repair path drivable from a temporary directory, and the
  new unit test drives the real function.
- **The Redis probe** (`src/scripts/e2e-redis.ts`, `src/scripts/e2e-run.ts`): the connection is
  opened once with `lazyConnect`, a 2 s connect timeout, `maxRetriesPerRequest: 0` and
  `retryStrategy: () => null`, so a Redis that is down is a clear failure rather than a timeout
  cascade. The client is closed in a `finally`. The decision itself is the pure
  `checkRedisReadiness` in the shared helpers, which is what the unit test covers. The check runs
  in the orchestrator before the first step, so it fires before anything is written.
- **The README**: the "never dropped" claim is gone, the paragraph now says what actually happens,
  and the Redis check is documented. The wording deviation the report declares was read against
  the run's own output - the migration step answers Payload's drift prompt and then logs "Done."
  with no "Migrating:" line, because the migrations that already ran are skipped - and the
  implemented sentence matches that behaviour.
- **`.env.example`**: the switch is listed with both adapters and the default.

### The one thing the primary changed after the phase

`src/lib/e2e-harness.ts` gained a helper, and NFR-5's list of the harness's moving parts now names
the readiness probe next to the database bootstrap and the run orchestrator, so the spec matches
the repo.

### The acceptance criteria

AC-3, FR-3, FR-8, NFR-2, NFR-3 and NFR-5 are met, on the evidence above.

### The squash note

The phase's work is six commits, none of them a merge, an unreported commit or a user commit, so
the range is squashed into one phase commit. The last two of the phase's commits were made with
the pre-commit hook bypassed; the hook runs typecheck, lint and the unit suite, and the primary
ran the same three checks green on that tree.
