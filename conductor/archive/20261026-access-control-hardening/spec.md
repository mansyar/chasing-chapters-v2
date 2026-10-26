# Access Control Hardening - Specification

> Stable requirement IDs (`FR-*`, `NFR-*`, `AC-*`) are never renumbered after approval. A requirement that is dropped is marked `Withdrawn` and its ID is not reused.

## Overview

Seven defects share one root cause: a write or read path trusts the client where it should trust the server. The comment server action never passes `overrideAccess`, so every local-API call runs with Payload's default `true` and bypasses collection access rules. Two collections accept anonymous `create`. One collection exposes drafts beside `read: () => true`. One privileged field has no field-level access. This track closes each path and proves it closed with a test that fails before the fix.

## Problem / Motivation

Verified against `main@a6ee383`:

| # | Defect | Location | Reachable by |
|---|---|---|---|
| 1 | A writer can set `role: "admin"` on their own user document | `src/collections/Authors.ts:70-73`, `:92-101` | Any writer account |
| 2 | Anonymous client creates a commenter with `trusted: true`, then comments as them — the spam hold is skipped entirely | `src/collections/Commenters.ts:13` | Anyone, no credentials |
| 3 | Draft reading lists are publicly readable | `src/collections/ReadingLists.ts:12,15` | Anyone, no credentials |
| 4 | `reportComment` writes to any comment with no access check and no identity | `src/app/actions/comments.ts:241-249` | Anyone, no credentials |
| 5 | A guest submitting a known email rewrites that commenter's stored name | `src/app/actions/comments.ts:94-101` | Anyone who knows an email |
| 6 | `toggleLikeReview` never checks whether the review is publicly visible | `src/app/actions/like-review.ts:42-44` | Anyone, by id |
| 7 | `getApprovedComments` is unauthenticated, unlimited and returns up to 100 rows | `src/app/actions/comments.ts:267-298` | Anyone, no credentials |

Two further defects sit in the same seam and are in scope because the files are already open:

- A writer can approve spam on their own reviews — `status` is an ordinary select with no field-level access (`src/collections/Comments.ts:193-206`), while collection `update` permits a writer on their own reviews.
- Two write paths never revalidate, so an approved comment or a reported comment stays cached for up to 60 seconds (`src/app/actions/moderation.ts:47-51`, `src/app/actions/comments.ts:241-249`). An admin approving a comment and seeing it stay hidden reads as a broken feature.

**Why this is one track and not seven.** Every item is the same failure mode: a path that should consult a rule does not. Fixing them separately would produce seven small changes to five files, each reviewed without the context of the others, and the access model would be decided piecemeal. Fixing them together forces one explicit statement of who may do what.

**Root cause.** `comments.ts` relies on `overrideAccess` defaulting to `true`, which is correct for a trusted server action but means the collection rules are decorative for that path. Meanwhile the collections were written as if the rules were load-bearing — `Comments.create: () => true` and `Commenters.create: () => true` exist so guests can comment through REST, but the action does not need them. The two halves disagree about who validates.

## Goals & Success Metrics

- **Goal:** Every listed bypass is closed and proven closed by a test that fails on the pre-fix commit and passes after.
  - **Metric:** 15 acceptance criteria, each with a test or documented evidence; each new bypass test demonstrated failing before its fix.
- **Goal:** Legitimate paths are not broken by the fix.
  - **Metric:** Guest commenting, admin moderation, admin preview of drafts, and public reads of published content all still work, proven by the positive-path tests in the same phases.
- **Goal:** No privileged write is reachable anonymously or writer-scoped.
  - **Metric:** Zero anonymous or writer-scoped requests in the suite can reach a privileged write; no new dependency, no migration.

## Scope

### In Scope

- Field-level access on `Authors.role` and `Comments.status`.
- Closing anonymous `create` on `Comments` and `Commenters` while preserving the server-action path.
- Excluding drafts from public `ReadingLists` reads while keeping the admin preview working.
- Making `reportComment` an access-checked, field-scoped, revalidating write.
- Removing the commenter name takeover.
- Visibility check in `toggleLikeReview`.
- Bounding `getApprovedComments` (rate limit, required `reviewId`, lower limit).
- Revalidation in `setCommentStatus` and `reportComment`.

### Out of Scope

