# Implementation Plan: Bilingual Translation Reliability

**Track ID:** translation_reliability_20261008
**Branch:** `track/translation-reliability`
**Workflow:** TDD per `conductor/workflow.md` (Red → Green → Refactor → Commit → Git Note → Plan Update). Each phase closes with a Verification & Checkpoint.

## Phase 1 — Translation Core: Batched, Non-Fallback, Retrying (`src/lib/translate.ts`)

- [x] Task: Write failing unit tests (Red) for the new translate core
	- [x] Batch collection: all text nodes extracted from richText fields + quotes into batched requests (mocked Google client)
	- [x] Batch retry: 3 attempts, exponential backoff (~2s/8s/30s), then throws
	- [x] No-fallback: API failure propagates as an error — original English text is never returned as a "translation"
	- [x] Structure preservation: batched results map back to correct Lexical nodes; existing `extractPlainText`/`syncRichTextFormat` regression tests still pass
- [x] Task: Implement batching + retry + error propagation (Green)
	- [x] `translateBatch(texts)` using Google v2 array requests, per-batch 30s timeout
	- [x] Rewrite `translateRichText` to collect → batch → map back; remove `catch → return original`
	- [x] Replace `console.*` with `logger`
- [x] Task: Refactor & verify coverage >80% on `src/lib/translate.ts` (96.15% fns / 100% branches)
- [x] Task: Commit (`fix(i18n): batch translation requests and remove silent English fallback`) + git note
- [~] Task: Phase Verification & Checkpoint (Refer to workflow.md)
	- [x] Verify: `CI=true bun test` → 129 pass / 0 fail
	- [x] Verify: `bun run typecheck` clean; `bun run lint` no new errors
	- [x] Verify: coverage gate >80% on translate.ts (96.15% fns / 100% branches)
	- [x] Manual verification deferred to Phase 4 checkpoint (user-approved)
	- [x] Attach verification report via git notes → `[checkpoint: 24cc14a]`

## Phase 2 — Status Tracking & Data Model (`src/collections/Reviews.ts`)

- [ ] Task: Write failing tests (Red) for status-transition logic (`src/lib/translation-status.ts`: valid transitions, stale detection, failed-with-attempts)
- [ ] Task: Implement status module (Green)
- [ ] Task: Add collection fields
	- [ ] `autoTranslate` (checkbox, default `true`)
	- [ ] `translationStatus` (select: untranslated/pending/translated/failed/stale, read-only) + `translationError` (textarea, read-only) + `translationUpdatedAt` (date, read-only)
	- [ ] Admin: status column in list view, read-only sidebar card in edit view
- [x] Task: DB migration + backfill (existing reviews → `translated` or `untranslated`)
- [x] Task: Commit + git note (`7cf0434`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) → `[checkpoint: 7cf0434]` (manual UI check deferred to Phase 4, user-approved)

## Phase 3 — Hook Orchestration (`src/hooks/translateReview.ts`)

- [ ] Task: Write failing tests (Red) for hook decisions (mocked payload + translate lib)
	- [ ] Publish with toggle ON + text change → full translation; status `pending` → `translated`
	- [ ] Any failure → ID locale not updated; status `failed` with error + attempts
	- [ ] Toggle OFF + EN text change → no translation, status `stale`
	- [ ] Draft save → no auto-translation; format-only change → format sync preserved
- [x] Task: Implement hook orchestration (Green)
- [x] Task: Commit + git note (`7d55043`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) → `[checkpoint: 7d55043]` (live hook test deferred to Phase 4, user-approved)

## Phase 4 — Admin "Re-translate now" Action

- [x] Task: Implement translation endpoint/route (auth: admin/writer; runs pipeline for any review regardless of draft/published; overrides toggle; updates status) — POST /api/reviews/:id/retranslate
- [x] Task: Add "Re-translate now" button in review edit view with pending/success/failure feedback
- [x] Task: Unit tests for endpoint logic (auth, toggle override, status updates) — 7 tests
- [x] Task: Commit + git note (`e68258e`)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md) → `[checkpoint: e68258e]` (live admin verification at Phase 5, user-approved)

## Phase 5 — Full Verification & Documentation

- [x] Task: Full gate: `bun run typecheck && bun run lint && bun test` + production build + e2e suite — build SUCCESS, 169/0 unit, typecheck/lint clean; e2e 28 pass / 5 fail (confirmed pre-existing at merge-base 5f36639: 1 pass / 7 fail; Redis WRONGPASS in e2e env)
- [x] Task: Update docs — ADMIN_GUIDE (translation behavior, toggle, re-translate), PRD §5 alignment (`ce7ec50`)
- [x] Task: Commit + git note (`ce7ec50`)
- [ ] Task: Final Phase Verification & Checkpoint (Refer to workflow.md)
