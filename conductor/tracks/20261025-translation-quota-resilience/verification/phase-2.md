# Phase 2 Verification — Rolling character budget

- **Track:** 20261025-translation-quota-resilience — Translation Quota Resilience
- **Phase:** 2 — Rolling character budget
- **Date:** 2026-10-25
- **Branch:** `fix/20261025-translation-quota-resilience`
- **Base commit:** `fd1ef67b491497d3a1f3036b2a014595460bcf5a`
- **Head commit:** `1213110d52314a56da0982ad9c4456767e2ce116` (code and tests)
- **Result:** verified

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors in 252 files (585.65ms) |
| static | `bun run lint` | 0 | `biome check .` — 243 files checked, no fixes applied |
| unit | `bun test` | 0 | 634 pass, 0 fail, 1481 `expect()` calls, 49 files (2.49s) |
| unit (targeted) | `bun test src/lib/__tests__/translation-budget.test.ts` | 0 | 18 pass, 0 fail, 67 `expect()` calls |
| unit (coverage) | `bun test --coverage src/lib/__tests__/translation-budget.test.ts` | 0 | `src/lib/translation-budget.ts` — 99.38% lines, 93.75% functions (the one uncovered line is the production `setTimeout` sleep helper, which tests replace with an injected clock) |
| phase | `bun run typecheck && bun run lint && bun test` | 0 | All three layers pass |

The phase command was run exactly as written in the brief.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-2 | A request that would push the rolling window past the configured limit does not reach the provider until the window rolls forward | `translation-budget.test.ts` → "defers a request that would overflow the window until it rolls forward": 800 characters are spent in a 1,000-character window, the next 400-character reservation is refused by the window, the reservation waits exactly `TRANSLATION_BUDGET_WINDOW_MS` (one sleep call), and only then is granted with `used === 400` in the fresh window. The Redis path is covered by "waits for the window when Redis refuses the reservation" (two `eval` calls against bucket 0 then bucket 1). The provider is never reached early: "does not reach the provider when the budget cannot be reserved" asserts `mockClientTranslate` was not called | pass |
| AC-3 | Setting the budget env var to 10,000,000 changes the enforced limit without a code change | `src/lib/env.ts` adds `TRANSLATION_CHAR_BUDGET` to `envSchema` (validated, optional, default 100000); `budgetLimit()` reads it at call time. `translation-budget.test.ts` → "changes the enforced limit when the env var changes": with `env.TRANSLATION_CHAR_BUDGET = 10_000_000` a 500,000-character reservation is granted with 9,500,000 remaining; with the default 100,000 the same reservation is refused. The env value is the only input — no code change between the two runs | pass |
| AC-4 | With Redis absent, enforcement still applies via the in-process fallback | `translation-budget.test.ts` → "falls back to the in-process budget when a Redis command fails" (a throwing `eval` degrades to memory, and enforcement continues: a second, larger reservation is refused) and "falls back to the in-process budget when the client is not connected" (a `reconnecting` client issues no command at all). "grants characters under the limit and reports the remainder" and "defers a request that would overflow the window until it rolls forward" run entirely on the in-process window with `getRedisClient()` returning null | pass |
| FR-2 | A rolling 100-second character budget is checked before every provider request | `translate.ts` → `translateChunkWithRetry` calls `reserveChunkBudget` inside the attempt loop, immediately before `client.translate(...)`, so every attempt is accounted for separately | pass |
| FR-3 | The limit is configurable via env var, default 100,000 per 100 seconds | `src/lib/env.ts` → `TRANSLATION_CHAR_BUDGET: z.coerce.number().int().positive().default(100000)`; `TRANSLATION_BUDGET_DEFAULT_CHARACTERS = 100_000` and `TRANSLATION_BUDGET_WINDOW_MS = 100 * 1000` in `src/lib/translation-budget.ts` | pass |
| FR-4 | Redis-backed with in-process Map fallback, mirroring `translation-lock.ts` | `src/lib/translation-budget.ts` → `reserveOnce` uses Redis when the client is connected and falls back to the in-process window on any Redis error; `readyRedisClient()` returns null when `getRedisClient()` returns null. Same shape as `translation-lock.ts`: same "Redis error → memory, never fail" contract, same test-only reset (`clearTranslationBudgetForTest`) | pass |
| NFR-1 | Budget accounting is O(1) — one read and one write per reservation | The Redis path issues a single `eval` of `RESERVE_SCRIPT`, which does the `get` and the `incrby` in one round trip; `remainingCharacters` issues a single `get`. The in-process path does one read and one write with no `await` between them | pass |
| NFR-2 | The budget never deadlocks: the wait is bounded and the request is then skipped | `reserveCharacters` bounds the wait by `maxWaitMs` (one window by default) and by the caller's deadline; when the bound is reached it returns `granted: false` and the caller throws `TranslationBudgetError` instead of waiting further. A request larger than the whole window is refused immediately, never waited on. Test: "bounds the wait instead of blocking indefinitely" (`maxWaitMs: 10` → not granted, no sleep) and "refuses without waiting when the request is larger than the whole window" | pass |
| NFR-3 | A budget or Redis failure never prevents the review save | The budget module never throws for an infrastructure problem: a Redis error degrades to memory, and `reserveChunkBudget` catches anything unexpected, logs it, and lets the request proceed unreserved. Only a *decided* refusal stops the run, and that is a budget stop on the translation path, not a save failure | pass |
| NFR-6 | Cache hits consume no budget | `translateBatch` resolves the cache before packing, so cache hits never reach the reservation. Test: "reserves nothing for cache hits" asserts the remaining budget is unchanged and the provider was not called | pass |

