## Summary

This track closes nine access-control defects on the public write paths. A
writer could promote their own account to admin through the REST API; anyone
could mint a "trusted" commenter and have their spam auto-approved; anyone
could `POST /api/comments` directly; draft reading lists were readable by
anyone; three anonymous reports could hide a comment; a guest could rewrite
another commenter's stored display name; likes were counted on drafts and
scheduled reviews; a writer could approve spam on their own reviews; and a
moderation decision stayed invisible until the ISR window expired.

Every defect is closed at the layer that owns it — a field-level access rule,
a collection read rule, or a server action — and every one has a test that was
demonstrated failing before the fix and passing after. No schema change, no
migration and no dependency change.

## Track

- **ID:** `20261026-access-control-hardening`
- **Type:** `bug`
- **Spec:** [`conductor/archive/20261026-access-control-hardening/spec.md`](conductor/archive/20261026-access-control-hardening/spec.md)
- **Plan:** [`conductor/archive/20261026-access-control-hardening/plan.md`](conductor/archive/20261026-access-control-hardening/plan.md)
- **Review:** [`conductor/archive/20261026-access-control-hardening/review.md`](conductor/archive/20261026-access-control-hardening/review.md)

## What happened

| Phase | Goal | Result | Checkpoint | Notes |
| --- | --- | --- | --- | --- |
| 1: Author role escalation | A writer's self-update cannot change `role`; an admin's can | verified | `6e014e4` | Field-level rule on `role`; the collection rule stays, so writers keep editing name/avatar/bio. Payload drops a denied field and restores the stored value on update, so the edit lands rather than failing validation. |
| 2: Comments collection access | Anonymous comment creation rejected; only an admin can change a comment's status | verified | `f6e8241` | `create` was `() => true`, which never applied to the action (it writes through the Local API) and only left the REST endpoint open. |
| 3: Commenter identity | No anonymous commenter creation | verified | `9a345df` | Closes step 1 of the trusted-commenter chain. Step 2 was closed in Phase 2; neither alone was sufficient. |
| 4: Reading list visibility | Drafts invisible to unauthenticated reads, visible to an admin | verified | `e81aa9c` | Every public reading-list query already filtered `_status` itself and reads through the Local API, so no rendered page consults the rule. |
| 5: Comment server actions | Reports write only report-owned fields; a guest cannot rewrite a name; fetching is bounded | verified | `5f5af2d` | The report write is built field by field, never spread from the request. |
| 6: Like visibility and moderation revalidation | Likes on invisible reviews rejected; moderation takes effect immediately | verified | `dd6aa0b` | The review is loaded and visibility-checked *before* the counter is touched. |
| R1: Review fixes (round 1) | Close four findings from the first review | verified | `ed87553` | A writer-minted trusted commenter, an IP-only fetch limit that could empty a comment section, an incorrect ISR rationale, and an understated doc block. |
| R2: Review fixes (round 2) | Close three findings from the R1 re-review | verified | `6faa182` | The R1 key change removed the aggregate bound, the retention contract was never rendered, and R1 was recorded verified without e2e. |
| R3: Review fixes (round 3) | Close two findings from the R2 re-review | verified | `352a3cb` | The aggregate ceiling's justification was false as written, and the source-level assertions could not see inside a branch. |
| R4: Round 4 polish | Close four findings from the R3 re-review | verified | `cfad32c` | Documentation precision and assertion strictness only — the id-count derivation, the mirror case, a brittle assertion and a wrong finding id. |

## Requirements

- [x] `FR-1` — `Authors.role` may only be changed by an admin (test: `src/collections/__tests__/Authors.test.ts`)
- [x] `FR-2` — `Commenters.create` denies anonymous callers (test: `src/collections/__tests__/Commenters.test.ts`)
- [x] `FR-3` — `Comments.create` denies anonymous callers (test: `src/collections/__tests__/Comments.test.ts`)
- [x] `FR-4` — public `ReadingLists` reads exclude drafts (test: `src/collections/__tests__/ReadingLists.test.ts`)
- [x] `FR-5` — `reportComment` verifies its subject and writes only report-owned fields (test: `src/app/actions/__tests__/comments.test.ts`)
- [x] `FR-6` — a guest submission never rewrites a commenter's stored name (test: `src/app/actions/__tests__/comments.test.ts`)
- [x] `FR-7` — `toggleLikeReview` rejects non-public reviews (test: `src/app/actions/__tests__/like-review.test.ts`)
- [x] `FR-8` — `getApprovedComments` validates its id and is rate-limited per address and per review (test: `src/app/actions/__tests__/comments.test.ts`)
- [x] `FR-9` — `Comments.status` may only be changed by an admin (test: `src/collections/__tests__/Comments.test.ts`)
- [x] `FR-10` — `setCommentStatus` revalidates the review's paths (test: `src/app/actions/__tests__/moderation.test.ts`)
- [x] `FR-11` — `reportComment` revalidates when a comment becomes `reported` (test: `src/app/actions/__tests__/comments.test.ts`)
- [x] `NFR-1` — guest commenting is unchanged, including its rate limits and spam screening (test: `src/app/actions/__tests__/comments.test.ts`, `e2e/comments.spec.ts`)
- [x] `NFR-2` — admin moderation is unchanged (test: `src/app/actions/__tests__/moderation.test.ts`)
- [x] `NFR-3` — public reads of published content return the same result (test: `src/app/actions/__tests__/comments.test.ts`, `src/components/comments/__tests__/comment-fetch-state.test.ts`)
- [x] `NFR-4` — no migration and no schema change (`git diff` — 0 migration files, `src/payload-types.ts` untouched)
- [x] `NFR-5` — every bypass was demonstrated failing before its fix (six phase evidence files)
- [x] `NFR-6` — no dependency change (`git diff` — `package.json` and `bun.lock` untouched)
- [x] `AC-1` … `AC-15` — all covered; see the requirements table in `review.md`

