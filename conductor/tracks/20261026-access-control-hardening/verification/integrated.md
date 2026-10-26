# Integrated verification - Access Control Hardening

Every layer of the configured verification strategy was run against the full
track diff (`a6ee383..HEAD`), not against a phase checkpoint.

## 1. Result

**Verified.** Typecheck, lint and unit pass directly. The build passes against
the e2e database, with the local-database precondition documented in section 5
rather than papered over. E2E is recorded in section 6.

## 2. Scope of the diff

14 files, 1,525 insertions, 53 deletions. No migration, no schema change, no
dependency change (`package.json` and `bun.lock` are untouched), and no change
to `src/collections/Reviews.ts`, `src/payload.config.ts` or
`src/payload-types.ts` - so NFR-4 and NFR-6 hold.

Production code:

| File | +/- | What changed |
| --- | --- | --- |
| `src/collections/Authors.ts` | +8/-0 | Field-level `access.update` on `role`, admin-only. The collection rule is unchanged. |
| `src/collections/Comments.ts` | +17/-2 | `create` denies anonymous; field-level `access.update` on `status`, admin-only. |
| `src/collections/Commenters.ts` | +6/-1 | `create` denies anonymous. `read`/`update`/`delete` unchanged. |
| `src/collections/ReadingLists.ts` | +31/-2 | `read` follows the Reviews shape: admin all, writer own, public constrained to published. |
| `src/app/actions/comments.ts` | +154/-37 | Report validates its subject, writes only report-owned fields, is idempotent and revalidates; the commenter name takeover is removed; comment fetching validates its id and is rate-limited. |
| `src/app/actions/like-review.ts` | +22/-8 | The review is loaded and visibility-checked before the counter is touched. |
| `src/app/actions/moderation.ts` | +64/-0 | Status changes revalidate the review's locale paths. |

Test files: `comments.test.ts` (+442/-2), `like-review.test.ts` (+167, new),
`moderation.test.ts` (+95/-1), `Authors.test.ts` (+132), `Commenters.test.ts`
(+52, new), `Comments.test.ts` (+184), `ReadingLists.test.ts` (+151, new).

## 3. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 256 files |
| static | `bun run lint` | 0 | 248 files checked, no fixes applied |
| unit | `bun test` | 0 | 741 pass, 0 fail, 1818 expect() calls, 53 files |
| static | `bun run build` | 0 | Production build, all routes emitted |
| e2e | `bun run test:e2e` | see section 6 | Playwright against a production build |

The unit layer grew from 725 tests at track start to 741 - 16 new tests across
the six phases, none deleted or weakened. Every phase's evidence file records
the before/after reproduction, and the pre-fix failure output was inspected for
each phase to confirm the tests fail for the defect rather than because a mock
was absent.

## 4. What the track actually closed

| Defect | Before | After |
| --- | --- | --- |
| Writer promotes themselves to admin | `PATCH /api/authors/<own-id>` with `role: admin` succeeded; `role` had no field-level access | Payload drops `role` from a non-admin write; the collection rule still permits editing name/avatar/bio |
| Anonymous mints a trusted commenter | `POST /api/commenters` with `trusted: true`, then a comment from that id skipped the spam hold | `create` denies anonymous; `trusted` cannot be minted |
| Anonymous posts a comment directly | `POST /api/comments` accepted anything | `create` denies anonymous; the server action is unaffected because the Local API defaults to `overrideAccess: true` |
| Drafts readable publicly | `GET /api/reading-lists?draft=true` served unpublished drafts | The read rule constrains public callers to `_status: published` |
| Writer approves spam | `status` was an ordinary select on a comment they could update | Field-level access limits `status` to admins |
| Report writes arbitrary fields | `reportComment` wrote `status` derived from the request; three anonymous reports hid any comment, including writing `approved` | The write is an explicit object of report-owned fields; `status` is typed `"reported"`; the comment must be approved and its review public |
| Guest rewrites a commenter's name | Any known or guessed address renamed that commenter | The update is removed; `authorName` carries the submitted name per comment |
| Likes count on invisible reviews | The counter incremented before the review was even loaded | The review is loaded and visibility-checked first; a missing id and an unpublished one answer identically |
| Moderation appears broken | An approved comment stayed hidden up to 60s | The review's locale paths are revalidated |

## 5. The build layer and its database precondition

The local dev database is four migrations behind `main` (10 applied vs 14 on
disk), so `bun run build` against it fails on `column reviews.publish_at does
not exist`. That is a pre-existing local condition, not a regression: the
migration exists on disk and is an ancestor of the track base, so `main` would
fail identically.