## Task coverage

| Task | Covered by |
| --- | --- |
| P2.T1.1 | `src/lib/translation-budget.ts` → `RESERVE_SCRIPT` (a time-bucketed `incrby` whose key `translate-char-budget:<bucket>` is given a `pexpire` at the window boundary), `translationBudgetKey(bucket)`, `reserveOnce`. `rate-limit.ts` was read and not reused: it increments by 1 and is a fixed-window counter, so it cannot express "N characters" |
| P2.T1.2 | `reserveOnce` and `readWindow` fall back to the in-process window when `getRedisClient()` returns null, when the client is not connected, or when a Redis command throws — the same degrade-don't-fail contract as `translation-lock.ts` |
| P2.T1.3 | `reserveCharacters(characters, options)` and `remainingCharacters(options)`; `CharacterBudgetOptions` injects `now`, `sleep`, `windowMs`, `limit`, and `maxWaitMs`, so every wait in the tests is exercised without a real sleep |
| P2.T1.4 | `reserveCharacters` refuses rather than waiting indefinitely; `maxWaitMs` bounds the wait, and `translate.ts` further bounds it by the run's deadline |
| P2.T2.1 | `src/lib/env.ts` → `TRANSLATION_CHAR_BUDGET` in `envSchema`, coerced to a positive integer with a default of 100000. `budgetLimit()` reads it; no ad-hoc `process.env` read exists |
| P2.T3.1 | `translate.ts` → `reserveChunkBudget` called inside `translateChunkWithRetry`'s attempt loop, after the cache-miss resolution in `translateBatch` and immediately before `client.translate(...)` |
| P2.T3.2 | `reserveChunkBudget` catches any error from the budget machinery, logs it, and proceeds; the budget module itself never throws for an infrastructure problem |
| P2.T4.1 | "defers a request that would overflow the window until it rolls forward" (in-process) and "waits for the window when Redis refuses the reservation" (Redis), both driven by the injected clock and sleep |
| P2.T4.2 | "changes the enforced limit when the env var changes" plus "defaults to 100,000 characters per 100-second window" |
| P2.T4.3 | "falls back to the in-process budget when a Redis command fails" and "falls back to the in-process budget when the client is not connected" |
| P2.T4.4 | "reserves nothing for cache hits" (and its counterpart "reserves a request's characters before it reaches the provider") |

## Evidence paths

- `src/lib/translation-budget.ts` — the new rolling budget module
- `src/lib/__tests__/translation-budget.test.ts` — 18 tests covering the module and the `translateBatch` wiring
- `src/lib/env.ts` — the `TRANSLATION_CHAR_BUDGET` env var
- `src/lib/translate.ts` — `reserveChunkBudget` and its call site in `translateChunkWithRetry`
- Commits: `1213110` (implementation and tests)

## Deviations

None. All four changed files are inside the phase's `Touches`.

## Notes

- **How the budget behaves when Redis is down.** `getRedisClient()` returns null when
  `REDIS_URL` is unset, and the module also declines to use a client that is not in the
  `ready` state — ioredis queues commands while it reconnects, so a check issued against a
  disconnected client would wait on the connection rather than on the window. In both cases
  the in-process window answers. That is per-instance pacing, which is what the
  single-instance deployment needs (spec Open Questions); the enforcement is weaker, not
  absent, and a Redis error logs one line and degrades instead of failing the run.
- **The bounded wait in practice.** A reservation that does not fit waits for the window to
  roll forward — at most one full window, and never past the run's own deadline. After that
  bound the request is skipped with `TranslationBudgetError` ("translation character budget
  reached"), which is a deliberate, non-transient stop: it is never retried and never
  schedules the automatic re-run, and it does not read as a provider failure.
- **Windows are aligned buckets, not a continuously rolling sum.** This is what keeps the
  accounting O(1). A burst that straddles a bucket boundary can therefore spend up to two
  windows' worth of characters, so the budget should be set a little below the provider's
  quota when the margin matters.
- **Every attempt is accounted for, not every request.** A retried attempt re-sends the same
  characters, so the reservation is taken inside the attempt loop. This means a failing chunk
  spends its characters once per attempt — which is what the provider charges for.
- **A cache hit spends nothing.** Cache resolution still runs before packing, so hits never
  reach the reservation and never consume capacity.
- **The retry policy, error classification and request timeout are unchanged.** Phase 3 owns
  those. A budget refusal produces a `TranslationBudgetError` whose message deliberately
  avoids the patterns the classifier matches for provider failures, so it can never be
  mistaken for a quota or timeout response.
- **The stored reason for a budget stop is still the generic one.** `translateReview` writes
  `TRANSLATION_BUDGET_REASON` ("translation time budget reached") for any budget stop, so a
  character-budget stop is recorded with that string. Changing the stored reason is a
  call-site change owned by Phase 4, which owns the translation call sites.
- **No dependency was added.** `ioredis` was already present via `src/lib/redis.ts`.
