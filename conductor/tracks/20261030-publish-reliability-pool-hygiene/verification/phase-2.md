# Phase 2 — The pool is a configured resource, and slug lookups stop counting

- Track: `20261030-publish-reliability-pool-hygiene`
- Phase: 2
- Date: 2026-10-30
- Branch: `fix/20261030-publish-reliability-pool-hygiene`
- Base commit: `b5f31a2`
- Head commit: `d12bc40`
- Commits: `17bbda7` (T1), `ea64d78` (T2), `d12bc40` (T3)
- Result: **verified**

## Goal

A single-document slug lookup costs one query instead of two, and pool behaviour
is configuration with defaults rather than constants in code. Covers FR-3, FR-6,
NFR-5, AC-3, AC-6.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| Static | `bun run typecheck` (`bun check`) | 0 | No type errors in 299 files |
| Static | `bun run lint` (`biome check .`) | 0 | 296 files checked, no fixes applied |
| Unit | `bun test` | 0 | 938 pass, 0 fail, 3704 `expect()` calls, 71 files |

Run as one command, exactly as the brief specifies:
`bun run typecheck && bun run lint && bun test` — exit 0.

`bun run build` and `bun run test:e2e` are not part of this phase's verification
command; no user-facing flow changed shape (the pages and route behave
identically, they only stop asking for a total), so e2e was not re-run.

## What changed

### T1 — slug lookups stop counting (`17bbda7`)

`pagination: false` added to the three single-document lookups, with access,
`draft` handling, `limit: 1` and the visibility `where` untouched:

- `src/app/(public)/[locale]/reviews/[slug]/page.tsx` — both branches of
  `loadReview` (the draft-preview find and the public
  `publishedAndVisibleWhere` find).
- `src/app/(public)/[locale]/reviews/[slug]/opengraph-image.tsx`.
- `src/app/(payload)/api/preview/route.ts`.

`generateStaticParams` in `page.tsx` (`limit: 50`) keeps its total: a list query
legitimately needs one.

Guards added so the count cannot come back quietly:

- `src/app/(public)/[locale]/reviews/[slug]/__tests__/review-lookup.test.ts`
  exercises the OG image lookup for real and asserts `pagination: false` reached
  `payload.find`; it also brace-matches every `payload.find({ … })` in `page.tsx`
  and asserts the two single-document branches pass the option while the
  `generateStaticParams` list does not.
- `src/app/(payload)/api/preview/__tests__/route.test.ts` does the same for the
  preview route's one lookup.

### T2 — pool sizing is configuration (`ea64d78`)

`src/lib/env.ts` gains `DB_POOL_MAX` (10), `DB_POOL_MIN` (2),
`DB_POOL_CONNECT_TIMEOUT_MS` (10000) and `DB_POOL_SLOW_ACQUIRE_MS` (1000),
parsed by one `poolSetting` helper that follows the file's existing
`preprocess` style. Missing or empty means "unset" and yields the default
silently; a non-numeric, fractional or out-of-range value falls back to the
default and warns **once per setting per process** (the schema is parsed by tests
too, so the warning is keyed in a module-level set). Nothing here can throw.

`src/payload.config.ts` reads the three values into the adapter's pool config;
`keepAlive: true` and `idleTimeoutMillis: 20000` are unchanged.

`.env.example` documents the variables next to `DATABASE_URI`, defaults in the
comments, including that `DB_POOL_MAX` is multiplied by the instance count.

### T3 — a slow acquisition is visible (`d12bc40`)

Payload's Postgres adapter builds its pool inside `postgresAdapter()` and only
exposes it as `payload.db.pool` after init; the config-time seam would mean
injecting an entire `typeof pg` shim. Per P2.T3.2 this was **not** monkey-patched.
Instead the deferred neighbour read from Phase 1 is timed in
`src/hooks/revalidatePages.ts`, and a read past `DB_POOL_SLOW_ACQUIRE_MS` logs
one structured warning:

```
[Database] Pooled read for review "<slug>" waited <n>ms; the pool may be starved.
{ kind: "db_pool_slow_acquire", subject, elapsedMs, thresholdMs }
```

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-3 | A single-document slug lookup issues no `count(*)`; asserted on the `find` options | `pagination: false` on all three lookups (`page.tsx`, `opengraph-image.tsx`, `api/preview/route.ts`); `review-lookup.test.ts` (live OG call + `page.tsx` call-site scan) and `preview/__tests__/route.test.ts` | met |
| AC-6 | Pool size/min/acquire timeout honoured, invalid values fall back to documented defaults with one warning, a slow acquisition logs the wait | `src/lib/__tests__/env.test.ts` (defaults, overrides, invalid → default + exactly one warning, empty → silent); `src/payload.config.ts:71-82`; `revalidatePages.test.ts` ("logs a structured warning when the deferred read waits past the threshold", "stays quiet when the deferred read is quick") | met |
| NFR-5 | Pool config validated at startup; invalid/missing falls back to a documented default and logs once; never crashes | `poolSetting` in `src/lib/env.ts` cannot throw — covered by the fallback cases above | met |

FR-3 is what AC-3 asserts; FR-6 is what AC-6 asserts.

## Evidence paths

- `src/app/(public)/[locale]/reviews/[slug]/__tests__/review-lookup.test.ts`
- `src/app/(payload)/api/preview/__tests__/route.test.ts`
- `src/lib/__tests__/env.test.ts`
- `src/hooks/__tests__/revalidatePages.test.ts`
- `src/payload.config.ts` (pool config)
- `.env.example` (documented defaults)

No large artifacts; nothing written under `.conductor/evidence/`.

## Deviations

| File | Reason |
| --- | --- |
| `src/hooks/revalidatePages.ts` | P2.T3.2: the adapter exposes no supported seam for timing a pool acquisition, so the deferred neighbour read from Phase 1 is timed as the observable proxy. Authorised by the task, but outside `Touches`. |
| `src/hooks/__tests__/revalidatePages.test.ts` | Test for that warning; the hook's existing test file. Outside `Touches`. |
| `src/app/(public)/[locale]/reviews/[slug]/__tests__/review-lookup.test.ts` (new) | P2.T1.2 asks for the page's lookup to be asserted; the brief named that directory but no test file there covered the lookup (only `review-body.test.ts` exists). |
| `src/app/(payload)/api/preview/__tests__/route.test.ts` (new) | P2.T1.2 for the preview route, which had no test at all. |

## Notes

- **Why the page/route lookups are guarded at the source, not by import.** Bun's
  module registry is process-wide: whichever file in a run imports
  `next/headers` first binds it for every other file, and the real module's named
  exports are not visible to Bun's ESM interop. Importing `page.tsx` or the route
  therefore passes when run alone and fails in the full suite depending on file
  order — verified: both files passed in isolation and failed with
  `Export named 'draftMode' not found` in the 71-file run. The OG image has no
  such import, so its lookup is asserted by a real call, which keeps the two
  source scans honest.
- **`DB_POOL_SLOW_ACQUIRE_MS` is also documented** in `.env.example` (inside
  `Touches`) even though P2.T2.3 names three variables: it is the fourth knob of
  the same family and an undocumented threshold would be the one an operator
  needs to tune.
- **The warn-once dedupe is per process**, not per parse, which is what NFR-5
  asks for. The invalid-value test therefore expects four warnings for four
  distinct settings and no second warning for a repeat of the same setting.
- Phase 1 residual is untouched and intended: a Local API write with no request
  scope skips the deferred tail and logs it.
- Visibility rule, poll/isolation level and the Phase 1 deferral are unchanged;
  no new runtime dependency was added.
