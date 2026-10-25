# Phase 2 — Deploy Smoke Check

- **Track:** 20261024-deploy-safety — Deploy Safety
- **Phase:** 2 — Deploy Smoke Check
- **Date:** 2026-10-24
- **Branch:** `chore/20261024-deploy-safety`
- **Base commit:** `2928be5` (phase base)
- **Head commit:** `bf523e0`
- **Result:** verified

## What this phase adds

A pure function that answers "is the deployed site serving?" and a thin script
that turns its answer into an exit code. Nothing here knows about GitHub
Actions, Coolify or the deploy workflow — Phase 4 wires it in.

- `src/lib/deploy-smoke.ts` — `runDeploySmoke({ baseUrl, fetch?, sleep? })`
  probes the endpoint set, retries each until it returns 200 or its attempt
  budget runs out, and returns a per-endpoint report plus an overall boolean.
  It imports **nothing** from `node_modules`: only the global `fetch`,
  `setTimeout`, `URL` and `AbortSignal`.
- `src/lib/__tests__/deploy-smoke.test.ts` — five cases driven by an
  in-memory fake site. No timers, no network, no database.
- `src/scripts/deploy-smoke.ts` — argv parsing, one line per endpoint, exit
  code.

### Endpoints probed

| Path | Why it is on the list |
|---|---|
| `/api/genres?limit=1` | Reads `genres.name`, one of the columns the localization migration dropped. This is the request that returned `42703` during the outage. |
| `/en` | The home page. |
| `/id` | The Indonesian home page — proves locale routing and the translation columns are intact. |
| `/en/reviews` | The list route. |
| `/sitemap.xml` | Built from every review's localized path. |
| `/en/reviews/<slug>` | Only when a published slug is discovered; skipped otherwise. |

Final destinations are probed directly, because `/` and `/reviews` 307 to
`/en/...` and `/feed.xml` 308s to `/en/feed.xml`. Probing the unprefixed URL
would measure the redirect layer rather than the app.

### Decisions worth recording

- **Six attempts per endpoint, five seconds apart.** Six endpoints × 6
  attempts is 36 requests plus one discovery call — under the "about forty"
  of `NFR-3` — and bounds a dead rollout at roughly two and a half minutes.
- **A discovery failure skips the detail probe instead of failing the run.**
  The reviews API is not one of the required endpoints; retrying it six times
  would spend the request budget without telling the deploy anything new. A
  skip never fails a run; only a `failed` endpoint does.
- **Sequential, not parallel.** The fixed order reads like a checklist in the
  workflow log, and the request budget stays arithmetic.
- **A transport error is a failed attempt with `status: null`**, not a thrown
  error, so one refused connection cannot lose the other endpoints' results.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` (`bun check`) | 0 | No type errors in 250 files |
| static | `bun run lint` (`biome check .`) | 0 | 240 files checked, no fixes applied |
| unit | `bun test` | 0 | 597 pass, 0 fail, 1374 expect() calls, 48 files |
| unit (targeted) | `bun test src/lib/__tests__/deploy-smoke.test.ts` | 0 | 5 pass, 0 fail, 24 expect() calls |
| manual | `bun run src/scripts/deploy-smoke.ts` (no argument) | 1 | Prints `usage: bun run src/scripts/deploy-smoke.ts <base-url>`, exits 1 |

Full phase verification, run exactly as the brief specifies:

```
bun run typecheck && bun run lint && bun test   →  exit 0
```

