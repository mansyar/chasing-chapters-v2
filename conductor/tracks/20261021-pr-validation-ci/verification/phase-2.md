# Phase 2 Verification — Live CI validation and branch protection

**Date:** 2026-10-21
**Branch:** `chore/20261021-pr-validation-ci` (track branch) + ephemeral `scratch/ci-validation`
**Phase base:** `b4ab3a0`
**Executed by:** primary agent (Phase 2 requires `gh pr` / `gh api` operations outside the phase-subagent shell allowlist — same pattern as the Phase 3 e2e gate in track `20261021-lint-debt-cleanup`)
**Result:** verified

## Commands

| Command | Result |
|---|---|
| `gh run watch 39568702257 --exit-status` | exit 0 — full pipeline green |
| `gh run watch 39569200343 --exit-status` | exit 1 — failed at `Lint` step (by design) |
| `gh run watch 39569412486 --exit-status` | exit 0 — recovery green after probe removal |
| `gh api repos/.../branches/main/protection` | required check `Typecheck, Lint, Test, Build`, strict=true |
| `gh pr view 13 --json mergeStateStatus` | `BLOCKED` while head red → `CLEAN` while head green |
| `bun run lint` (local, violation staged) | `Found 1 error` — husky pre-commit rejected the probe commit |

## Acceptance criteria

| AC | Criterion | Result |
|---|---|---|
| AC-1 | CI workflow triggers on PRs to main | ✅ run 39568702257 fired on scratch PR #13 (`pull_request` → main) |
| AC-2 | Violation causes red run | ✅ `src/ci-lint-probe.ts` with `any` → run 39569200343 failed at **Lint** (only that step) |
| AC-3 | Required check blocks merge while red | ✅ protection active + red head → `mergeStateStatus=BLOCKED`; after green → `CLEAN` |
| AC-4 | Pipeline completes ≤ 5 min | ✅ green run 39568702257: **3m 50s**; recovery run: 2m 46s |

## Live CI runs (evidence URLs)

| Run | Trigger commit | Outcome | Duration |
|---|---|---|---|
| [39568702257](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39568702257) | `ea76572` (migrations fix on scratch branch) | ✅ success — install, migrate, typecheck, lint, test, build | 3m 50s |
| [39569200343](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39569200343) | `7cd7a63` (lint-violation probe) | ❌ failed at `Lint` step — `noExplicitAny` at error severity | ~2m |
| [39569412486](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39569412486) | `deca60a` (probe removed) | ✅ success | 2m 46s |

Scratch-branch commits (`ea76572`, `7cd7a63`, `deca60a`) are unreachable after `scratch/ci-validation` deletion — the run URLs above are the durable record. The migrations fix was cherry-picked onto the track branch as `18af5a4`.

## Branch protection (AC-3)

- `PUT /repos/mansyar/chasing-chapters-v2/branches/main/protection`:
  `required_status_checks: { strict: true, contexts: ["Typecheck, Lint, Test, Build"] }`, `enforce_admins: false`, no review requirement, no restrictions, force-push/deletion disallowed.
- Check-run context name taken from the live run (`commits/7cd7a63/check-runs` → `Typecheck, Lint, Test, Build`), not guessed.
- Blocking proof captured on scratch PR #13: red head → `BLOCKED`; green head → `CLEAN`.

## Notes

- **Local defense-in-depth bonus:** the husky pre-commit hook rejected the violation commit before it could be pushed; `--no-verify` was used deliberately for the CI-level red-path test.
- Run 39567563082 (earlier failure, `Script not found "check"` on `bun check`) and 39567897747 (`bun test` failing on missing env at module-load) were iterative fixes during CI authoring; both superseded by the job-level env block and the `bun run typecheck` script name. They are part of this phase's history on the scratch branch.
- CI build requires schema: added `echo y | bun run payload migrate` step (mirrors `deploy.yml` lines 31–47; no-op on a clean migration-managed DB, auto-accepts Payload's dev-push drift prompt otherwise).
- No `secrets.*` used anywhere; all build env values are non-secret placeholders satisfying `src/lib/env.ts` zod validation.

## Deviations

None outside the amended plan: Phase 2 `Touches` permits `ci.yml` fixes exposed by validation (the migrations step is exactly that), and evidence/conductor state files are primary-owned.

## Addendum (R1 reconciliation — review F5)

Round-1 review found that the cherry-pick from the scratch branch carried only the 7-line migrate step, dropping two fixes that the green runs depended on (bun `1.4.3` pin — `bun check` doesn't exist in 1.4.2, proven by run 39567563082; job-level env block — `env.ts` module-load validation breaks migrate/test without it, proven by run 39567897747). The validated scratch configuration (commit `ea76572`, recovered via the GitHub contents API) was restored to the committed file in `fa919c3` (R1.T1) and re-validated end-to-end from a branch containing the **committed** ci.yml: run [39571390778](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39571390778) — success, **2m 53s**, all steps green without a `.env` file, `mergeStateStatus=CLEAN` under branch protection. The scratch-branch run table above is retained as history; the committed-config run is the durable green-path evidence.
