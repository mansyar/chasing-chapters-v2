## Summary

Makes the translation pipeline survive Google Cloud Translation's per-user rate quota
instead of failing against it. The pipeline had no character accounting anywhere, so three
unbounded consumers fed one 100-second quota window and the retry ladder guaranteed
failure: on 2026-10-25 at 07:51:50 production hit `403 User Rate Limit Exceeded`
(`reason: userRateLimitExceeded`) on a batch of 64, all three attempts failed inside the
same window, and the review was left `translationStatus: "failed"` and untranslated.

The track adds a rolling character budget with a Redis backend, packs requests by character
count, stops retrying a quota response, batches the favourite-quote fan-out, bounds the bulk
retranslate run, derives the lock TTL from the retry policy, and separates failure kinds in
the admin attention bell.

## Track

- **ID:** `20261025-translation-quota-resilience`
- **Type:** `bug`
- **Spec:** [`conductor/archive/20261025-translation-quota-resilience/spec.md`](conductor/archive/20261025-translation-quota-resilience/spec.md)
- **Plan:** [`conductor/archive/20261025-translation-quota-resilience/plan.md`](conductor/archive/20261025-translation-quota-resilience/plan.md)
- **Review:** [`conductor/archive/20261025-translation-quota-resilience/review.md`](conductor/archive/20261025-translation-quota-resilience/review.md)

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Character-aware batching | Requests packed by character count, never above the hard cap | verified | `5e5500c` | `TRANSLATION_BATCH_CHAR_TARGET` 5,000 / `_CAP` 25,000; an oversized single text is sent alone rather than split |
| 2: Rolling character budget | A request that would exceed the window waits for it to roll | verified | `10f6a1b` | New `src/lib/translation-budget.ts`; reservation sits *inside* the retry loop because every attempt re-sends the characters |
| 3: Quota classification and structured logging | A quota response costs one attempt and is identifiable from its log line | verified | `48289c5` | Regression test demonstrated failing before the fix (3 calls) and passing after (1); log no longer dumps the `Gunzip` response stream |
| 4: Call-site fixes | No unbounded character burst from the quotes or a bulk run | verified | `96e6a78` | Quote fan-out replaced by one batched call; bulk run bounded by the shared budget |
| 5: Pipeline robustness | A run cannot be lost, doubled, or write an illegal transition | verified | `a77c486` | Lock TTL derived from the constants: 600s → 2,000s |
| 6: Admin visibility of quota failures | The bell separates quota from network/timeout/unexpected | verified | `7032e23` | Kind re-derived from the persisted message; no new field, no migration |
| R1: Review Fixes | Resolve findings F1–F5 | verified | `609aacf` | Budget-stop attribution, persisted reason, three documentation defects |

## Requirements

All twelve functional requirements, six non-functional requirements and twelve acceptance
criteria are covered; the full table with implementing location and verifying test is in
[`review.md`](conductor/archive/20261025-translation-quota-resilience/review.md).

- [x] `FR-1` - Pack requests by characters, ~5,000 target, cap below 30,000 (test: `src/lib/__tests__/translate-batch.test.ts`)
- [x] `FR-2` - Rolling 100-second character budget checked before every request (test: `src/lib/__tests__/translation-budget.test.ts`)
- [x] `FR-3` - Limit configurable via env var, default 100,000 per 100s (test: `src/lib/__tests__/env.test.ts`)
- [x] `FR-4` - Redis-backed with an in-process fallback mirroring the lock (test: `src/lib/__tests__/translation-budget.test.ts`)
- [x] `FR-5` - A quota 403 is not retried; one attempt (test: `src/lib/__tests__/translate.test.ts`)
- [x] `FR-6` - Favourite quotes translated in one batched call (test: `src/hooks/__tests__/translateReview.test.ts`)
- [x] `FR-7` - Bulk retranslate shares the budget, remainder reported skipped (test: `src/lib/__tests__/retranslate-bulk-run.test.ts`)
- [x] `FR-8` - Structured log fields, never the raw provider error (test: `src/lib/__tests__/translate.test.ts`)
- [x] `FR-9` - The bell distinguishes quota failures (test: `src/components/admin/__tests__/translation-attention.test.ts`)
- [x] `FR-10` - A pipeline failure after the response is captured, not an unhandled rejection (test: `src/hooks/__tests__/translateReview.test.ts`)
- [x] `FR-11` - Lock TTL derived from the retry policy, not a fixed 10 minutes (test: `src/lib/__tests__/translation-lock.test.ts`)
- [x] `FR-12` - `markTranslationStale` writes only a legal transition (test: `src/hooks/__tests__/translateReview.test.ts`)
- [x] `AC-5` - Mocked 403 → exactly one provider call, status `failed`, quota message
- [x] `AC-8` - The log line carries `code`/`reason`/character count and no `Gunzip` or `_readableState`

