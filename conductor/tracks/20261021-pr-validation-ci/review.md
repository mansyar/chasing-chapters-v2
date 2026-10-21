# Review — 20261021-pr-validation-ci

**Track:** 20261021-pr-validation-ci
**Type:** chore
**Branch:** `chore/20261021-pr-validation-ci`
**Range:** `d15278f..HEAD`
**Date:** 2026-10-21
**Verdict:** BLOCK

## Summary

The diff is clean at the file level — biome.json's 24 severity flips verified line-by-line (no rule changes, includes untouched), ci.yml structurally sound with no secrets. However, the committed `ci.yml` materially diverges from the configuration that actually ran green on the scratch PR: the cherry-pick from the scratch branch carried only the 7-line migrate step, dropping the bun `1.4.3` pin (the committed `1.4.2` breaks the `bun check` typecheck script — proven by CI run 39567563082) and the job-level env block (the migrate and test steps fail without it — proven by run 39567897747; `src/lib/env.ts` validates at module load). As shipped, the track's own PR would fail its required check. Additionally, branch protection was applied with `enforce_admins: false`, contradicting the spec's explicit no-admin-bypass edge case, while phase-2.md records "Deviations: None".

## Verification

| Layer | Command | Result | Evidence |
|---|---|---|---|
| Static | `bun run typecheck` | pass — 0 errors, 172 files | (local Bun is 1.4.3-canary.1; CI pins 1.4.2 — see F1) |
| Static | `bun run lint` | pass — 0 errors / 0 warnings at all-error severities, 165 files | phase-1.md |
| Unit | `bun test` | pass — 236/0 (local, .env auto-loaded; CI Test step lacks env — see F2) | phase-2.md |
| Build | CI build step | pass — on scratch config only ([39568702257](https://github.com/mansyar/chasing-chapters-v2/actions/runs/39568702257)) | phase-2.md |
| Diff audit | `git diff d15278f..HEAD -- biome.json` | pass — exactly 24 warn→error flips | this review |
| Config audit | HEAD ci.yml vs scratch `ea76572` (recovered via contents API) | **fail** — missing job-level env + 1.4.3 pin | this review |

## Requirements

| ID | Implemented by | Verified by | Status |
|---|---|---|---|
| FR-1 | P1.T2 | live run 39568702257 on PR #13 | covered |
| FR-2 | P1.T2 + P2 (migrate step) | run 39568702257 — **on scratch config, not HEAD's** | partial |
| FR-3 | P1.T2 | run 39568702257 build step | covered |
| FR-4 | P1.T1 | 24-flip diff; lint green; red-path run 39569200343 | covered |
| FR-5 | P1.T2 | no `secrets.*`; placeholders verified non-secret | covered |
| FR-6 | P2.T3 | protection config + BLOCKED/CLEAN on PR #13 | covered (but see F3) |
| NFR-1 | P1.T2 | actions @v4/@v2; bun-version **1.4.2** vs validated 1.4.3 | partial |
| NFR-2 | P1.T2, P2.T4 | 3m 50s | covered |
| NFR-3 | P1.T2 | no secrets.* references | covered |
| NFR-4 | P1, P2 | diff = ci.yml + biome.json + conductor files only | covered |
| AC-1 | P1.T2, P2.T1 | run 39568702257 — on scratch ci.yml | partial |
| AC-2 | P2.T2 | run 39569200343 failed at Lint | covered |
| AC-3 | P2.T3 | BLOCKED→CLEAN on PR #13 | covered |
| AC-4 | P2.T4 | 3m 50s recorded | covered |
| AC-5 | P1.T1 | lint 0/0 + CI lint step green | covered |

## Findings

### Medium
None.

**F3 — Medium — conductor/tracks/20261021-pr-validation-ci/verification/phase-2.md:41-44**
Branch protection applied with `enforce_admins: false`, exempting the repo owner from the required check (merge-bypass button available), while the spec's Edge Cases (spec.md:105-107) state "no admin bypass configured, keeping the gate honest". phase-2.md records "Deviations: None" — the deviation is silent.
*Fix:* set `enforce_admins: true` via the same `gh api` call (spec-mandated; direct pushes to `main` remain possible since no push restrictions are configured — required checks gate PR merges).
*Requirement:* FR-6, AC-3

### Low
**F4 — Low — conductor/tracks/20261021-pr-validation-ci/spec.md:71**
FR-2 enumerates exactly install → typecheck → lint → test → build, but the shipped workflow inserts "Run database migrations" between install and typecheck (required on a fresh CI postgres; justified and documented in phase-2.md notes).
*Fix:* add the migrate step to FR-2's list.
*Requirement:* FR-2

**F5 — Low — conductor/tracks/20261021-pr-validation-ci/verification/phase-2.md:49-51**
Evidence describes a job-level env block and bun 1.4.3 that do not exist in the committed ci.yml — the green-run URLs record a configuration whose only copy is unreachable commit `ea76572`. This is how F1/F2 slipped through phase verification.
*Fix:* after F1/F2, run live CI from a branch containing the committed file and update phase-2.md to reference that run; keep the `ea76572` analysis as history.
*Requirement:* AC-1

## Overrides

None.

## Plan compliance

All tasks `[x]`; checkpoints `7d5de2b` (P1) and `18af5a4` (P2) present; diff within Touches; per-phase deviations documented. **Partial:** Phase 2's "verified" status does not transfer to the committed artifact — the green/red runs exercised a scratch-branch ci.yml of which only the migrate step was cherry-picked (`git diff 7d5de2b..HEAD --stat` confirms). The bun 1.4.3 deviation from NFR-1's literal wording is recorded nowhere.

## Out of scope

None observed.

## Debt

Strict mode — every finding must be fixed before PR. No deferrals.

## Doc sync

Updated: `conductor/tech-stack.md` deploy line now mentions ci.yml and the required check.

## History

| Round | Verdict | C / H / M / L | Fixed |
|---|---|---|---|
| 1 | BLOCK | 0 / 2 / 1 / 2 | — |
