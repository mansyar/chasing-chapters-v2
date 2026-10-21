# Phase 1 — Pipeline Hardening (Verification)

- Track: 20261021-translation-pipeline-reliability — Translation Pipeline Reliability
- Phase: 1 — Pipeline Hardening
- Date: 2026-10-21
- Branch: feat/20261021-translation-pipeline-reliability
- Base commit: 8e460f0
- Head commit: (see git log; phase commits listed below)
- Result: **verified**

## Result

The translation pipeline is now concurrency-safe (per-review lock with Redis
SET NX PX + in-memory fallback), classifies failures into author-actionable
messages while preserving raw technical detail, schedules exactly one
automatic delayed re-run (3 min) for transient classes, and maintains a real
stale status including a backfill migration. All checks pass.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Types | `bun run typecheck` (`bun check`) | 0 | No type errors in 177 files |
| Lint | `bun run lint` (`biome check .`) | 0 | 0 errors, 0 warnings (error severity) |
| Tests | `bun test` | 0 | 288 pass / 0 fail across 24 files, 596 expect() calls |
| Full | `bun run typecheck && bun run lint && bun test` | 0 | All three green in one run (final verification) |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-5 | Translation failure stores an author-actionable classified message AND preserves the raw technical detail; quota vs network produce distinct messages | `src/lib/translation-errors.ts` (classifyTranslationError, formatTranslationError → `"<actionable guidance> (raw: <detail>)"`); hook stores `formatTranslationError(error)` in `translationError` on failure and format-sync failure; `src/lib/__tests__/translation-errors.test.ts` (429→quota, 403 quota-vs-permission, 401/400 "API key not valid"→credentials, 5xx/network, timeout, cause chains, ambiguous strings, unknowns) | pass |
| AC-6 | Two rapid saves trigger exactly one pipeline run; the second trigger is a silent no-op | `src/lib/translation-lock.ts` (token-returning acquire, compare-and-delete release, 10 min TTL, in-memory fallback); hook wraps runTranslationPipeline in acquire/release; tests: `src/lib/__tests__/translation-lock.test.ts` (concurrent acquires → exactly 1 winner, both Redis + fallback paths, Redis-error fallback) and `src/hooks/__tests__/translateReview.test.ts` ("second concurrent trigger while locked is a silent no-op") | pass |
| AC-7 | Transient failure → status stays un-failed until one delayed re-run is attempted, then `failed` on second failure; permanent classes (credentials, unexpected) → immediate `failed` | `src/hooks/translateReview.ts` (`scheduleTranslationRetry` with `TRANSLATION_RETRY_DELAY_MS = 3 * 60 * 1000`, `isRetry` option guard prevents re-scheduling, re-run respects the same lock, timer `.unref()`); tests: transient→exactly one re-run then `failed`; permanent (credentials)→immediate `failed` with no re-run scheduled | pass |
| AC-8 | English edit with autoTranslate off → `stale`; existing stale-shaped reviews backfilled by migration | `decideTranslationAction` FR-8 branch (translated + translationUpdatedAt present + isStale → `mark-stale`, which passes the transition map translated→stale); `shouldBackfillToStale` predicate in `src/lib/translation-status.ts`; migration `src/migrations/20261021_120000_backfill_stale_translation_status.ts` (UPDATE reviews SET translation_status='stale' WHERE translation_status='translated' AND translation_updated_at IS NOT NULL AND updated_at > translation_updated_at); tests in `translation-status.test.ts` (stale transitions + predicate) | pass |

## Task-level evidence

- P1.T1 — `src/lib/translation-errors.ts`, `src/lib/__tests__/translation-errors.test.ts`; wired into `src/hooks/translateReview.ts` (failure path + format-sync failure path).
- P1.T2 — `src/lib/translation-lock.ts`, `src/lib/__tests__/translation-lock.test.ts`; hook acquires/releases around the whole pipeline body (finally).
- P1.T3 — re-run logic in `src/hooks/translateReview.ts`; tests in `src/hooks/__tests__/translateReview.test.ts`.
- P1.T4 — `isStale` wired into `decideTranslationAction`; `shouldBackfillToStale` + tests in `src/lib/translation-status.ts` / `src/lib/__tests__/translation-status.test.ts`; backfill migration registered in `src/migrations/index.ts`.

## Evidence paths

- `conductor/tracks/20261021-translation-pipeline-reliability/verification/phase-1.md` (this file)

## Deviations

- None. All changes stayed within the Touches list. (`retranslate.ts` was not modified; it calls `runTranslationPipeline(payload, doc)` without options, which is compatible with the new optional options parameter — retries are hook-initiated only this phase, consistent with the plan.)

## Notes

- Lock TTL is 10 minutes (`TRANSLATION_LOCK_TTL_MS`); release uses a Lua compare-and-delete script so an expired lock re-acquired by another owner is not deleted by a stale holder. Redis acquire errors fall back to the in-memory Map path; in-memory release is also always attempted so fallback-acquired locks are freed even when Redis was configured.
- Retry delay constant: 3 minutes (within the 2–5 min range). In-process `setTimeout` with `.unref()` per the plan's Open Question decision; a process restart simply loses the timer and the review keeps its recorded state (bell/bulk recovery covers it in later phases).
- Hook pipeline tests spy `getRedisClient → null` so they are deterministic without a live Redis (the dev environment has REDIS_URL set; without the spy the tests would have depended on a reachable Redis server).
- The second autoTranslate-off stale branch only marks from `translated`, so the write always passes the `canTransition` validation (translated→stale is legal); it also requires `translationUpdatedAt` to be present so brand-new untranslated rows are not marked stale on publish.
- Migration is data-only (no schema delta), so no drizzle snapshot `.json` pair is generated for it; the existing migration style (quoted identifiers, `sql` template, paired up/down) is followed and it is registered last in `src/migrations/index.ts`.
- Lint required formatting fixes after the first run (biome line-width); applied and re-run clean. One intermediate red run (2 test failures + 1 bad assertion) was fixed within the retry budget.

## Phase commits

- (filled by implementer; see git log 8e460f0..HEAD)