- Blocklist accuracy. `casino` → *Casino Royale* and `poker` → *Poker Face* are systematic false positives on a book-review site, but that is a tuning problem with its own data, not an access-control defect.
- Missing database indexes on `publishAt`, `_status`, `publishDate`, `translationStatus` and the relationship joins. Performance, different track.
- Rate limiter fail-open behaviour when Redis is unavailable. Accepted as-is; this track must not change it.
- Any schema change or migration. Every fix is an access rule, an action, or a query.
- Reader accounts or authentication for the public. The product's non-goals exclude them.

## Bug Details

### Reproduction steps

1. **Privilege escalation.** Sign in as a writer. `PATCH /api/authors/<own-id>` with `{"role": "admin"}`. Re-read the document: `role` is `admin`.
2. **Trusted commenter.** `POST /api/commenters` with `{"name":"x","emailHash":"<any>","trusted":true}`. Take the returned id, then `POST /api/comments` referencing it. The comment is created `approved` with no spam screening.
3. **Draft leak.** `GET /api/reading-lists?draft=true` with no session returns unpublished reading lists.
4. **Report bypass.** Three unauthenticated `reportComment` calls from different addresses flip an approved comment to `reported`, removing it from public read. No revalidation follows, so it stays cached for up to 60 seconds.
5. **Name takeover.** Submit a comment using an existing commenter's email with a different name. The commenter row's `name` is rewritten.
6. **Like a draft.** `toggleLikeReview` with a draft review's id increments its likes.
7. **Enumerate.** Call `getApprovedComments` repeatedly with no rate limit and `limit: 100` per call.

### Expected behavior

- A writer's self-update leaves `role` unchanged; an admin's update changes it.
- Anonymous `create` is rejected on both collections; the server action still creates comments and commenters.
- Draft reading lists are invisible to unauthenticated reads and visible to an admin.
- Reporting changes only `status`, only for an approved comment on a public review, and revalidates.
- A guest submission never rewrites another commenter's stored name.
- Liking a non-public review is rejected.
- Comment fetching is rate-limited, requires a `reviewId`, and returns at most one UI page.

### Actual behavior

All seven bypasses succeed. Collection access rules are bypassed on every local-API call because `overrideAccess` is never set to `false`. Two collections additionally permit anonymous creation, which the server action does not need. `reportComment` mutates arbitrary fields of an arbitrary comment. The moderation and report paths do not revalidate.

### Root-cause hypothesis

`comments.ts` depends on Payload's `overrideAccess: true` default, which is appropriate for a trusted server action but makes collection rules decorative for that path. The collections were authored as though those rules were the only guard, so they were left permissive enough for a direct REST client. Neither layer is wrong on its own; the two disagree about who validates. The fix assigns validation explicitly: collections deny by default, and the server action — which already validates, rate-limits and checks review visibility — is the only privileged writer.

### Regression test

One test per bypass, exercising the real access rule rather than a mock of it, demonstrated failing on the pre-fix commit and passing after. The evidence file for each phase records both runs. For the two collection-level changes the test asserts on the access rule's return value *and* on the resulting query behaviour, so a rule that returns `false` but is still bypassed by the action path is caught.

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The `Authors.role` field carries field-level `update` access limited to admins, so a writer's self-update cannot change it and an admin's can | must |
| FR-2 | `Commenters.create` denies anonymous requests; the server action's local-API creation path continues to work | must |
| FR-3 | `Comments.create` denies anonymous requests; the server action's local-API creation path continues to work and the status derivation hook still runs | must |
| FR-4 | Public `ReadingLists` reads exclude drafts; an authenticated admin read still returns them | must |
| FR-5 | `reportComment` verifies the comment exists, is approved, and belongs to a publicly visible review, then updates only `status` with `overrideAccess: false`, so it cannot alter `content`, `relatedReview` or set `status` to `approved` | must |
| FR-6 | A guest submission never rewrites an existing commenter's `name`; `Comments.authorName` remains the display source | must |
| FR-7 | `toggleLikeReview` rejects a review that is not publicly visible | must |
| FR-8 | `getApprovedComments` requires a positive integer `reviewId`, is rate-limited per IP, and returns at most the page size the UI uses | must |
| FR-9 | The `Comments.status` field carries field-level `update` access limited to admins, so a writer cannot approve or reject | must |
| FR-10 | `setCommentStatus` revalidates the affected review paths after a successful status change | must |
| FR-11 | `reportComment` revalidates the affected review paths after a successful report | must |

## Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Guest commenting is unchanged from the user's perspective: 3 per 60 seconds per IP, spam screening applied, trusted bypass honoured, banned rejected |
| NFR-2 | Admin moderation is unchanged: the dashboard can still approve, reject, and bulk-act on comments |
| NFR-3 | Public reads of published content return the same shape and result as before |
| NFR-4 | No migration and no schema change — access rules, server actions and queries only |
| NFR-5 | Each new bypass test is demonstrated failing on the pre-fix commit before the fix is applied |
| NFR-6 | No new dependency |

## Acceptance Criteria

| ID | Criterion | Verifies |
|---|---|---|
| AC-1 | A writer's self-update setting `role: "admin"` leaves the stored role unchanged | FR-1 |
| AC-2 | An admin updating another author's `role` succeeds | FR-1 |
| AC-3 | An anonymous `POST /api/commenters` is rejected | FR-2 |
| AC-4 | Guest commenting through the public form still succeeds and produces an approved or pending comment | FR-2, NFR-1 |
| AC-5 | An anonymous `POST /api/comments` is rejected | FR-3 |
| AC-6 | An unauthenticated read of a draft reading list returns no draft rows | FR-4 |
| AC-7 | An authenticated admin read of the same draft returns it | FR-4 |
| AC-8 | Reporting an approved comment sets `status` to `reported` and revalidates the review paths | FR-5, FR-11 |
| AC-9 | A report request cannot change `content`, cannot set `status` to `approved`, and cannot change `relatedReview` | FR-5 |
| AC-10 | A guest submitting a known email with a different name leaves the commenter row's `name` untouched | FR-6 |
| AC-11 | The resulting comment displays the submitted name through `authorName` | FR-6 |
| AC-12 | Liking a draft or scheduled review is rejected | FR-7 |
| AC-13 | `getApprovedComments` rejects a missing or non-positive `reviewId`, and enforces its rate limit | FR-8 |
| AC-14 | A writer cannot set a comment's `status` to `approved` | FR-9 |
| AC-15 | An admin approving a comment makes it visible without waiting for ISR expiry | FR-10 |

## Edge Cases

- An existing commenter row with `trusted` undefined rather than false — the decision must treat it as untrusted.
- A banned commenter whose submitted name differs — rejected before any name consideration.
- Reporting a comment that is already `reported` — idempotent, not an error, no double increment of `reportCount`.
- A review deleted between the report's visibility check and the write — the write fails cleanly rather than throwing.
- A writer editing their own profile (name, bio, avatar) — must still succeed; only `role` is restricted.
- `?draft=true` with a valid admin session — must still return drafts.
- Rate limiter with Redis unavailable — fails open today and must keep failing open; this track must not turn a Redis outage into a blocked guest.
- A like arriving for a review that was published when the page rendered but unpublished before the click.
- A comment on a review that is scheduled but not yet live — reporting it must be rejected for the same reason liking is.

## Dependencies

- **Tracks:** none.
- **External:** none. No new service, dependency or migration.

## Open Questions & Assumptions

- **Question:** Do any writer accounts exist in production today?
  - **Assumption:** None do, but the code path is live and the product explicitly supports the writer role, so the escalation is latent rather than unreachable. Recorded as a reason for `high` priority, not as a reason to defer.
- **Assumption:** The admin draft preview relies on Payload's authenticated request rather than on `?draft=true`, so FR-4 does not break it. Phase 4 must verify this rather than assume it.
- **Assumption:** `rate-limit.ts` failing open when Redis is unavailable is accepted behaviour and out of scope. NFR-1 requires it stays that way.
- **Assumption:** No public query depends on reading lists returning drafts. Phase 4 must prove this; if one does, the phase surfaces it rather than silently widening the read.

## References

- `src/collections/Authors.ts`, `src/collections/Comments.ts`, `src/collections/Commenters.ts`, `src/collections/ReadingLists.ts`
- `src/app/actions/comments.ts`, `src/app/actions/like-review.ts`, `src/app/actions/moderation.ts`
- `src/lib/comment-moderation.ts` — the shared status policy both the hook and the action use
- `src/lib/publish-visibility.ts` — `publishedAndVisibleWhere`, the pattern FR-4 and FR-7 follow
- `src/lib/rate-limit.ts` — `rateLimit`, reused by FR-8
