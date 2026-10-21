# Lint Debt Cleanup — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

Eliminate all 67 pre-existing Biome lint warnings across 17 source files so the
project's strict review policy (per `conductor/workflow.md`) starts from a
clean baseline. The dominant debt is 65 `noExplicitAny` warnings concentrated
in the translation stack and its tests, plus one hook-dependency bug in
`ModernBookCarousel` and one ARIA misuse in `marquee.tsx`. The track is a
refactor: behavior is preserved except where trivial, behavior-preserving
corrections are required.

## Problem / Motivation

`bun run lint` reports 67 warnings (0 errors). Under the v2 strict review
policy, the reviewer flags every finding and every finding must be fixed or
explicitly accepted. Inherited lint noise would force reviewers to re-litigate
the same 67 findings on every future track, burying real new issues. Cleaning
the baseline now makes every subsequent strict review meaningful.

## Goals & Success Metrics

- **Goal:** `bun run lint` (Biome check) exits with zero warnings and zero
  errors without weakening any configured rule.
- **Metric:** `bunx biome check . --reporter=summary` reports 0 warnings
  across all 163 checked files.

## Scope

### In Scope

- Replace all 65 `noExplicitAny` occurrences with proper types:
  - Production code: `src/lib/translate.ts` (12), `src/hooks/translateReview.ts` (9),
    `src/lib/retranslate.ts` (4), `src/lib/utils.ts` (2),
    `src/components/admin/AnalyticsDashboard.tsx` (3),
    `src/app/(public)/reviews/[slug]/page.tsx` (5),
    `src/app/(public)/reviews/page.tsx` (1), `src/components/ReviewCard.tsx` (1),
    `src/collections/Reviews/admin/RetranslateButton.tsx` (1),
    `src/app/(payload)/layout.tsx` (1), `src/scripts/migrate-emails.ts` (1)
  - Test files: `src/hooks/__tests__/translateReview.test.ts` (13),
    `src/lib/__tests__/retranslate.test.ts` (10),
    `src/lib/__tests__/translate.test.ts` (1),
    `src/hooks/__tests__/formatSlug.test.ts` (1)
- Prefer domain types from the generated `src/payload-types.ts` (Reviews,
  Commenters, etc.) for Payload documents; use `unknown` + narrowing only
  where full typing is impractical (external SDK boundaries).
- Fix `useExhaustiveDependencies` in `src/components/ModernBookCarousel.tsx`
  (missing `scrollTo` dep in `useCallback`).
- Fix `useAriaPropsSupportedByRole` in `src/components/ui/marquee.tsx`
  (invalid `aria-label` on a `<div>`).
- Remove now-useless `eslint-disable` comment lines left over from the
  pre-Biome ESLint configuration.
- (Amended 2026-10-21) Make the comment e2e suite deterministic under
  full-suite parallelism so shared rate-limit state cannot flake it (FR-5).

### Out of Scope

- Weakening or reconfiguring any Biome rule in `biome.json`.
- Refactoring logic beyond what typing requires (no rewrites of translation,
  carousel, or moderation behavior).
- Adding new features, tests for behavior that does not change, or new tooling.
- Fixing non-trivial runtime bugs discovered during typing (deferred; see
  Edge Cases).

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Every `noExplicitAny` warning is eliminated by replacing `any` with a concrete type (Payload generated types for domain data, `unknown` + narrowing for external SDK boundaries) | must |
| FR-2 | `ModernBookCarousel`'s memoized callback declares every captured reactive dependency, including `scrollTo` | must |
| FR-3 | `marquee.tsx` uses only ARIA props supported by its element's role | must |
| FR-4 | Dead `eslint-disable` comment lines are removed wherever the associated warning is resolved | should |
| FR-5 | The comment e2e suite must not race on shared rate-limit state: comment-submission tests run deterministically in full-suite parallel mode so that per-IP rate limiting cannot make a test flake (scope amendment 2026-10-21 — see Open Questions) | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | No runtime behavior change except the `scrollTo` dependency correction in FR-2 |
| NFR-2 | `bun run typecheck` passes with zero errors after all type replacements |
| NFR-3 | All existing unit tests (236) pass unchanged, except tests whose mocks are retyped |
| NFR-4 | No secrets, PII, or new dependencies are introduced |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | `bunx biome check . --reporter=summary` reports 0 warnings | FR-1, FR-2, FR-3, FR-4 |
| AC-2 | `bun run typecheck` exits 0 | FR-1 |
| AC-3 | `bun test` exits 0 with all tests passing | FR-1, NFR-3 |
| AC-4 | `bun run test:e2e` exits 0 (full final run, extra insurance for the FR-2 hook-dep correction) | FR-2 |
| AC-5 | No `grep`-able `: any` remains in files touched by this track (excluding strings/comments) | FR-1 |
| AC-6 | `bun run test:e2e` exits 0 with all tests passing in CI-equivalent mode (`--workers=1` — see Open Questions), repeated to confirm stability | FR-5 |

## Edge Cases

- **Latent bugs surfaced by typing:** if replacing `any` exposes a genuine
  runtime bug, fix it in this track only if trivial and behavior-preserving,
  and document the fix in this spec; defer anything else to a separate track.
- **Generated type drift:** if `src/payload-types.ts` is missing a type needed
  by a fix, regenerate Payload types (`bun run payload`) rather than
  hand-writing a parallel type.
- **Unsafe auto-fix:** the `useExhaustiveDependencies` fix in FR-2 must NOT use
  Biome's unsafe auto-fix (it would add `scrollTo` to the dependency list
  without preserving semantics); the correction is applied manually.
- **Test-only `any`s in mocks:** typed mocks must not silently alter mock
  behavior; if retyping a mock changes what a test observes, that test is
  flagged for review rather than adjusted to fit.

## Dependencies

- **Tracks:** none
- **External:** none (no new services, credentials, or APIs)

## Open Questions & Assumptions

- **Assumption:** the 67-warning baseline measured on 2026-10-21 (65
  `noExplicitAny`, 1 `useExhaustiveDependencies`, 1
  `useAriaPropsSupportedByRole`) is current; any drift is re-measured at track
  start.
- **Assumption:** `src/payload-types.ts` covers the document shapes used by
  the translation stack and reviews pages; gaps are handled by regeneration,
  not hand-written duplicates.
- **Scope amendment (2026-10-21, user-approved):** AC-4 was blocked by a
  pre-existing parallel-execution flake in `e2e/comments.spec.ts` — comment
  submissions share a per-IP rate-limit bucket (`rateLimit(key, 5, 60)`), and
  parallel Playwright workers submitting from `localhost` exhaust it mid-race.
  Reproduced identically on the untouched base commit `d600a92` (1 failed /
  32 passed), and the test passes in isolation and with `--workers=1`. FR-5 /
  AC-6 were added to make the e2e gate deterministically green rather than
  accept a red gate as pre-existing debt. AC-6 is verified in **CI-equivalent
  mode** (`--workers=1`, matching `playwright.config.ts`'s CI posture);
  default 10-worker parallel mode remains latency-flaky on this machine under
  load (dev-server event-loop saturation), base-proven pre-existing, and is
  recorded as environmental debt in `verification/integrated.md`.

## References

- `conductor/workflow.md` — Workflow Config (strict review policy, verify
  command, coverage gate)
- `conductor/code_styleguides/typescript.md` — TypeScript style rules
- `biome.json` — rule configuration (unchanged by this track)
- Biome summary output, 2026-10-21: 67 warnings / 163 files (baseline above)
