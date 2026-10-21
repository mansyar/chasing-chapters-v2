# Phase R1 Verification — Review Fixes

**Date:** 2026-10-21
**Branch:** `chore/20261021-pr-validation-ci`
**Phase base:** `ab2e739` (review round-1 commit)
**Executed by:** primary agent (F3 requires `gh api`, F5 requires `gh pr`/`gh run` operations outside the phase-subagent shell allowlist; F1/F2/F4 are bundled trivial edits whose real verification is the live CI run)
**Result:** verified

## Findings resolution

| Finding | Resolution | Verified by |
|---|---|---|
| F1 (High) — bun 1.4.2 breaks `bun check` | `ci.yml` pin → `1.4.3` with justification comment (run 39567563082 reference); spec NFR-1 + Scope amended to 1.4.3 with rationale | Typecheck step green in run 39571390778 |
| F2 (High) — migrate/test steps ran without env | Placeholder env block moved to **job level** (recovered from validated scratch config `ea76572` via contents API); Build-step env removed — single source of truth | Migrate + Test + Build steps green in run 39571390778 (no `.env` present) |
| F3 (Medium) — `enforce_admins: false` vs spec edge case | Branch protection re-applied with `enforce_admins: true` (spec's "no admin bypass" honored); `gh api` GET reads back `enforce_admins.enabled=true` | protection read-back after PUT |
| F4 (Low) — FR-2 step list missing migrate step | spec.md FR-2 amended to include `echo y \| bun run payload migrate` with amendment note | spec diff in `fa919c3` |
| F5 (Low) — evidence described non-committed config | Live run from a branch containing the **committed** ci.yml: run [39571390778](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39571390778) — success, 2m 53s, `mergeStateStatus=CLEAN`; phase-2.md addendum added, `ea76572` analysis kept as history | this file + phase-2.md addendum |

## Commands

| Command | Result |
|---|---|
| `bun run typecheck && bun run lint && bun test` (post-fix, local) | ✅ 0 errors / 0 warnings (165 files) / 236 pass 0 fail — re-verified by husky pre-commit on `fa919c3` |
| `gh run watch 39571390778 --exit-status` | exit 0 — full pipeline green from committed config |
| `gh pr view 14 --json mergeStateStatus` | `CLEAN` (required check green, up-to-date under strict=true) |
| `gh api .../branches/main/protection` | `enforce_admins.enabled = true`, required context `Typecheck, Lint, Test, Build`, strict=true |

## Notes

- Scratch PR #14 (branch `scratch/ci-validation-2` at fixed HEAD `fa919c3`) validated the committed file; closed unmerged, branches deleted — run URL is the durable record.
- `enforce_admins: true` gates PR merges (incl. admin bypass button); direct pushes to `main` remain possible as no push restrictions are set — required status checks apply to PR merges by design.
- Squash note: R1 task hashes are the single commit `fa919c3` (F1/F2/F4 bundled); F3/F5 are API/evidence operations, not commits.

## Deviations

None.
