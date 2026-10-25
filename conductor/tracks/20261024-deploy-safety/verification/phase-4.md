# Phase 4 — Deploy Workflow Hardening

- **Track:** `20261024-deploy-safety` (Deploy Safety)
- **Phase:** 4 of 5
- **Date:** 2026-10-25
- **Branch:** `chore/20261024-deploy-safety`
- **Base commit:** `22ac231` (branch HEAD at phase start was `ae89e3e`, the plan bookkeeping commit one ahead of the stated base)
- **Head commit:** `1563ad1`
- **Result:** verified

## What this phase changes

Four things, all of them lessons from 2026-10-24:

1. **Deploys cannot interleave.** A workflow-level `concurrency` group
   (`deploy-production`, `cancel-in-progress: false`) queues a second run behind
   the first instead of cancelling it. Workflow-level, not job-level, because a
   per-job group would still let run B's `migrate` race run A's `build-and-push`.
2. **The migrate job runs on Bun 1.4.3**, the same version as all three `ci.yml`
   jobs, with the `bun check` reason carried over so nobody reverts it.
3. **The false invariant is gone.** The comment above `migrate` now states the
   real constraint — migrations must precede the build because prerendering
   reads the schema — and the cost that ordering carries: a destructive
   migration breaks the image that is still serving, for as long as the gap
   lasts. It points at the Phase 1 marker test as the thing that makes such a
   migration reviewable.
4. **A rollout that serves 500 fails the run.** A `verify` job after `deploy`
   checks out the repo, installs Bun (no `bun install` — the smoke module
   imports nothing from `node_modules`), and runs the Phase 2 smoke script
   against `vars.PRODUCTION_BASE_URL`, defaulting to the production origin.

The smoke module's retry budget became configurable (`maxAttempts`,
`retryIntervalMs`) with defaults identical to the previous constants, and the
script grew two flags. The five existing tests in
`src/lib/__tests__/deploy-smoke.test.ts` are byte-identical — that was the
constraint that told me the defaults had to stay defaults, and it held.

## Commands

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `✓ No type errors in 250 files` |
| static | `bun run lint` | 0 | `Checked 240 files. No fixes applied.` |
| unit | `bun test` | 0 | `600 pass`, `0 fail`, `1381 expect() calls`, 48 files |
| phase | `bun run typecheck && bun run lint && bun test` | 0 | all three layers green in one run |
| unit (targeted) | `bun test src/lib/__tests__/deploy-smoke.test.ts` | 0 | `8 pass`, `0 fail`, `31 expect() calls` — 5 existing + 3 new |
| yaml | `bun -e "const {parse}=await import('yaml');parse(await Bun.file('.github/workflows/deploy.yml').text());console.log('yaml ok')"` | 0 | `yaml ok` — run three times, after each structural edit to `deploy.yml` |
| manual | smoke script vs. a throwaway `Bun.serve` on `127.0.0.1:3920` (everything 200, one published review) | 0 | `PASS` × 6 including `/en/reviews/the-lantern`, `7 request(s)`, `Smoke check passed.` |
| manual | smoke script vs. a throwaway server returning 500 on `/api/genres`, no published review, `--max-attempts 3 --interval-ms 10` | 1 | `FAIL /api/genres?limit=1 500 500 500`, four `PASS`, one `SKIP`, `8 request(s)`, `Smoke check failed: /api/genres?limit=1` |
| manual | smoke script vs. a server that never answers, `--max-attempts 2` | 1 | every endpoint `error(The operation timed out.)`, detail probe `SKIP`, `11 request(s)` |
| manual | four bad command lines: `--max-attempts abc`, `--interval-ms 0`, bare `--max-attempts`, no arguments at all | 1 (each) | each prints the usage line; the two value cases also name the flag (`--max-attempts needs a positive whole number`) |

The throwaway servers were started and stopped inside a single `bun -e` call, on
ports 3919–3921, and were never pointed at production. Nothing in this phase
sent a request to `https://chasing-chapters.com`.

## Request-budget arithmetic

**Revised by the primary to `--max-attempts 6 --interval-ms 15000`.** The phase agent
shipped 8 attempts and correctly reported that the honest worst case is 49, not 41 —
because the conditional detail probe retries too. 49 is not "about forty", so NFR-3 was
being broken rather than approximated. 6 attempts is the largest value that stays
inside it.

- **Fixed endpoint set** (`SMOKE_ENDPOINTS`, five paths): 5 × 6 = **30 requests**.
- **Discovery** (`/api/reviews?limit=1&…`): **at most 1** request. It is not
  retried; a miss skips the detail probe.
- **Conditional detail probe** (`/en/reviews/<slug>`, only when a review is
  published): up to **6** more, and only when that one route is the thing failing.
- **Worst case: 30 + 1 + 6 = 37 requests**, inside NFR-3's "about forty".
- **Span per endpoint:** 5 waits of 15 s ≈ **75 seconds**, each request carrying its
  own 5 s `AbortSignal.timeout`. Endpoints are polled **in sequence**, so a total
  outage takes about seven minutes to fail the run rather than 75 seconds — which is
  the right shape for a deploy gate, and the reason the budget is expressed per
  endpoint rather than as one global deadline.