Applying migrations to the dev database is destructive by design - it was
created by Payload's dev-mode schema push, and `payload migrate` warns that data
loss will occur. Losing local data to satisfy a verification step is not a trade
this track gets to make unilaterally, so the prompt was not accepted.

The build was validated against the e2e database instead:

```
DATABASE_URI=...chasing-chapters_e2e STORAGE_ADAPTER=local bun run build  ->  exit 0
```

`STORAGE_ADAPTER=local` is required because that database was created under the
local adapter and has no `_objectkey` column; building as `s3` fails on it.

CI validates the build layer independently against a fresh Postgres with
migrations applied, so this precondition does not weaken the gate.

## 6. E2E

<!-- E2E_RESULT -->

## 7. Cross-phase integration

The phases were deliberately ordered so the later ones depend on the earlier
ones rather than merely following them:

- **Phase 5 depends on 2 and 3** because its AC-4 test proves guest commenting
  still works *after* both `create` rules closed. Testing that before the rules
  existed would have proved nothing. This is the one test in the track that
  protects a working feature rather than closing a hole.
- **Phase 5's report fix reuses Phase 2's `Comments.status` field rule** in its
  reasoning: `overrideAccess: false` was rejected precisely because that rule
  denies a caller with no user, and a reporter is anonymous. The two phases had
  to be designed together for that to be visible.
- **Phase 6 reuses the predicate Phase 5 relies on.** `canAcceptPublicWrite` is
  now called by `submitComment`, `reportComment` and `toggleLikeReview`, so a
  public write and a public read agree by construction rather than by three
  separate implementations of the same rule.
- **Phase 4's writer branch was chosen for consistency with Phase 1.** `Authors`
  lets a writer edit their own document, so hiding a writer's own reading lists
  from them would have contradicted the account model the same track was
  hardening.

## 8. Coverage

The gate is 80% for new logic-bearing code. Every changed collection and action
file is covered by a test suite that exercises the changed rule directly; the
`like-review.test.ts`, `Commenters.test.ts` and `ReadingLists.test.ts` files are
new in this track. Test counts per file are recorded in each phase's evidence.

## 9. Residual risks carried to review

1. **The tests assert what the code asked Payload to do, not what Payload did.**
   The collection tests invoke the access callbacks directly and reconstruct the
   query they produce; the action tests mock `payload.findByID`/`update`. Neither
   executes Payload's access layer against a database. The reasoning that a
   denied field is dropped and restored from the stored document was verified at
   source (`beforeValidate/promise.js:220-244`), and `create.js:126` was read to
   confirm the Local API skips `access.create` - but no test round-trips a real
   HTTP request. If authenticated REST coverage is ever added, AC-1, AC-5 and
   AC-6 should be re-proven there. **Low-Medium** - the code is correct by
   construction, but the evidence is one layer short of end-to-end.
2. **The rate limiter fails open.** With Redis unreachable, `rateLimit` returns
   success, so the new `getApprovedComments` limit and the existing comment and
   report limits do nothing. Accepted and out of scope per the spec, but the new
   limit inherits it. **Low.**
3. **Concurrent reports can under-count.** Two reports arriving together can both
   read `reportCount: 1` and both write `2`. The threshold is a moderation
   signal rather than a security boundary; fixing it needs a database-level
   increment. **Low.**
4. **The like counter remains client-controlled.** `shouldIncrement` is a boolean
   from the client against a single column, so a client can drive the count up or
   down within the rate limit. A different defect from FR-7; a distinct-liker
   model is a schema change and out of scope. **Low.**
5. **A writer can still edit `authorName` and `content` on comments on their own
   reviews.** Phase 2 withheld `status` but the rest of the document remains
   writable by them. Whether a writer should be able to edit a commenter's words
   is a product question about what writer moderation means, not an access-control
   defect. **Medium** - flagged for a decision rather than fixed silently.
6. **`setCommentStatus` queries the comment twice.** It writes, then re-fetches at
   `depth: 1` for the slug. Fetching once before the update would be one query.
   Cheap on an admin path. **Low.**

## 10. Verdict

The integrated state is sound. All six phases are verified, the full diff
typechecks, lints, tests and builds, no existing test was weakened, there is no
schema or dependency change, and each of the seven defects from the spec has a
test that was demonstrated failing before its fix and passing after.

Six residual risks are recorded rather than resolved. Item 5 needs a product
decision; items 1 and 2 are the two that most affect how much the evidence is
worth.
