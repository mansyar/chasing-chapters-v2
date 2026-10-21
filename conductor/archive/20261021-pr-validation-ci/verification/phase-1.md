# Phase 1 Verification — Strict lint config and CI workflow authoring

- **Track:** `20261021-pr-validation-ci`
- **Phase:** 1
- **Date:** 2026-10-21
- **Branch:** `chore/20261021-pr-validation-ci`
- **Base commit:** `fe15d4e`
- **Head commit:** `0874fef`
- **Commits:** `8e12718` (chore(lint): promote all biome warn severities to error), `0874fef` (chore(ci): add pull_request validation workflow with postgres service)
- **Result:** verified

## Primary verification

Independently verified by the primary agent on `4622de4`: clean tree; changed files exactly match the Touches boundary (`biome.json`, `.github/workflows/ci.yml`, evidence file). `biome.json` diff is 24 mechanical `"warn"` → `"error"` flips, no rule or config changes. Re-ran `bun run typecheck` (0 errors, 172 files), `bun run lint` (165 files, 0 errors, 0 warnings), `bun test` (236 pass / 0 fail). Workflow YAML reviewed: correct trigger, single job, service healthcheck, `DATABASE_URI` matching `src/lib/env.ts`/`deploy.yml`, placeholder non-secret build env, no secrets. Build risk noted for Phase 2: CI's fresh empty Postgres may require a schema-push step before `next build` prerendering (Phase 2 Touches already cover `ci.yml` fixes). Evidence accepted.

## Commands

| Layer  | Command                                     | Exit | Summary                                                                                          |
| ------ | ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| static | `bun run lint` (after severity promotion)   | 0    | `biome check .` — 165 files checked, no fixes applied, 0 errors / 0 warnings at error severity.  |
| static | `bun run typecheck`                         | 0    | `bun check` — no type errors in 172 files.                                                       |
| static | `bun run build` (local probe, CI-mirrored env) | 0 | `next build --webpack` succeeded with exactly the env values the CI build step sets (see Notes). |
| unit   | `bun test`                                  | 0    | 236 pass, 0 fail across 22 files (454 expect calls).                                             |

Full phase verification command `bun run typecheck && bun run lint && bun test` run standalone after the final commit: all green (typecheck 0 errors; lint 0 errors / 0 warnings; 236/236 tests pass).

## YAML validity

Machine validation via `bunx` / inline `bun -e` was blocked by session shell permissions (permission.rejected), so the brief's fallback — careful manual check — was used:

- Simple structure verified by reading the file: consistent 2-space indentation, valid folded block scalar (`>-`) for the service healthcheck options.
- `5432:5432` is a plain YAML scalar (colon not followed by space); no sexagesimal ambiguity.
- `on: pull_request` with `branches: [main]`; concurrency group uses the exact `${{ github.workflow }}-${{ github.ref }}` form from the plan.
- Actions pinned to major tags only: `actions/checkout@v4`, `oven-sh/setup-bun@v2`.
- `grep` for `secrets.` returns zero non-comment matches — no `${{ secrets.` anywhere (NFR-3).

## Acceptance Criteria

| ID   | Criterion                                                                                                  | Evidence                                                                                                          | Status                  |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| AC-5 | Repo-wide lint after the severity promotion reports 0 errors and 0 warnings (local and CI agree).          | `bun run lint` exit 0 after flipping all 24 `warn` → `error` in `biome.json`; CI runs the same `bun run lint` step. | verified (local half; CI half in Phase 2) |

## Requirements addressed by this phase

| ID    | Requirement                                                       | Evidence                                                                                                             |
| ----- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Workflow on every PR to `main` (open + push)                      | `on: pull_request: branches: [main]` in `ci.yml` (live trigger behavior verified in Phase 2)                          |
| FR-2  | Single job runs install → typecheck → lint → test → build         | Single `ci` job, steps in that exact order; each `run:` step fails the job on non-zero exit                          |
| FR-3  | Build against `postgres:16` service with DB connection string     | `services.postgres` image `postgres:16`, `pg_isready` healthcheck, `DATABASE_URI` wired to the build step             |
| FR-4  | All biome `warn` severities promoted to `error`, lint stays green | 24 replacements in `biome.json` (9 top-level rules + 15 in the JSX override block); lint 0 errors / 0 warnings        |
| FR-5  | Concurrency cancels superseded PR runs                            | `concurrency: group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`                            |
| NFR-1 | Bun pinned `1.4.2`; actions pinned by major tag                   | `bun-version: 1.4.2` (matches `deploy.yml`); `@v4` / `@v2` tags                                                       |
| NFR-2 | CI completes ≤ 5 min                                              | Designed for speed (single job, no caching beyond defaults); measured in Phase 2 (AC-4)                               |
| NFR-3 | No repository secrets required                                    | No `secrets.*` references; build env uses inline non-secret placeholder values (see Deviations)                       |

## Deviations

1. **`DATABASE_URI` instead of the spec's literal "DATABASE_URL"** — the application reads `DATABASE_URI` (`src/lib/env.ts`, `src/payload.config.ts`) and `deploy.yml` uses the same name; the plan itself directs "mirror `deploy.yml` env conventions". The spec's "DATABASE_URL" is read as generic phrasing for the DB connection string.
2. **Postgres credentials/db name mirror `docker-compose.yml`** (`POSTGRES_PASSWORD: postgrespassword`, `POSTGRES_DB: chasing-chapters`, user `postgres`) rather than the brief's nominal `postgres`/`postgres` defaults — the brief explicitly instructs reusing the compose values where sensible for consistency.
3. **Additional non-secret placeholder env values on the build step** (`PAYLOAD_SECRET`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) — required because `src/lib/env.ts` zod-validates these when `payload.config` loads during `next build`; without them the build fails env validation before reaching the DB. Values are inline literals (not `secrets.*`), preserving NFR-3.
4. **YAML validated manually** instead of via `bunx yaml` — `bunx` and `bun -e` invocations were permission-blocked in this session; the manual check (above) is the brief's sanctioned fallback.

## Notes for Phase 2

- **No `echo y |` needed for the build step.** The Payload dev-push drift prompt exists only in `bun run payload migrate` (see `deploy.yml`); `bun run build` does not read stdin. Confirmed by the local build probe completing without any prompt handling.
- **Local build probe:** `bun run build` with exactly the CI build-step env exited 0 (9/9 static pages generated). The pre-existing `google-gax` `Module not found` compile warning is non-fatal and unrelated to this track. The Redis-lazy assumption held — the build succeeded without Redis connectivity handling.
- **Known risk to watch in Phase 2:** the local probe ran against the existing dev database (schema already present). CI's service container is a *fresh* empty postgres; if prerendering queries fail on missing tables, Phase 2 may need a migrate/push step before the build in `ci.yml` (allowed: Phase 2 Touches include `ci.yml` fixes).
- `bun install --frozen-lockfile` used because `bun.lock` exists (matches `deploy.yml`).
- Tests print expected stderr noise (mocked Redis/Translate failures) — all 236 tests pass.