Why 6 and not 8: 8 breaks the NFR. Why 15 s and not 5 s: the default 5 s spacing
bounds a dead rollout at 30 seconds, which is shorter than a Coolify rollout; 6 × 15 s
spends the same request budget over a window two and a half times as wide, which is the
whole trade. Raising `maxAttempts` past 6 now needs an NFR-3 amendment, not a workflow
edit — the comment in the job says so.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-7 | Two pushes to `main` in quick succession produce two deploys that run one after the other, neither cancelled mid-run | `deploy.yml` has a workflow-level `concurrency: {group: deploy-production, cancel-in-progress: false}` next to `env:`, with a comment explaining that `false` is the load-bearing half and that `workflow_dispatch` shares the group. YAML parses. | **Partly proven.** The declaration is correct and in the right place, and the YAML parses. The *behaviour* — GitHub actually queueing rather than cancelling — cannot be observed without pushing to `main`, which is not mine to do. It is proven by the first two deploys after this branch merges. |
| AC-8 | The migrate job's Bun version matches `ci.yml` | Both are `1.4.3`: `deploy.yml` lines 57–65 (with the `bun check` reason) and the three `ci.yml` jobs. No other pin in `deploy.yml` changed. | **Proven** by inspection — this is a static fact about two files. |
| AC-9 | `deploy.yml` contains no claim that migrations are backward-compatible with the deployed image | `grep -i "additive\|backward.compatible\|backwards.compatible"` over `deploy.yml` returns zero matches. The replacement comment states the ordering constraint, the cost, the 2026-10-24 outcome, and the marker test. | **Proven.** The reviewer's read is the authoritative check and it will find nothing to read. |
| FR-4 | The smoke script polls the deployed site after the webhook and exits non-zero when an endpoint never returns 200 | The `verify` job (`needs: deploy`) runs `bun run src/scripts/deploy-smoke.ts "$SMOKE_BASE_URL" --max-attempts 6 --interval-ms 15000` with no `continue-on-error`. Three local runs proved exit 0 on a healthy site, exit 1 naming the failing endpoint on a 500, and exit 1 on a dead origin. | **Proven at the script level; unproven in Actions.** The job's wiring is static and the YAML parses, but no GitHub Actions run has executed it — that happens on the first push to `main`. |

## New tests

Added as a separate `describe("deploy-smoke budget")` block, appended after the
existing five cases, which were not edited.

| Test | Asserts |
| --- | --- |
| `honours a custom attempt budget` | With `maxAttempts: 3` and an endpoint that never recovers, the endpoint records exactly 3 attempts numbered 1–3 and reports `failed` — i.e. the option reaches the loop bound rather than being swallowed. |
| `honours a custom retry interval, and never waits a real one` | With `maxAttempts: 3`, `retryIntervalMs: 15_000` and `[500, 500, 200]`, the endpoint passes and the injected sleep receives exactly `[15_000, 15_000]` — the value travels through the probe context to the seam, and no wall-clock wait happens. |
| `keeps the exported constants as the defaults` | With no budget options at all, an endpoint that never recovers makes `DEFAULT_MAX_ATTEMPTS` attempts and the sleep receives `DEFAULT_MAX_ATTEMPTS - 1` values of `DEFAULT_RETRY_INTERVAL_MS`. This is the guard against someone changing a default while wiring the option through — which is exactly what would break the five tests above. |

`DEFAULT_RETRY_INTERVAL_MS` was newly exported for that third test (it was a
private `RETRY_INTERVAL_MS`); nothing else consumed it, so the rename has no
other blast radius.

## What this check cannot catch

The check proves the site *at the origin* is serving five fixed routes (and one
detail route when a review is published) within roughly 75 seconds of the
webhook returning. It does **not** prove the new image is serving.

- A Coolify rollout can take longer than 75 seconds, so a green run may have
  been talking to the previous container the whole time.
- A new image that is broken but not yet live is invisible to it; the run goes
  green and the breakage arrives minutes later, after the workflow has finished.
- It is a liveness check on a handful of routes, not a correctness check. A page
  that renders the wrong content with a 200 passes.
- It cannot undo anything. A red run reports that the site is unhealthy; the
  deployment stays up, and reverting remains a human decision (Phase 5's
  runbook).

What it *does* reliably catch is the 2026-10-24 shape: a migration lands, the
serving image can no longer read the schema, and requests start returning 500
immediately. That failure is present whether or not the new image has rolled
out, which is precisely why this check would have caught it.

> **Superseded by R1/F1.** The last sentence is wrong. On 2026-10-24 the *build*
> is what failed, so `deploy` and `verify` were skipped and this check never ran.
> The workflow and runbook now say so. Kept here because a phase record should
> not be silently rewritten; see `verification/phase-r1.md`.

## Deviations

| File | Reason |
| --- | --- |
| — | None. Every change is inside the four paths in `Touches`. |

