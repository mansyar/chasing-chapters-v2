# Route Error Boundaries — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

This track adds bilingual, on-brand error boundaries to the public site: a root
`global-error` plus one boundary at the `[locale]` segment, each offering a warm
literary message with Try-again (reset) and back-home actions, and reporting
caught errors to Sentry. Today zero `error.tsx` files exist, so any runtime
error in a public segment falls through to Next.js's default error UI.

## Problem / Motivation

Readers who hit a runtime error (failed data fetch, rendering fault) see Next's
generic default error screen — off-brand, outside the typed-dictionary i18n
system, with no recovery path in the reader's language. With comment
engagement, ISR pages, and translation-backed content, transient render
failures are a matter of when, not if. If unsolved, the first error a reader
meets breaks the boutique-bookstore trust the product guidelines promise.

## Goals & Success Metrics

- **Goal:** Every runtime error on a public route lands on a branded, bilingual
  error UI with a working recovery action, and is reported to Sentry with route
  context.
- **Metric:** Forced-error e2e passes in EN and ID (reset + home + Sentry
  capture asserted via unit-tested helper); `bun run typecheck`,
  `bun run lint`, `bun test` green; new e2e spec added.

## Scope

### In Scope

- Root `global-error.tsx` (locale via `NEXT_LOCALE` cookie → accept-language →
  English fallback)
- `[locale]/error.tsx` segment boundary covering all public pages
- Try-again (`reset()`) + back-home links, Playfair/Inter styling per brand,
  typed EN/ID dictionary entries
- Sentry reporting from both boundaries with route context; UI never depends on
  Sentry succeeding
- Unit tests (locale-resolution helper, dictionary completeness) + e2e spec
  forcing a segment error in EN and ID

### Out of Scope

- Admin (Payload) error handling — Payload owns its UI
- `not-found`/loading states — separate concerns
- Per-route boundaries (review slug, reading-list slug) — deferred; locale
  segment covers them
- Changing what throws — no fixes to underlying data-fetching faults

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Root global-error renders branded EN/ID error UI for errors outside the locale segment | must |
| FR-2 | `[locale]/error.tsx` catches public-segment runtime errors and renders the same UI in the segment locale | must |
| FR-3 | Error UI offers Try-again (reset) and back-home actions | must |
| FR-4 | Caught errors are reported to Sentry with route context without blocking the UI | must |
| FR-5 | A test-only forced-error trigger exists for e2e (never reachable in production UI) | should |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Bilingual parity: ID readers get the same complete error experience (guideline requirement) |
| NFR-2 | No stack traces, digests, or internals leak into the rendered UI |
| NFR-3 | Boundary components stay client-minimal; no new runtime dependencies (Sentry 11 already in stack) |
| NFR-4 | Accessibility: error heading announced (role=alert or equivalent), focus states, keyboard-reachable actions |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | Forcing a segment error on `/en/...` shows the branded UI in English with working reset + home | FR-2, FR-3 |
| AC-2 | Same on `/id/...` shows the UI in Indonesian | FR-2, FR-3 |
| AC-3 | Root-level failure resolves locale cookie→header→EN and renders without throwing | FR-1 |
| AC-4 | Sentry capture called with route context on a caught error (unit-asserted) | FR-4 |
| AC-5 | Sentry failure does not break rendering (unit-asserted with mocked throw) | FR-4 |
| AC-6 | No error UI exposes stack/digest text (asserted in e2e) | NFR-2 |
| AC-7 | Full verification green: typecheck, lint, unit, new e2e | — |

## Edge Cases

- Error thrown inside the boundary component itself → bubbles to parent
  boundary (Next behaviour); segment failure falls back to global-error
- `reset()` re-triggering the same error → Next escalates after repeated
  failure; UI copy must not promise recovery it can't guarantee
- Missing cookie + missing accept-language → English fallback
- Sentry unreachable/slow → fire-and-forget; UI renders regardless
- Forced-error trigger route must 404 or be excluded from production
  builds/sitemap

## Dependencies

- **Tracks:** none
- **External:** none (Sentry 11 already integrated per tech-stack)

## Open Questions & Assumptions

- **Assumption:** Per-route tailored boundaries remain deferred; locale-segment
  coverage is sufficient for this track because review/reading-list detail
  errors are segment errors.
- **Assumption:** Dictionary keys follow the existing `src/lib/i18n/` typed
  pattern with key-parity tests extended.

## References

- none
