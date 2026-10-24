# Integrated verification — Draft Preview & Scheduled Publishing

- **Track:** `20261024-draft-preview-scheduling`
- **Date:** 2026-10-25
- **Branch:** `feat/20261024-draft-preview-scheduling`
- **Base:** `233d826516af4ff2f76de97ab20742314ccedea3`
- **Head:** `efa311d` (code; the review, doc-sync and archive commits follow)
- **Result:** verified

The full configured strategy, run on the final tree after all three review rounds. Six phases
were verified individually (checkpoints `c76ba18`, `ba97843`, `b519fdd`, `b9aae41`, `a198b1f`,
`efa311d`); this is the end-to-end record.

## Commands

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | no type errors in 246 files |
| static | `bun run lint` | 0 | 236 files, no fixes applied |
| unit | `bun test --coverage` | 0 | **582 pass, 0 fail**, 1330 expects, 46 files |
| coverage | (above) | — | all files **81.30 % funcs / 89.96 % lines** |
| e2e | `bun run test:e2e` | 0 | **112 passed, 0 failed, 0 skipped, 0 unrun** (3.7 m) |
| build | `bun run build` | 0 | 27/27 static pages in 30.7 s |

The browser suite and the build both ran with `DATABASE_URI` at the harness database
(`chasing-chapters_e2e`), `STORAGE_ADAPTER=local` and an empty `NEXT_PUBLIC_R2_PUBLIC_URL`, because
the local dev database predates this track's migration and fails with
`column reviews.publish_at does not exist`. The e2e harness runs the same pipeline itself —
create database → check Redis → apply schema → seed → build → serve the standalone artifact — so
the two builds in the run are independent confirmations of the route table.

Baseline at the base commit: 524 unit tests, 95 browser specs. Final: 582 / 112 — **+58 unit,
+17 browser**.

## New-code coverage

| File | Funcs % | Lines % | Uncovered |
| --- | --- | --- | --- |
| `src/lib/publish-visibility.ts` | 100.00 | 100.00 | — |
| `src/lib/preview.ts` | 100.00 | 100.00 | — |
| `src/collections/Reviews/admin/publish-state.ts` | 100.00 | 98.33 | 133, the unreachable defensive `return null` |
| `src/lib/e2e-harness.ts` | 92.86 | 98.26 | the URI parser's defensive branches |

The all-files figure is 81.30 / 89.96 because `src/lib/__tests__/e2e-harness.test.ts` value-imports
`upsertCover` from `e2e/global-setup.ts`, dragging `e2e/` into the report, and because
`src/collections/Reviews.ts` is mostly field configuration. Every module this track added or
changed the logic of is at or near 100 %.

## Requirements

| ID | Implementation | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | `/(payload)/api/preview/route.ts` — session check, `draft: true` lookup, `enable()`, redirect | `draft-preview.spec.ts` (401 with no `set-cookie`; 307 into the real URL) | covered |
| FR-2 | review route's `loadReview` + `canRenderDraft` | `preview.test.ts`; `draft-preview.spec.ts:164` (never-published draft) | covered |
| FR-3 | `PreviewBanner.tsx`, `/api/preview/exit` (POST + 303) | `draft-preview.spec.ts:85` (banner, other-locale link, exit) | covered |
| FR-4 | `buildPreviewMetadata` | `preview.test.ts`; `draft-preview.spec.ts:85,231` | covered |
| FR-5 | `publish-visibility.ts` at every public surface incl. `access.read` | `publish-visibility.test.ts`; `publish-schedule.spec.ts` (6 cases) | covered |
| FR-6 | `Reviews.publishAt` (UTC, sidebar, writer+admin) + generated migration | `publishAt.test.ts` | covered |
| FR-7 | `publish-state.ts`, list cell, edit notice | `publishState.test.ts`; `review-schedule.spec.ts` (3 cases) | covered |
| FR-8 | `beforeChange` fill, date and schedule both via `originalDoc` | `publishAt.test.ts` (8 cases) | covered |
| FR-9 | pipeline untouched; schedule-only save decides `none` | `translateReview.test.ts`; `draft-preview.spec.ts:231` | covered |
| NFR-1 | `draftMode()` read first, session only inside the branch | route table: 8 pre-rendered review paths | covered |
| NFR-2 | no new secret, no env var; session is the authority | 401 with no `set-cookie` | covered |
| NFR-3 | `private, no-store`, `noindex,nofollow`, no writes on preview | `draft-preview.spec.ts:85,231` | covered |
| NFR-4 | one predicate, two shapes, one derivation | call sites; `publish-visibility.test.ts` | covered |
| NFR-5 | existing surface green | this table | covered |