## Notes

- **`23f53b4` is a bundled commit.** It was meant to carry only the concurrency
  block, but `git add -A` swept in the already-written smoke module, script, and
  test changes, so it contains all four files (`4 files changed, 212 insertions,
  18 deletions`). The P4.T4.3 code therefore lives in `23f53b4`, not in
  `1563ad1` — `1563ad1` is only the `verify` job in `deploy.yml`. The work is
  complete and verified; the history is just less tidy than one-logical-change-
  per-commit intended. Squashing on acceptance erases it.
- ~~**Worst-case request count is 49, not 41.**~~ **Fixed by the primary.** The phase
  agent was right that the brief's arithmetic omitted the conditional detail probe,
  and right to report it rather than round it away — but 49 breaks NFR-3 rather than
  approximating it. The primary lowered the job to `--max-attempts 6`, which puts the
  fixed set at 30 and the worst case at 37. The module was not touched.
- **No `permissions:` block was added** to the new `verify` job, and none is
  needed: it makes no API calls, uses no secrets, and only reads the checked-out
  repository. Adding `permissions: contents: read` would be defensible hardening
  but is not required by the phase and would be a change nobody asked for.
- **The `verify` job needs `vars.PRODUCTION_BASE_URL` to exist only if someone
  wants a non-production origin.** With no repository variable configured, the
  expression falls back to `https://chasing-chapters.com` and the job works.
- **Local smoke runs used a fake origin.** Ports 3919–3921 on `127.0.0.1`,
  started and stopped inside the same `bun -e` invocation. Nothing was sent to
  production.
- The known-flaky `translate-batch.test.ts` case
  (`keeps a quota failure that reaches the deadline a quota failure`) passed on
  every run this phase, including the pre-commit hooks. The pre-existing note in
  Phase 2's evidence still stands.
- `bun check` reported 250 files and `biome check .` 240 files, the same counts
  as Phase 2 - the new tests and code sit inside files that already existed.

## Primary verification

Re-ran the verification chain at the phase head and independently exercised the new
command line.

| Check | Command | Exit | Result |
|---|---|---|---|
| Typecheck | `bun run typecheck` | 0 | `✓ No type errors in 250 files` |
| Lint | `bun run lint` | 0 | `Checked 240 files. No fixes applied.` |
| Tests | `bun test` | 0 | `600 pass / 0 fail`, 48 files (597 before; the three budget tests are the delta) |
| Workflow YAML | `bun -e` parse of `deploy.yml` | 0 | `concurrency: {"group":"deploy-production","cancel-in-progress":false}`; jobs `migrate,build-and-push,deploy,verify`; `migrate` on `1.4.3`; `verify.needs = deploy` |
| AC-9 sweep | `Select-String` for `additive` / `backward-compatible` | — | no matches anywhere in `deploy.yml` |
| Happy path | `bun run src/scripts/deploy-smoke.ts http://127.0.0.1:8791 --max-attempts 2 --interval-ms 100` against a throwaway `Bun.serve` fixture | 0 | five `PASS … 200`, `SKIP /en/reviews/<slug> (no published review)`, `6 request(s)`, `Smoke check passed.` |
| Bad flag | `… --max-attempts abc` | 1 | usage line plus `--max-attempts needs a positive whole number` |
| No arguments | `bun run src/scripts/deploy-smoke.ts` | 1 | usage line |

The happy-path run is the one that matters for the new flags: 6 requests is 5 endpoints
plus the single discovery call, which confirms the detail probe was correctly skipped
and that the custom budget did not turn into extra traffic. Nothing was sent to
production.

### The one correction

The phase shipped `--max-attempts 8`. Its own evidence reported the honest worst case
as 49 requests and offered the fix, which was the right call — a reviewer should not
have to derive that. 49 is 22% over NFR-3's "about forty", so this is a specification
breach, not a rounding difference. Lowered to 6: worst case 37, window 75 seconds per
endpoint. The job comment, this file's arithmetic section, and the FR-4 row were all
updated to match, so no stale "8" survives in the workflow or the evidence.

What the lower attempt count costs: 30 seconds of window per endpoint. What it does not
cost: the signal that matters. The 2026-10-24 failure — a destructive migration landing
under a serving image — produces 500s on the first request after the migration, not
after a delay, so it is caught at attempt 1 regardless of the budget.

### Still unproven

Two things, both requiring a push to `main`:

1. **AC-7's queueing behaviour.** `cancel-in-progress: false` is verified as parsed
   configuration, not as observed behaviour. Two rapid merges producing serialised,
   uncancelled deploys is something only the real workflow can show.
2. **The `verify` job executing at all.** Its wiring is static and the script is proven
   against a local origin, but no Actions run has invoked it.

Both close on the first real deploy after this track merges. If `verify` fails there,
the first thing to check is whether `SMOKE_BASE_URL` resolved to the production origin
(the `vars.PRODUCTION_BASE_URL || …` fallback) — not the endpoint list, which the local
run already covers.
