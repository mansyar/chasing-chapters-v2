# Specification: Bilingual Translation Reliability

**Track ID:** translation_reliability_20261008
**Type:** Bug/Robustness
**Branch:** `track/translation-reliability`
**Status:** Approved

## Overview

The EN→ID translation pipeline (`src/hooks/translateReview.ts`, `src/lib/translate.ts`) fails silently in the Payload editor: Google Translate API errors or 30s timeouts cause English text to be persisted into the ID locale with no visibility, no retry, and no recovery path. Observed symptoms (all confirmed by the owner): ID shows English after publish, ID never updates, format sync breaks, and failures are invisible. This track makes translation reliable, observable, and safe for hand-edited content.

## Root Causes (from code analysis)

1. `translateText` returns the original English text on any failure (`src/lib/translate.ts` catch block), and that English text is then saved into the ID locale by the background job.
2. `translateRichText` issues one Google Translate API call per Lexical text node — bursts hit rate limits and any single node failure silently corrupts that paragraph.
3. Background translation is fire-and-forget with `console.error`-only logging; the admin UI has no indicator of success/failure and no retry path.
4. Translation only triggers on publish; drafts never translate and there is no on-demand mechanism.

## Functional Requirements

### FR1 — No silent English fallback (correctness core)

- `translateText`/`translateRichText` must never return source-English text as a "successful" translation on API failure; failures propagate as errors.
- A failed translation job must leave the existing ID locale content untouched (no partial or English writes).

### FR2 — Retry with backoff, then flag

- Failed translation batches retry automatically: 3 attempts with exponential backoff (~2s → ~8s → ~30s).
- After final failure: mark the review's translation status as `failed` (with error detail and attempt count); never write English text into the ID locale.

### FR3 — Batched API calls

- Collect all text nodes from the review's richText fields and favorite quotes and translate them in batched requests (Google Cloud Translation v2 supports text arrays) instead of one call per Lexical node.
- One timeout budget (30s) per batch; results map back to the correct nodes preserving Lexical structure.

### FR4 — Translation status in admin

- Read-only tracked state on each Review: `untranslated` / `pending` / `translated` / `failed` / `stale`, plus error detail and last-run timestamp.
- Visible as a column in the Payload reviews list view and in the edit view.
- `stale` = EN text changed but auto-translation did not run (toggle off) or has not completed.

### FR5 — Re-translate action (works on drafts too)

- Admin action ("Re-translate now") on any review — draft or published — that runs the full translation pipeline immediately and updates status.
- An explicit user action overrides the per-review auto-translate toggle.

### FR6 — Per-review auto-translate toggle

- New `autoTranslate` field on Reviews (default **ON** for behavior parity with the current system).
- OFF: publishes never auto-translate; EN text changes mark the status `stale` instead.

### FR7 — Draft behavior

- Draft saves do not auto-translate (API quota protection). Translation happens on publish, or on-demand via FR5.

## Non-Functional Requirements

- TDD per `conductor/workflow.md`: unit tests (mocked Google Translate client and Redis) covering batching, retry/backoff, no-fallback semantics, and status transitions. Coverage >80% on new logic-bearing code.
- Logging via the existing `logger` (`src/lib/logger`), not bare `console.*`.
- Database migration for the new fields with sensible backfill of `translationStatus` for existing reviews.
- No new dependencies.

## Acceptance Criteria

1. Simulated API failure during publish leaves ID content unchanged and marks the review `failed` after 3 retries — English text is never written to the ID locale.
2. Successful publish marks the review `translated`; an EN edit with the toggle off marks it `stale`.
3. A long review produces O(batches) API calls, not O(text nodes).
4. "Re-translate now" works on drafts and published reviews; status updates accordingly.
5. A toggle-off review is never auto-translated; toggling back on restores auto behavior.
6. Translation status column is visible in the admin reviews list.
7. Full pre-commit gate green: `bun run typecheck && bun run lint && bun test`; production build and e2e suite pass.

## Out of Scope

- Site-wide language toggle UI and route-based i18n (candidate future track: "Bilingual Experience Site-Wide").
- Localized titles, authors, and taxonomy terms.
- Alternative translation providers; human-translation workflow tooling.
- Rebuilding the format-sync algorithm beyond preserving its current behavior (covered by regression tests).
