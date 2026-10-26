# Access Control Hardening - Implementation Plan

> **Branch:** fix/20261026-access-control-hardening
> **Base:** main @ a6ee383
>
> Phase states are `pending`, `in_progress`, `verified`, `failed`, `blocked`. Only the primary agent writes this file.

## Phase 1: Author role escalation

- **Goal:** A writer's self-update cannot change `role`; an admin's update can.
- **Depends on:** none
- **Covers:** FR-1, AC-1, AC-2
- **Touches:** `src/collections/Authors.ts`, `src/collections/__tests__/Authors.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** verified
- **Result:** verified
- **Checkpoint:** 6e014e4
- **Evidence:** conductor/tracks/20261026-access-control-hardening/verification/phase-1.md

- [x] **P1.T1: Restrict the role field to admins** - covers: FR-1
  - [x] **P1.T1.1: Add field-level `access.update` on `role` that returns true only for an admin**
  - [x] **P1.T1.2: Confirm the admin path is unaffected and the collection-level `update` rule is left alone**

- [x] **P1.T2: Prove both directions** - covers: AC-1, AC-2
  - [x] **P1.T2.1: Test that a writer's self-update setting `role: "admin"` leaves the stored role unchanged**
  - [x] **P1.T2.2: Test that an admin updating another author's role succeeds**
  - [x] **P1.T2.3: Demonstrate both tests failing on the pre-fix commit and record both runs in the evidence file**

## Phase 2: Comments collection access

- **Goal:** Anonymous `POST /api/comments` is rejected and only an admin can change a comment's status, while the server action still creates comments with a derived status.
- **Depends on:** none
- **Covers:** FR-3, FR-9, AC-5, AC-14
- **Touches:** `src/collections/Comments.ts`, `src/collections/__tests__/Comments.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** in_progress

- [ ] **P2.T1: Close anonymous comment creation** - covers: FR-3
  - [ ] **P2.T1.1: Change `create` from `() => true` to deny, leaving `read`, `update` and `delete` untouched**
  - [ ] **P2.T1.2: Confirm the `beforeChange` status derivation still runs for local-API creates, since the action depends on it**

- [ ] **P2.T2: Make comment status admin-only** - covers: FR-9
  - [ ] **P2.T2.1: Add field-level `access.update` on `status` limited to admins**
  - [ ] **P2.T2.2: Confirm writers keep read access to their reviews' comments and can still moderate nothing**

- [ ] **P2.T3: Cover both rules** - covers: AC-5, AC-14
  - [ ] **P2.T3.1: Test that an anonymous create is rejected**
  - [ ] **P2.T3.2: Test that a writer cannot set `status` to `approved` while an admin can**
  - [ ] **P2.T3.3: Demonstrate the tests failing on the pre-fix commit**

## Phase 3: Commenter identity

- **Goal:** No anonymous commenter creation, and the server action's creation path still works.
- **Depends on:** none
- **Covers:** FR-2, AC-3
- **Touches:** `src/collections/Commenters.ts`, `src/collections/__tests__/Commenters.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P3.T1: Close anonymous commenter creation** - covers: FR-2
  - [ ] **P3.T1.1: Change `create` from `() => true` to deny, leaving `read`, `update` and `delete` admin-only as they are**
  - [ ] **P3.T1.2: Confirm the server action's local-API create path is unaffected, since it does not pass `overrideAccess: false`**

- [ ] **P3.T2: Cover the rule** - covers: AC-3
  - [ ] **P3.T2.1: Test that an anonymous create is rejected**
  - [ ] **P3.T2.2: Demonstrate the test failing on the pre-fix commit**

## Phase 4: Reading list visibility

- **Goal:** Draft reading lists are invisible to unauthenticated reads and still visible to an admin.
- **Depends on:** none
- **Covers:** FR-4, AC-6, AC-7
- **Touches:** `src/collections/ReadingLists.ts`, `src/collections/__tests__/ReadingLists.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P4.T1: Exclude drafts from public reads** - covers: FR-4
  - [ ] **P4.T1.1: Add a `where` constraint for unauthenticated reads that excludes drafts, following the `publishedAndVisibleWhere` pattern Reviews already uses**
  - [ ] **P4.T1.2: Confirm an authenticated admin read still returns drafts, and record whether the admin preview uses an authenticated request or `?draft=true`**
  - [ ] **P4.T1.3: Check every public reading-list query site (index, detail, sitemap, home) and record what each relies on**