`NFR-4` is recorded as **partial** in `review.md`: the spec said existing tests pass
"unchanged", but one assertion (`attempts === 3` for a quota error) encoded the defect and
had to change to `1`. The spec contradicts itself there; the correction is the resolution.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| unit | `bun test` | pass - 686 pass, 0 fail, 1627 expect, 50 files | `conductor/archive/20261025-translation-quota-resilience/verification/integrated.md` |
| coverage | `bun test --coverage` | pass - 83.31% funcs / 91.16% lines; every changed production file ≥92% | same |
| lint | `bun run lint` | pass - 244 files, no fixes applied | same |
| typecheck | `bun run typecheck` | pass - 253 files | same |
| build | `bun run build` | pass - requires the e2e database locally, documented in §4 | same |
| e2e | `bun run test:e2e` | pass - 112 passed, 0 failed, 0 flaky (1.6m) | same |

The unit suite grew 612 → 686. No existing test was deleted or weakened; two assertions
were changed deliberately and are itemised in `integrated.md` §6.

The build layer needs a local database with all migrations applied. The dev database on
this machine is four migrations behind `main` and applying them there is destructive by
design, so the build was validated against the e2e database instead (documented rather
than papered over — CI validates the build against a fresh Postgres, which is the gate
that matters).

## Media

No media captured. The only rendered surface this track touches is the admin attention
bell's failure-kind breakdown (22 lines, Phase 6), and capturing it needs a live admin
session against a seeded review carrying a persisted quota error. The local dev database
is four migrations behind `main` and the e2e harness tears its own down after the run, so
there is no environment to capture from without first repairing the dev database — which
is the destructive migration this track deliberately did not run. The bell's rendering is
covered instead by `e2e/admin/attention-bell.spec.ts` (asserting the label, the count and
the row links still pass with the breakdown block present) plus 36 unit cases on the
breakdown logic itself. Stated rather than fabricated.

## Review

- **Verdict:** `PASS WITH FINDINGS`
- **Rounds:** 2
- **Fixed:** 5 findings (2 Medium, 3 Low) in Phase R1
- **Accepted/deferred:** 0 — `review.strict` is `true`, so nothing in scope was deferred
- **Also raised in round 2:** N1 (Low) against round 1's own F5 fix — the right reasoning
  with the wrong constant — corrected before the verdict was recorded

## Deviations and risks

- **`TranslationAttentionBell.tsx` was edited outside its phase's `Touches`** (Phase 6).
  The pure logic could not render itself; the edit is 22 lines — two imports, one derived
  const, one conditional block. Poll, fetch, `where`, badge and item list are untouched.
- **`MAX_ATTEMPTS` was exported** from `translate.ts` (Phase 5) so the lock TTL could be
  derived from the constants rather than restating `3`, which is the drift FR-11 forbids.
  No import cycle: `translation-lock` → `translate` → `translation-budget` → `{env, redis}`.
- **One commit outside the phase loop:** `68a0fd0` during documentation sync fixed a
  Phase 2 defect found by review — `z.coerce.number()` mapped an empty env value to `0`,
  which `.positive()` rejected, so `validateEnv()` threw at boot over a knob with a good
  default. Four lines plus a comment, inside Phase 2's `Touches`, with a new `env.test.ts`.
- **Residual risks** (recorded in `integrated.md` §9, none blocking): the lock TTL bound is
  not absolute because no field carries a `maxLength` — a review whose content is several
  times the packer's target can outlive its 33-minute lock; the attention breakdown
  describes the fetched page, not the backlog, because `translationError` is free text; a
  character-budget stop persists `translationStatus: "failed"` while the bulk run reports it
  `skipped`, which self-heals but reads as a failure in the admin UI.
- **Operational step, not code:** raise the Google Cloud console quota for
  `chasing-chapters` from 100,000 to 10,000,000 characters per 100 seconds and set
  `TRANSLATION_CHAR_BUDGET` to match. Until then pacing stays 100× conservative — correct,
  but slower than it needs to be.

## Follow-ups

- **None filed.** `review.issues.enabled` is `false` for this project, so every finding was
  fixed in Phase R1 rather than deferred. The three residual risks above are the candidates
  for a follow-up track; the two most worth one are the unbounded field length (a product
  decision: cap the field, or accept that a very long review can exceed its lock) and the
  `failed` status a character throttle persists.

## Rollback

```bash
# Squash commit
git revert --no-edit <squash-commit>
```

No migration, no schema change, no new dependency, and no change to stored documents: the
track changes how requests are shaped, paced and logged. Reverting restores the previous
pacing behaviour, which means the incident is reproducible again — the quota increase in
the Google Cloud console is the independent mitigation and should stay in place regardless.
