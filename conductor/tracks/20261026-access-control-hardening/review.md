# Review: Access Control Hardening

- **Track:** `20261026-access-control-hardening`
- **Type:** `bug`
- **Branch:** `fix/20261026-access-control-hardening`
- **Range:** `a6ee383..HEAD`
- **Date:** `2026-10-26T04:10:00Z`
- **Verdict:** `PASS WITH FINDINGS`
- **Gate:** blocked — `review.strict` is `true`, so Phase R1 must land before a PR

> The header records the severity-based verdict: no Critical or High finding
> remains. The gate is separate — `metadata.review_verdict` records `BLOCK`
> because strict mode allows no deferrals and four findings are open.

## Summary

The track does what it claims. All seven defects from the spec plus the two
same-seam defects are closed at the layer that owns them, each with a test
demonstrated failing before its fix and passing after, and no existing test was
weakened — the suite grew from 725 to 741 with 16 new cases.

The reviewer confirmed the five judgement calls the primary flagged for
scrutiny. `canAcceptPublicWrite` delegates to `isPubliclyVisible`, so the write
gate cannot silently diverge from the read gate — that is the property this track
needed. The report idempotency ordering leaks nothing, because reaching the
`alreadyReported` branch requires a prior *successful* report while the review
was public. The `ReadingLists` writer branch prevents a regression the fix would
otherwise have caused, and grants nothing a writer could not already reach
through `update`. The writer/`status` asymmetry is coherent: authorship of a
document versus moderation of a third party's content. Nothing renders a stale
`Commenters.name` to a reader — it appears only as the admin `useAsTitle`.

Four findings remain, none blocking on severity. **F1 is the substantive one**:
the same mechanism as defect 2 is still reachable by an authenticated *writer*,
because `Commenters.create` is `Boolean(user)` rather than admin-only and
`trusted`/`banned` carry no field access. Phase 3 reasoned that no field rule was
needed "since create is closed and update is admin-only" — true for anonymous
callers, but create is closed to *non-authenticated*, not to *non-admin*, so the
premise did not support the conclusion. The diff narrows that hole rather than
widening it, but the track's own goal line says no privileged write should be
reachable anonymously **or writer-scoped**.

**F2** is a design risk the primary introduced: `getApprovedComments` is now
rate-limited 60/60s on IP alone while being called once per review-page mount, so
readers behind one address share a bucket, and `CommentSection` sets state only on
success — a 429 renders "no comments yet" with no error.

**F3** and **F4** are documentation defects. F3 matters more than its severity
suggests: both actions justify revalidation with "the review page is ISR, so the
comment stays cached for 60 seconds", but `reviews/[slug]/page.tsx` renders
nothing comment-related server-side and `CommentSection` is a client component
that fetches on mount. The revalidation satisfies FR-10/FR-11 as written and is
harmless, but the stated mechanism does not exist and will be reused as
justification.

`review.strict` is `true` and `review.issues.enabled` is `false`, so all four are
fixed in Phase R1 rather than deferred.

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| unit | `bun test` | pass — 741 pass, 0 fail, 1818 expect, 53 files | `verification/integrated.md` §3 |
| coverage | `bun test --coverage` | pass — every changed file ≥80% (comments.ts 91.27%, like-review.ts 92.98%, moderation.ts 94.03%, Commenters.ts 100%, ReadingLists.ts 90.74%, Comments.ts 82.67%, Authors.ts 85.57%) | re-run by reviewer |
| lint | `bun run lint` | pass — 248 files | `verification/integrated.md` §3 |
| typecheck | `bun run typecheck` | pass — 256 files | `verification/integrated.md` §3 |
| build | `bun run build` | pass — against the e2e database, see §5 | `verification/integrated.md` §5 |
| e2e | `bun run test:e2e` | pass — 112 passed, 0 failed, 0 flaky (1.9m) | `verification/integrated.md` §6 |

