# Phase R1 Verification — Review Fixes

Track: `20261024-deploy-safety`
Phase: R1 (Review Fixes)
Base: `79c9112`

The review returned **BLOCK** with eight findings. This phase resolves all
eight. Nothing is deferred: the track's own thesis is that a claim is worth
exactly what can be demonstrated, and every one of these was a place where the
repo asserted something it had not proven.

## Findings and dispositions

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | High | The runbook and the `deploy.yml` comment claimed `verify` "would have caught" 2026-10-24. It could not: `verify` needs `deploy` needs `build-and-push`, and on that date the build is what failed. | Both sites now state the precondition — the check only runs when the image built — and the runbook adds the consequence: when `build-and-push` fails, check the site by hand. |
| F2 | Medium | `upBody` sliced at the first *textual* `down` match. A `down`-before-`up` file scanned the import block; an `up` comment quoting the signature truncated the body. Both passed silently. | Declarations are matched anchored to line start, and the body runs `up`→`down` or `up`→EOF. Two fixtures added. |
| F3 | Medium | The pattern missed `RENAME COLUMN` while two prose sites defined the hazard as "drops or renames". | `RENAME COLUMN` and `RENAME ... TO` are now flagged. `DROP INDEX` stays deliberately unflagged and is now documented as such, so prose and enforcement agree. |
| F4 | Medium | The script's parsing and exit-code branch had no tests, and the 80% new-code gate was unevidenced. | Parsing and the failure list moved into `src/lib/deploy-smoke.ts`; seven new tests; coverage measured (below). |
| F5 | Low | `bun -e *` in the phase allow-list granted arbitrary code execution, resting on an undeclared transitive `yaml`. | Removed from `.opencode/agents/conductor-phase.md`. No dependency added. |
| F6 | Low | `main()` ran at module load. | Guarded with `if (import.meta.main)`. |
| F7 | Low | The comment said "2.5x the module's 30-second default". The default is 25 s (5 waits of 5 s), so it is 3x. | Corrected, with the arithmetic spelled out so it cannot drift again. |
| F8 | Low | `pollEndpoint` read `attempts[attempts.length - 1]` unconditionally, so `maxAttempts: 0` threw despite the "nothing throws" contract. | `Math.max(1, ...)` at the seam, with a test that passes `0`. |

## Mutation tests

A passing test proves nothing until it is shown to fail. Each fix was reverted
in isolation and the suite re-run.

| Mutation | Test that failed | Result |
|---|---|---|
| Remove `RENAME` from the pattern | `flags an unmarked up that renames a column` | 13 pass / 1 fail |
| `upBody` blind to declaration order | `still finds the drop when down is declared before up` | 13 pass / 1 fail |
| Un-anchor the `down` declaration | `is not fooled by a comment quoting the down signature` | 13 pass / 1 fail |
| Drop the `maxAttempts` clamp | `returns a report rather than throwing when the budget is zero` | 14 pass / 1 fail |

Each mutation was caught by exactly the test written for it, and the tree was
restored to green afterwards.

## Checks

| Check | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | 0 errors, 250 files |
| Lint + format | `bun run lint` | clean, 240 files |
| Unit | `bun test` | 611 pass, 0 fail, 1400 `expect()`, 48 files |
| Coverage | `bun test --coverage` | `src/lib/deploy-smoke.ts` 90.00% funcs / 89.90% lines |
| Workflow YAML | parsed, keys asserted | `concurrency` group `deploy-production`, `cancel-in-progress: false`, jobs `migrate,build-and-push,deploy,verify`, smoke flags `6`/`15000` |

`src/lib/deploy-smoke.ts` clears the 80% new-code gate. The uncovered lines are
the real `globalFetch`/`defaultSleep` and the discovery error branches — the
network edge, exercised by the live run below rather than by a mock.

## Live runs

Against a throwaway `Bun.serve` fixture on `127.0.0.1:8793`, after the refactor:

| Invocation | Exit |
|---|---|
| `http://127.0.0.1:8793 --max-attempts 2 --interval-ms 100` | 0 — five `PASS`, `PASS /en/reviews/the-lantern`, 7 requests |
| `--max-attempts abc` | 1 — usage plus `--max-attempts needs a positive whole number` |
| no arguments | 1 — usage |
| `http://127.0.0.1:9999` (dead origin) | 1 |

The happy path discovers the review slug and probes it, so the conditional sixth
endpoint is exercised end to end and not just in the unit tests.

An earlier attempt to read these exit codes through a pipeline reported `0` for
the failure cases; that was the exit status of `Select-Object`, not Bun. The
table above re-measures with a direct invocation.

## Corrections made during the phase

- The spec's problem statement said the outage dropped "eight sibling columns".
  It was nine siblings plus `genres.name` — ten total. Corrected.
- The runbook's "Scope, precisely" section described the scan as reading to the
  first `down` match, which is exactly the bug F2 fixed. It now describes the
  order-tolerant scan.

## What this phase does not prove

- **F1's gap is documented, not closed.** When `build-and-push` fails, a
  destructive migration that already landed still leaves production broken with
  no automated signal. Closing it needs a check that runs before the build, or a
  deploy that never migrates ahead of the image. Both are larger changes than
  this track agreed to, and the runbook now says the gap exists.
- **`DROP TYPE`, `DROP SCHEMA` and `DROP VIEW` are not flagged.** None appears
  in an `up` body today; the spec lists them as recorded-not-enforced.
- **AC-7's queueing behaviour is still unproven.** The concurrency group is
  asserted in the YAML; it has not been observed serialising two real runs.
- **The `verify` job has not executed.** Everything above about it is the
  workflow text and a local run of the same command.
