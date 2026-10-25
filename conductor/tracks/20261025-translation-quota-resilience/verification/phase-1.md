# Phase 1 Verification — Character-aware batching

- **Track:** 20261025-translation-quota-resilience — Translation Quota Resilience
- **Phase:** 1 — Character-aware batching
- **Date:** 2026-10-25
- **Branch:** `fix/20261025-translation-quota-resilience`
- **Base commit:** `84464cfd400a588356dd01cc35d43a5b86aa34d7`
- **Head commit:** `a268f0ca7799a650e9752437762422c0dedd1128` (code); evidence committed
  separately in `3921914`
- **Result:** blocked — implementation and unit layer pass; the `lint` layer fails on a
  Conductor state file that predates this phase and that a phase subagent may not edit.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` — no type errors in 250 files |
| static | `bun run lint` | 1 | One error, and only one: `conductor/tracks/20261025-translation-quota-resilience/metadata.json` is space-indented where Biome requires tabs. 241 files checked; no file under `src/` reported |
| unit | `bun test` | 0 | 616 pass, 0 fail, 1414 `expect()` calls, 48 files |
| unit (targeted) | `bun test src/lib/__tests__/translate-batch.test.ts` | 0 | 23 pass, 0 fail |
| phase | `bun run typecheck && bun run lint && bun test` | 1 | Stops at `lint`; the two other layers pass individually as recorded above |

The full phase command was run exactly as written in `plan.md`. It exits non-zero at the
`lint` layer only. Both remaining layers were then run individually to show they pass, and
no retry was applied to `lint`: the single reported error is in a file outside this phase's
`Touches` and outside the set of files a phase subagent may write.

## Why the lint layer fails

`git log -- conductor/tracks/20261025-translation-quota-resilience/metadata.json` shows the
file was last written by `02a1f0a` (`chore(conductor): Mark track ... as in progress`) and
created by `b759e9c` (track init) — both ancestors of this phase's base `84464cf`. The
working tree is clean, so the file is byte-identical to its state at the base: the failure
is pre-existing and not a regression from this phase. `biome.json` includes `**` with no
exclusion for `conductor/`, so the file is inside the lint scope, and the brief forbids
editing `metadata.json`.

The fix is a one-command reformat owned by the primary agent:

```bash
bunx biome check --write conductor/tracks/20261025-translation-quota-resilience/metadata.json
```

After that the phase command is expected to exit `0`; nothing under `src/` needs to change.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-1 | A batch whose texts total more than 5,000 code points is split into multiple requests, each under the cap | `translate-batch.test.ts` → "splits a batch that exceeds the character target across requests": 5 × 2,000 = 10,000 code points produces more than one request, and every request's code-point total is asserted `<= TRANSLATION_BATCH_CHAR_TARGET` and `<= TRANSLATION_BATCH_CHAR_CAP` | pass |
| FR-1 | Requests packed by character count, ~5,000 code points, hard cap below 30,000 | `TRANSLATION_BATCH_CHAR_TARGET = 5000`, `TRANSLATION_BATCH_CHAR_CAP = 25000`, `packTranslationRequests` closes a batch at the target; `translateBatch` packs the cache-miss list instead of slicing it by `batchSize` | pass |
| NFR-6 | Cache hits consume no batch capacity | Cache resolution still runs before packing and only misses reach `packTranslationRequests`; existing "uses cached translations without calling the API" and "mixes cached and fresh translations in correct order" tests still pass | pass |

Task-level coverage:

| Task | Covered by |
| --- | --- |
| P1.T1.1 | Both constants exported from `src/lib/translate.ts` |
| P1.T1.2 | `packTranslationRequests` accumulates code points and closes at the target; dedupe and original-order reassembly untouched |
| P1.T1.3 | Oversized text packed alone — test "sends a text longer than the character cap alone and still returns its translation" asserts `[[oversized], ["Hello"]]` |
| P1.T1.4 | `batchSize` kept as the string ceiling — test "keeps batchSize as a string ceiling under the character target" asserts `[2, 2, 1]` for five one-character texts |
| P1.T2.1–P1.T2.3 | The four tests in `describe("translateBatch (character packing)")` |

## Evidence paths

- `src/lib/translate.ts` — constants, `countCodePoints`, `packTranslationRequests`, and the
  packed loop in `translateBatch`
- `src/lib/__tests__/translate-batch.test.ts` — `describe("translateBatch (character packing)")`
- Commits: `8a92d0d` (implementation), `a268f0c` (tests)

## Deviations

None. Both changed files are inside the phase's `Touches`.

## Notes

- Code points, not UTF-16 code units, are the packing unit (`[...text].length`), matching the
  unit Google measures the character quota in. `String.length` would over-count astral
  characters and close batches early; over-counting is safe, under-counting is not, so the
  exact count is used.
- A batch closes on `>=` the target rather than exceeding it, so a request that lands exactly
  on 5,000 code points is sent as-is instead of absorbing one more text.
- The retry policy, error classification, request timeout, and the deadline/budget behaviour
  are untouched — Phase 3 owns the retry change and Phase 2 owns the rolling budget.
- No Redis dependency was added.
- One incidental observation, not acted on: `TRANSLATION_BATCH_SIZE` is now a secondary
  ceiling. Its comment and the `TranslateBatchOptions.batchSize` JSDoc were updated to say so,
  because leaving them describing it as the only bound would be misleading.

## Primary verification

The subagent reported `blocked` on the lint layer. The blocker was a Conductor state file the
primary owns: `conductor/tracks/20261025-translation-quota-resilience/metadata.json` was
space-indented where `biome.json` requires tabs. `biome.json` includes `**` with no exclusion
for `conductor/`, and the archived track metadata files are tab-indented, so this file was
simply malformed. The primary ran the exact command the subagent was denied:

```bash
bunx biome check --write conductor/tracks/20261025-translation-quota-resilience/metadata.json
```

It reported `Checked 1 file. Fixed 1 file.` Nothing under `src/` required any change.

The full phase command was then re-run by the primary, all three layers separately:

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` - no type errors in 250 files (629.54ms) |
| static | `bun run lint` | 0 | `biome check .` - 241 files checked, no fixes applied |
| unit | `bun test` | 0 | 616 pass, 0 fail, 1414 `expect()` calls, 48 files (2.39s) |

**Result: verified.** All three layers of `bun run typecheck && bun run lint && bun test` exit
`0`. The lint obstruction was pre-existing Conductor state, not a Phase 1 regression, and it is
resolved. The `blocked` result recorded above reflects the subagent's view before the primary
applied the fix.

The primary also reviewed the `src/lib/translate.ts` diff directly and confirmed: batches close
at `TRANSLATION_BATCH_CHAR_TARGET`; `batchSize` remains an enforced string ceiling; a text
longer than `TRANSLATION_BATCH_CHAR_CAP` travels alone; code points (not UTF-16 units) are
counted; and cache resolution still precedes packing, so cache hits consume no capacity.
Retry policy, error classification, timeout and deadline behaviour are unchanged.