The e2e layer includes `e2e/comments.spec.ts > should submit comment successfully`,
which submits a real comment in a real browser against a real database with both
`create` rules closed. That is AC-4 proven at the layer it matters, stronger than
the unit assertion that the action passes no `overrideAccess`.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 | `Authors.ts:99-107` field-level `access.update` on `role` | `Authors.test.ts` | covered |
| FR-2 | `Commenters.ts:18` `create` denies anonymous | `Commenters.test.ts`, `comments.test.ts` | covered |
| FR-3 | `Comments.ts:42-52` `create` denies anonymous | `Comments.test.ts` | covered |
| FR-4 | `ReadingLists.ts:15-47` admin/writer/public branches | `ReadingLists.test.ts` | covered |
| FR-5 | `comments.ts:252-350` report validates subject, writes owned fields | `comments.test.ts` | covered |
| FR-6 | `comments.ts:127-135` takeover removed | `comments.test.ts` | covered |
| FR-7 | `like-review.ts:42-58` visibility gate before counter | `like-review.test.ts` | covered |
| FR-8 | `comments.ts:355-400` validation + rate limit + bounded read | `comments.test.ts` | partial — F2 |
| FR-9 | `Comments.ts:193-212` field-level `access.update` on `status` | `Comments.test.ts` | covered |
| FR-10 | `moderation.ts:76-110` revalidation | `moderation.test.ts` | covered |
| FR-11 | `comments.ts:337-345` revalidation | `comments.test.ts` | covered |
| NFR-1 | guest limits unchanged; `e2e/comments.spec.ts` | `comments.test.ts`, e2e | covered |
| NFR-2 | admin moderation unchanged | `moderation.test.ts` | covered |
| NFR-3 | public reads unchanged | — | partial — F2 |
| NFR-4 | no migration, no schema change | `git diff` — 0 migration files | covered |
| NFR-5 | every bypass demonstrated failing pre-fix | six phase evidence files | covered |
| NFR-6 | no dependency change | `git diff` — `package.json`, `bun.lock` untouched | covered |
| AC-1 | writer self-update leaves role unchanged | `Authors.test.ts` | covered |
| AC-2 | admin can set another author's role | `Authors.test.ts` | covered |
| AC-3 | anonymous commenter create rejected | `Commenters.test.ts` | covered |
| AC-4 | guest commenting still succeeds | `comments.test.ts`, `e2e/comments.spec.ts` | covered |
| AC-5 | anonymous comment create rejected | `Comments.test.ts` | covered |
| AC-6 | unauthenticated read returns no drafts | `ReadingLists.test.ts` | covered |
| AC-7 | admin read returns the draft | `ReadingLists.test.ts` | covered |
| AC-8 | report sets `reported` and revalidates | `comments.test.ts` | covered |
| AC-9 | report cannot alter content, approve, or move the review | `comments.test.ts` | covered |
| AC-10 | known email leaves commenter row untouched | `comments.test.ts` | covered |
| AC-11 | comment shows the submitted name | `comments.test.ts` | covered |
| AC-12 | liking a draft or scheduled review rejected | `like-review.test.ts` | covered |
| AC-13 | invalid `reviewId` rejected, rate limit enforced | `comments.test.ts` | covered |
| AC-14 | writer cannot set `status` | `Comments.test.ts` | covered |
| AC-15 | approval visible without waiting for ISR | `moderation.test.ts` | covered |

## Findings

### Critical

None.

### High

None.

### Medium

- **F1 - A writer can still mint a trusted commenter and skip the spam hold**
  - **File:** `src/collections/Commenters.ts:13-21` (and `:49`, `:58`)
  - **What:** `create` is `({ req: { user } }) => Boolean(user)`, not admin-only, and the `trusted` and `banned` fields carry no field-level access. Any authenticated writer can `POST /api/commenters` with `{"trusted": true}`, then `POST /api/comments` referencing that commenter — `Comments.create` is also `Boolean(user)` — and `resolveCommentStatus` returns `approved` for spam-flagged content when `trusted` is set (`src/lib/comment-moderation.ts:38`).
  - **Why:** This is defect 2's mechanism, writer-scoped instead of anonymous. The spam hold is the control FR-9 and AC-14 exist to keep admin-only, and it is bypassable by any writer account with no admin involvement. Phase 3 §8 records the decision not to add field access on the premise that "create is closed and update is admin-only" — create is closed to *non-authenticated* callers, not to *non-admin* ones, so the premise does not support the conclusion. The diff narrows the hole (it was anonymous before) but the writer-scoped remainder is unrecorded, and the track goal states no privileged write should be writer-reachable.
  - **Fix:** Add `access: { create: ({ req: { user } }) => user?.role === "admin", update: ({ req: { user } }) => user?.role === "admin" }` to both `trusted` and `banned`. Neither the server action nor `Comments.afterChange` is affected — both write through the Local API where `overrideAccess` defaults to true, so field rules are not consulted. Add cases asserting a writer is denied both fields and an admin is allowed.
  - **Requirement:** FR-2, FR-9
  - **Test gap:** No test that a writer cannot set `trusted` on a commenter row.

- **F2 - The new fetch limit can silently empty a comment section**
  - **File:** `src/app/actions/comments.ts:371-384` (and `src/components/comments/CommentSection.tsx:34-38`)
  - **What:** `getApprovedComments` is rate-limited 60 requests per 60 seconds keyed on IP alone (`comments:${ip}`), and it runs once per review-page mount. The key is therefore shared by every reader behind one address. `CommentSection` sets state only on success, so a 429 leaves `isLoading` false with an empty list and `CommentList` renders the empty state.
  - **Why:** Behind carrier-grade NAT, a corporate proxy or a busy shared egress, 60 page views a minute is ordinary traffic, and the consequence is not a retry hint — the reader is shown "no comments yet", indistinguishable from a review having no comments. That changes the result of a public read, which NFR-3 forbids. The neighbouring limit on the like action includes the subject id (`like:${ip}:${reviewId}`), which is why this one stands out.
  - **Fix:** Key the limit as `comments:${ip}:${reviewId}` following the like action's pattern, with a ceiling generous enough that ordinary browsing on one review cannot reach it; and give `CommentSection` an error branch so a rejected fetch renders a message rather than the empty state.
  - **Requirement:** FR-8, NFR-3
  - **Test gap:** No test that `CommentSection` renders an error state rather than the empty state when the action returns `{ success: false }`.