Red step: the test file was written first and failed with
`Cannot find module '../deploy-smoke'` before the module existed.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-5 | Against a served build the smoke script exits 0 reporting 200 per endpoint; against a 500 base URL it exits non-zero and names the failing endpoint | Module-level behaviour proven by the "recovers inside the retry budget" and "never recovered" cases; the script's failure path proven by the no-argument run (exit 1). The served-build run is a deploy-time check and belongs to the Phase 4 workflow wiring. | partial |
| AC-6 | Unit tests drive the pure function: eventual success after 500s, retry-budget exhaustion, no-published-review path | `deploy-smoke.test.ts` cases 1, 2, 3 | met |
| FR-4 | Polls the deployed site and exits non-zero if a required endpoint never returns 200 within budget, printing each attempt's status per endpoint | `SMOKE_ENDPOINTS`, `pollEndpoint`, `formatEndpoint`; test 2 asserts the attempt trail and the failed path | met |
| FR-5 | Pure function with injectable `fetch` and `sleep`; the script is a thin IO wrapper | `DeploySmokeOptions`; tests inject both and never wait; `src/scripts/deploy-smoke.ts` contains only argv, formatting and exit | met |
| NFR-3 | Read-only: `GET` only, no credentials, at most about forty requests including retries | `init: { method: "GET" }` asserted in test 1; `requests` asserted `<= 40` in test 2; 6 endpoints × 6 attempts + 1 discovery = 37 | met |

## Evidence paths

- `conductor/tracks/20261024-deploy-safety/verification/phase-2.md` (this file)
- `src/lib/deploy-smoke.ts`
- `src/lib/__tests__/deploy-smoke.test.ts`
- `src/scripts/deploy-smoke.ts`

## Commits

| Commit | Subject |
|---|---|
| `334b139` | `feat(deploy-smoke): add a pure, injectable post-deploy smoke check` |
| `bf523e0` | `chore(deploy-smoke): add the smoke check script wrapper` |

## Deviations

None. Every change is inside `Touches`. No `package.json` entry was added —
Phase 4 invokes the script as `bun run src/scripts/deploy-smoke.ts <base-url>`,
which needs none.

## Notes

- **One flaky pre-existing test appeared mid-phase.** The first commit attempt
  was rejected by the husky pre-commit hook because
  `src/lib/__tests__/translate-batch.test.ts` failed
  (`keeps a quota failure that reaches the deadline a quota failure`). That
  test races a real clock against a translation deadline and passes in
  isolation (19/19) and in the full suite on re-run; it touches none of this
  phase's files. Both commits then passed the same hook, and the full
  verification command exited 0 twice. Worth a follow-up test-hardening issue,
  but not this track.
- **An optional end-to-end demonstration was not run.** I intended to prove
  the script's PASS/FAIL lines and exit codes against a stub HTTP server on
  localhost. The shell call was refused by the environment's permission policy,
  so that demonstration is absent rather than failed; the decision logic it
  would have exercised is covered by the unit tests, and the script's
  loud-failure path is covered by the no-argument run above.
- Phase 4 should pass the production URL from a repository variable with the
  production site as the default, and treat a non-zero exit as a failed run
  without undoing the deployment (the site is already serving by then; the
  value of the check is the alarm).

## Primary verification

Independently re-run by the primary after the subagent reported.

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 250 files |
| static | `bun run lint` | 0 | 240 files checked, no fixes applied |
| unit | `bun test` | 0 | 597 pass, 0 fail across 48 files |

**Constraint confirmed by inspection:** `src/lib/deploy-smoke.ts` contains no
`import`/`require` of a package — only globals (`fetch`, `setTimeout`, `URL`,
`AbortSignal`, `JSON`). Phase 4 can therefore run the script with Bun installed and
no `bun install`.

**Budget arithmetic:** 5 fixed endpoints plus a possible detail route, 6 attempts each,
is 36 requests, plus 1 discovery request, is 37 — inside the "about forty" of `NFR-3`.
Each request carries a 5 s `AbortSignal.timeout` so one hung socket cannot hold the run.

**AC-5 is split, by design.** The module half (exit code from the report) and the loud
half (no base URL → exit 1, usage on stderr) are proven here. The "against a served
build" half needs a running deployment, so it is proven in Phase 4's evidence and again
by the first real deploy after this track merges. Recorded rather than assumed.

**Pre-existing flake, not introduced here:**
`src/lib/__tests__/translate-batch.test.ts` failed one pre-commit hook run and passed
in isolation and on every full run since. It races a real clock against a translation
deadline and touches nothing in `Touches`. Not fixed in this phase; noted for a
separate hardening task.
