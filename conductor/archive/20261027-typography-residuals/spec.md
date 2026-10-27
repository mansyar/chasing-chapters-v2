# Typography residuals — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

This track resolves the five residual risks the Content Typography track
recorded but deferred: a missing React render harness, an unseen
reading-lists index redesign, 60-second neighbour-link staleness, a dead CSS
hook, and a hand-mapped `prose-teal` theme. Each gets a concrete fix with
test evidence; none changes the shipped visual design.

## Problem / Motivation

The typography track shipped with five known gaps. The card consolidation —
the riskiest change — is proven only by shared source, not rendered output;
the reading-lists index's visible redesign was approved but never eyeballed;
neighbour links lag publishes by one ISR window; a dead
`has-data-[slot=card-action]` hook invites confusion; and a future
typography-plugin release can silently untheme elements. Left alone, the
harness gap compounds with every future component change.

## Goals & Success Metrics

- **Goal:** All five residuals resolved with test or human evidence, zero rendered-output change.
- **Metric:** Every AC below passes; full verification (`typecheck && lint && test`) green; R2 screenshots attached to the PR and human-approved.

## Scope

### In Scope

- R1: React render harness covering the typography components (Card chrome, Breadcrumbs, StarRating call sites)
- R2: Reading-lists index screenshots (EN+ID, light+dark) attached to the PR for human sign-off
- R3: Neighbour-page revalidation on review publish/unpublish/update
- R4: Removal of the unreachable `has-data-[slot=card-action]` hook
- R5: Guard test pinning `prose-teal` coverage against the installed typography plugin

### Out of Scope

- Any typography redesign or token change
- A general-purpose harness beyond the typography components
- Reading-list ISR or revalidation changes (their comment stands: revalidated by their own ISR)

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | A React render harness asserts rendered output of the typography components (Card chrome consolidation, Breadcrumbs, StarRating call sites) | must |
| FR-2 | PR media includes reading-lists index screenshots in EN+ID, light+dark, for human approval | must |
| FR-3 | Publishing, unpublishing, or updating a review revalidates the previous/next neighbour review pages in both locales | must |
| FR-4 | The unreachable `has-data-[slot=card-action]` hook is removed from `CardHeader` | must |
| FR-5 | A test fails if the installed typography plugin exposes a `--tw-prose-*` variable that `prose-teal` does not map | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | No rendered-output change from R1/R3/R4/R5 (proven by unchanged tests + R2 media) |
| NFR-2 | No new production dependencies |
| NFR-3 | Full verification green: `bun run typecheck && bun run lint && bun test` |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | Harness renders both cards and asserts identical chrome output | FR-1 |
| AC-2 | Harness covers Breadcrumbs output and StarRating call-site renders (replacing source assertions) | FR-1 |
| AC-3 | PR carries the four R2 screenshots; track does not complete without human sign-off | FR-2 |
| AC-4 | Unit test: publishing a review revalidates neighbour slugs (`/en\|/id/reviews/<neighbour>`) via the existing mock pattern | FR-3 |
| AC-5 | Neighbour lookup with no neighbours revalidates nothing extra and does not throw | FR-3 |
| AC-6 | `has-data-[slot=card-action]` no longer appears in source; Card tests pass unchanged | FR-4 |
| AC-7 | Guard test enumerates `--tw-prose-*` vars from the installed plugin and asserts each is mapped; passes today | FR-5 |
| AC-8 | Full verification green | NFR-3 |

## Edge Cases

- R3: review with no published neighbours; unpublish (neighbours' links disappear); draft save (no revalidation, existing conditions unchanged); out-of-scope `revalidatePath` throw still tolerated, all others rethrown
- R5: plugin major upgrade renaming variables (guard fails loudly — intended); pinned to installed v0.5.20 semantics
- R1: server-only components under test (harness documents the boundary; `renderToStaticMarkup` only)

## Dependencies

- **Tracks:** `20261026-content-typography` (complete, merged) — the residuals' source
- **External:** installed `@tailwindcss/typography` (pinned version; guard reads its shipped `styles.js`)

## Open Questions & Assumptions

- **Assumption:** R2 human sign-off happens via PR media review, not an automated check.
- **Assumption:** Neighbour lookup reuses the review ordering the neighbour helper already defines (publishDate ordering, F1-fixed).
- **Assumption:** Card chrome "identical output" in AC-1 means identical rendered markup of the chrome region, not pixel comparison.

## References

- `conductor/archive/20261026-content-typography/verification/integrated.md` §9 (the five residuals)
- `conductor/archive/20261026-content-typography/review.md` (round findings, incl. F1 neighbour ordering, F5 pre-pair)
- `src/hooks/revalidatePages.ts`, `src/app/globals.css` (`@utility prose-teal`), `src/lib/__tests__/typography-source.test.ts`