## Verification

| Layer | Command | Result | Evidence |
| --- | --- | --- | --- |
| typecheck | `bun run typecheck` | pass — 258 files, no errors | `conductor/archive/20261026-access-control-hardening/verification/integrated.md` |
| lint | `bun run lint` | pass — 250 files, no fixes | |
| unit | `bun test` | pass — 765 tests, 0 fail, 54 files | |
| build | `bun run build` | pass | |
| e2e | `bun run test:e2e` | pass — 112 passed, 0 failed, 0 flaky | |

The unit suite grew from 725 to 765 across the track. No existing test was
deleted or weakened; the two assertions that changed are documented in
`integrated.md` section 6.

The build layer needs a database with the migrations applied. The local dev
database is four migrations behind `main`, so it fails on
`column reviews.publish_at does not exist` — a pre-existing local condition,
since the migration is an ancestor of this track's base and `main` fails
identically. Applying migrations to it is destructive by design, so the build
was validated against the e2e database instead. CI runs the build layer
against a fresh database with migrations applied, so the required
`Typecheck, Lint, Test, Build` check is the authoritative gate.

`e2e/comments.spec.ts > should submit comment successfully` submits a real
comment in a real browser against a real database with both anonymous `create`
rules closed. That is the one path this track could have broken and the one it
proves end to end, which the unit tests cannot do.

## Review

- **Verdict:** `PASS WITH FINDINGS`
- **Rounds:** 5
- **Fixed:** 13 findings
- **Accepted/deferred:** 0

No Critical or High finding was raised in any round. The rounds found
progressively smaller things: round 1 two live bypasses, round 2 that one of
round 1's own fixes did not do what its comment claimed, round 3 that the fix
for that was justified by a false premise, round 4 only wording and assertion
strictness. All thirteen are recorded in `review.md` with their resolutions.

## Deviations and risks

- **Two plan tasks were unimplementable as written and were satisfied by a
  different mechanism.** `P5.T1.2` asked for a report that "updates only
  `status` with `overrideAccess: false`" — but reporting must also increment
  `reportCount` and append to `reportedBy`, and `overrideAccess: false` would
  deny every report because `Comments.access.update` returns `false` for a
  caller with no user, which would break reporting entirely. The requirement is
  met by construction instead: the update payload is an explicit object literal
  of `{ reportCount, reportedBy, status? }` with nothing spread from the
  request, so `content` and `relatedReview` are unreachable. `P5.T3.3` asked to
  "lower the hard limit to the page size the UI actually renders" — there is no
  page size; `CommentList` maps over every comment with no pagination. The
  ceiling was kept and documented as the defensive bound it is.
- **`ReadingLists.read` gained a writer branch that the spec did not ask for.**
  Without it a writer's own admin list would resolve to the public constraint
  and be empty, because their lists are drafts. It mirrors `Reviews.read` and
  grants nothing new, but it is a judgement call beyond FR-4.
- **The comment fetch rate limit is a judgement, not a measurement.** The
  per-review ceiling is 120 requests per 60 seconds and the aggregate is 1200 —
  ten times the per-review ceiling, which is what makes a sweep of the
  catalogue bounded while ordinary browsing never meets it. There is no traffic
  data behind those numbers. The bound also fails open when Redis is
  unreachable, as every limit in this codebase does.
- **The rate limiter is mocked in unit tests**, so the increment-before-compare
  behaviour the fix depends on is modelled rather than exercised against Redis.
- **The component's rendered output is asserted at source level**, not by a
  rendering test — this project has no React test harness. The assertions were
  tightened in round 4 to resolve the prop through aliases and to reject only a
  bare `[]`, verified by mutation.
- **A writer can still edit `authorName` and `content`** on comments on their
  own reviews. Withholding `status` was the spec's scope; whether a writer
  should be able to edit a commenter's words is a product question, not an
  access-control defect.
- **The like counter remains client-controlled.** `shouldIncrement` is a
  boolean from the client against a single column, so a client can drive the
  count up or down within the rate limit. Fixing that needs a distinct-liker
  model and therefore a schema change, which NFR-4 puts out of scope. This
  track makes the *target* public-checked; it does not make likes idempotent.

## Follow-ups

- None filed — `review.issues.enabled` is `false` in this project, so every
  finding was fixed rather than deferred. The residuals above are recorded in
  `review.md` and in each phase's evidence file.

## Rollback

```bash
# squash merge (this track merges with squash)
git revert --no-edit <squash-commit>

# merge commit
git revert --no-edit -m 1 <merge-commit>
```

No migration, no feature flag and no data change: every fix is an access rule
or a server-action check, and reverting restores the previous behaviour
exactly.