### Low

- **F3 - The revalidation rationale describes a mechanism the page does not have**
  - **File:** `src/app/actions/comments.ts:337-345` and `src/app/actions/moderation.ts:76-84`
  - **What:** Both justify revalidation with "the review page is ISR, so without this the comment stays on the cached page for up to 60 seconds". The comment list is not in the ISR HTML at all: `reviews/[slug]/page.tsx` contains no comment reference, and `CommentSection` is a `"use client"` component that fetches on mount and after a submit.
  - **Why:** The code satisfies FR-10 and FR-11 as written and AC-15 holds either way, so nothing is functionally wrong. But the stated mechanism does not exist, which matters twice: it will be reused as justification for further revalidation, and it is why `reportComment` now regenerates the page on the first and second report, when no public output changed.
  - **Fix:** Reword both comments to say revalidation is required by FR-10/FR-11 as defence in depth for any server-rendered surface, and note that the comment list is client-fetched. Gate `reportComment`'s revalidation on the status actually becoming `reported`.
  - **Requirement:** FR-10, FR-11
  - **Test gap:** None.

- **F4 - `canAcceptPublicWrite`'s doc block understates its contract**
  - **File:** `src/lib/publish-visibility.ts:109-116`
  - **What:** The doc block says the predicate decides whether "a public write - a reader's comment - may target an already-loaded review". Since this track it gates comments, reports and likes.
  - **Why:** The name is general and the delegation is the right shape; only the prose narrows a contract three call sites now rely on. A future reader adding a fourth public write could conclude from the doc that a like-shaped write is out of scope and hand-roll a `_status` check — the exact divergence this module exists to prevent.
  - **Fix:** Change "a reader's comment" to "a public write (a comment, a report, a like)" and name the three call sites.
  - **Requirement:** FR-5, FR-7
  - **Test gap:** None.

## Overrides

None.

## Plan compliance

Every phase has `Result`, `Checkpoint` and `Evidence`. Every `[x]` task is
implemented and visible in the diff. No task was silently dropped.

The final diff is within the union of `Touches` for all six phases. Two
deviations were reported during implementation and both are accepted:

- **`P5.T1.2` was unimplementable as worded.** "Update only `status`, with
  `overrideAccess: false`" cannot work: reporting must increment `reportCount`
  and append to `reportedBy`, and `overrideAccess: false` would deny every report
  because `Comments.access.update` returns `false` for a caller with no user.
  AC-9 is satisfied by construction instead — an explicit object literal of
  report-owned fields with nothing spread from the request, and `status` typed
  `"reported"`. Verified in the diff.
- **`P5.T3.3` referenced something that does not exist.** "The page size the UI
  actually renders" — `CommentList` maps over every comment with no pagination.
  The 100-row ceiling is kept and documented as a defensive bound, with
  pagination named as the change that would make a smaller number correct.
  Verified in the diff.

One process defect, recorded rather than hidden: the Phase 4 subagent's JSON
report contained a commit hash that does not resolve
(`b5c938f6b6c6...a8a8a8a8a8a8a8a8`). The real hash is
`b5c938f08343450ee04191634d67a8fe85423db0`. The evidence file only ever cited
real hashes, so nothing downstream was contaminated, and `verification/phase-4.md`
records the error.

## Out of scope

- **The blocklist's accuracy.** `.includes()` matching with no word boundaries
  means `casino` flags *Casino Royale* and `poker` flags *Poker Face*. A
  different defect in a different file; the spec puts it out of scope.
- **Missing database indexes** on `publishAt`, `_status`, `publishDate`,
  `translationStatus` and the relationship joins. NFR-4 forbids a schema change.
- **The rate limiter failing open with Redis down.** Accepted in the spec.
- **The like counter being client-controlled.** `shouldIncrement` comes from the
  client against a single column; a distinct-liker model is a schema change.
- **A writer editing `authorName` and `content` on comments on their own
  reviews.** Recorded as residual 5 in `integrated.md`. Whether a writer should
  edit a commenter's words is a product question about what writer moderation
  means, not an access-control defect.
- **No authenticated REST coverage.** The tests assert what the code asked Payload
  to do. Re-proving AC-1/AC-5/AC-6 over real HTTP needs an integration harness the
  workflow does not define.

## Debt

`review.issues.enabled` is `false`, so nothing is filed. All four findings are
fixed in Phase R1 under strict mode rather than deferred.

## Doc sync

`pending`

## History

| Round | Verdict | Critical | High | Medium | Low | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS WITH FINDINGS (gate: BLOCK) | 0 | 0 | 2 | 2 | 0 |