## Acceptance criteria

| ID | Criterion | Verified by |
| --- | --- | --- |
| AC-1 | Entry requires a session and enables nothing anonymously; signed-in lands on the review with a banner | `draft-preview.spec.ts:53` (401, no cookie, `/en`+`/id` 404) and `:85` |
| AC-2 | A never-published draft renders in draft mode and 404s outside; the same for a future `publishAt` | `draft-preview.spec.ts:164` and `publish-schedule.spec.ts:26` |
| AC-3 | Banner names the preview, the other-locale link stays in preview, exit returns to the same URL | `draft-preview.spec.ts:85` (including the 404 after exit) |
| AC-4 | No indexable or cacheable trace, no canonical/hreflang/OG image, absent from sitemap and feeds | `draft-preview.spec.ts:85,231`; `publish-schedule.spec.ts:61,73,85` |
| AC-5 | Future `publishAt` absent from every surface, present once passed, no deploy | `publish-schedule.spec.ts` (6 cases) with the four visible reviews as controls |
| AC-6 | Writer can set/clear the schedule; a past value publishes immediately | `publishAt.test.ts` field cases; `Reviews.access` unchanged |
| AC-7 | The list distinguishes scheduled from live; the edit view states the moment | `review-schedule.spec.ts:46,90`; `publishState.test.ts` (13 cases) |
| AC-8 | An empty `publishDate` is filled from the schedule; an author value survives | `publishAt.test.ts` (8 cases, incl. the round-2 and round-3 holes) |
| AC-9 | A save still runs the pipeline; a preview writes nothing; a failed translation does not delay publish | `draft-preview.spec.ts:231`; `translateReview.test.ts`; `publishAt.test.ts` |
| AC-10 | Both detail routes still pre-render and the chain passes | build route table, 8 paths, 27/27 static pages |

## Pre-rendering

Unchanged from the base commit. `●` for `/[locale]/reviews/[slug]` over the same eight paths
(four visible fixture reviews × two locales) in both the harness build and the primary's own;
`/[locale]/reading-lists/[slug]` also `●`. `ƒ` only for the browse page (pre-existing
`searchParams`), both `opengraph-image` handlers (pre-existing), `/feed.xml`, `/sitemap.xml`,
admin and API routes, the two preview handlers, and `Proxy`. No page reads `cookies()` or
`headers()` outside the draft branch, which is what keeps them static.

## Deviations and notes

- `RelatedReviews.tsx` and the collection's anonymous `access.read` now use the shared rule — both
  were outside the plan's original Touches and both were found by the review rather than the plan.
- The fixture grew to six reviews (four visible, one scheduled to 2030, one never-published
  draft). `E2E_FIXTURE_REVIEWS` stayed at five, so index-based references and the attention
  bell's absolute count of 2 are untouched.
- The admin specs are chained as separate Playwright projects and run serially — the lesson from
  the previous track, where parallel admin specs raced one fixture account.
- `publishAt` renders in the reviews list as a state word (**Scheduled** / **Live** / **Draft**),
  with the stored ISO instant in the cell's tooltip and the exact moment under the field in the
  edit view. The notice states UTC deliberately: the field stores an instant, and authors
  scattered across zones must read the same promise.
- Preview access follows the collection's own read policy (any signed-in author may open any
  review's preview) rather than being narrowed to the author's own documents, because NFR-2 rules
  out a second permission model. Recorded, not hidden.
- The three reworks during R2 were test-only (a hydration race in the notice case; a 30 s login
  timeout under load) and are described in the phase evidence.

## Follow-ups

- A fixture review with a *past* non-null `publishAt`, so the "Live after the moment" branch is
  proved against a real row rather than the predicate alone.
- Reader-local schedule display, if the product wants it: that needs copy that carries a zone.
- Prove `payload migrate:down` through the CLI once the shell policy allows it; the rollback
  itself is proven by direct invocation on a scratch database in the previous track.
- The comments read surface behind round-2 F2 (comment text of a scheduled review readable
  anonymously by id) — pre-existing, outside this track's scope.
- `[Warmup] Server did not become ready` still appears in green runs; the harness could give
  warm-up its own budget.

## Evidence

- `verification/phase-1.md` — publishing gate
- `verification/phase-2.md` — preview entry and draft rendering
- `verification/phase-3.md` — admin surface, fixture and proof
- `verification/phase-R1.md` — round-1 fixes
- `verification/phase-R2.md` — round-2 fixes
- `verification/phase-R3.md` — round-3 fixes
- `review.md` — three rounds, every finding closed