- [ ] **P4.T2: Cover both directions** - covers: AC-6, AC-7
  - [ ] **P4.T2.1: Test that an unauthenticated read returns no draft rows**
  - [ ] **P4.T2.2: Test that an authenticated admin read returns the draft**
  - [ ] **P4.T2.3: Demonstrate the unauthenticated test failing on the pre-fix commit**

## Phase 5: Comment server actions

- **Goal:** Reporting cannot write arbitrary fields, a guest cannot rewrite another commenter's name, and comment fetching is bounded.
- **Depends on:** Phase 2, Phase 3
- **Covers:** FR-5, FR-6, FR-8, FR-11, AC-4, AC-8, AC-9, AC-10, AC-11, AC-13
- **Touches:** `src/app/actions/comments.ts`, `src/app/actions/__tests__/comments.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P5.T1: Make reporting an access-checked, field-scoped write** - covers: FR-5, FR-11
  - [ ] **P5.T1.1: Resolve the comment, verify it is approved and its review is publicly visible, and reject otherwise**
  - [ ] **P5.T1.2: Update only `status`, with `overrideAccess: false`, so `content`, `relatedReview` and a transition to `approved` are impossible**
  - [ ] **P5.T1.3: Revalidate the affected review paths after a successful report**
  - [ ] **P5.T1.4: Make a repeat report idempotent — no error, no double increment of `reportCount`**

- [ ] **P5.T2: Stop the commenter name takeover** - covers: FR-6
  - [ ] **P5.T2.1: Remove the update that rewrites an existing commenter's `name` from the submitted value**
  - [ ] **P5.T2.2: Confirm `Comments.authorName` carries the submitted name so display is unaffected**

- [ ] **P5.T3: Bound comment fetching** - covers: FR-8
  - [ ] **P5.T3.1: Require a positive integer `reviewId` and reject otherwise**
  - [ ] **P5.T3.2: Rate-limit per IP using the existing `rateLimit` helper**
  - [ ] **P5.T3.3: Lower the hard limit from 100 to the page size the UI actually renders**

- [ ] **P5.T4: Cover the actions** - covers: AC-4, AC-8, AC-9, AC-10, AC-11, AC-13
  - [ ] **P5.T4.1: Test that reporting sets `reported` and revalidates**
  - [ ] **P5.T4.2: Test that a report cannot alter `content`, cannot set `approved`, and cannot change `relatedReview`**
  - [ ] **P5.T4.3: Test that a known email with a different name leaves the commenter row untouched and the comment shows the submitted name**
  - [ ] **P5.T4.4: Test that a missing or non-positive `reviewId` is rejected and the rate limit is enforced**
  - [ ] **P5.T4.5: Test that guest commenting still succeeds end to end now that `create` is closed**
  - [ ] **P5.T4.6: Demonstrate the bypass tests failing on the pre-fix commit**

## Phase 6: Like visibility and moderation revalidation

- **Goal:** Liking a non-public review is rejected, and approving a comment makes it visible without waiting for ISR.
- **Depends on:** none
- **Covers:** FR-7, FR-10, AC-12, AC-15
- **Touches:** `src/app/actions/like-review.ts`, `src/app/actions/moderation.ts`, `src/app/actions/__tests__/like-review.test.ts`, `src/app/actions/__tests__/moderation.test.ts`
- **Verification:** `bun run typecheck && bun run lint && bun test`
- **Status:** pending

- [ ] **P6.T1: Reject likes on invisible reviews** - covers: FR-7, AC-12
  - [ ] **P6.T1.1: Check public visibility before incrementing, reusing the shared visibility predicate**
  - [ ] **P6.T1.2: Test that a draft and a scheduled review are both rejected while a published one succeeds**

- [ ] **P6.T2: Revalidate after moderation** - covers: FR-10, AC-15
  - [ ] **P6.T2.1: Revalidate the affected review paths after a successful status change**
  - [ ] **P6.T2.2: Test that approving revalidates the review's paths**

<!--
Acceptance block appended by the primary agent after a phase is accepted:

**Result:** verified
**Checkpoint:** <short-sha>
**Evidence:** conductor/tracks/<track-id>/verification/phase-1.md
-->

<!--
Review fixes are appended by `conductor-review` as:

## Phase R1: Review Fixes

- **Goal:** Resolve review findings <F1, F2, ...>.
- **Depends on:** <last verified phase>
- **Covers:** <finding IDs>
- **Touches:** <union of files from the findings>
- **Verification:** <the review checks that must pass>
- **Status:** pending

- [ ] **R1.T1: Resolve <finding ID>** - covers: <finding ID>
-->
