# Phase 5 — Comment server actions

| Field | Value |
| --- | --- |
| Track | `20261026-access-control-hardening` — Access Control Hardening |
| Phase | 5 — Comment server actions |
| Date | 2026-10-26 |
| Branch | `fix/20261026-access-control-hardening` |
| Base | `3b34c7152b3522bea9ab183f3472ea6a6ff10a21` |
| Head (code) | `36885b6f7fcb72d3a1773ba2bfd19672c0129cca` |
| Result | **verified** |

Covers FR-5, FR-6, FR-8, FR-11, AC-4, AC-8, AC-9, AC-10, AC-11, AC-13.

## 1. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `✓ No type errors in 256 files` |
| static | `bun run lint` | 0 | `Checked 248 files in 124ms. No fixes applied.` |
| unit | `bun test` | 0 | `741 pass, 0 fail, 1818 expect() calls` across 53 files |
| unit (targeted) | `bun test src/app/actions/__tests__/comments.test.ts` | 0 | `21 pass, 0 fail, 102 expect() calls` |
| **verify_phase** | `bun run typecheck && bun run lint && bun test` | 0 | all three layers green |

Runner: `bun test v1.4.3-canary.1 (43a42a836)`. `bun run typecheck` runs
`bun check` (the Bun-native type checker); `bun run lint` runs `biome check .`.

The full suite was 725 passing before this phase and 741 after: the 16 new
cases in `comments.test.ts` are the whole difference, so nothing else moved.
Several pre-existing suites write to stderr by design (translation retry/quota/
budget simulations, the Redis fail-open paths, the rate-limit block message and
the revalidation hook log). None of it is a failure — the exit code is 0 and the
summary reads `0 fail`.

## 2. What changed

All production changes are in `src/app/actions/comments.ts`.

### FR-5 / FR-11 — `reportComment` was an access-free write to any comment id

Before, the action read the comment with no access context, no error
suppression and no subject validation, then wrote back whatever the read
returned plus a new report entry:

```ts
const comment = await payload.findByID({ collection: "comments", id: commentId });
const newStatus = newReportCount >= 3 ? "reported" : comment.status;
await payload.update({ collection: "comments", id: commentId,
  data: { reportCount, reportedBy, status: newStatus } });
```

After, the comment is resolved with `depth: 0, disableErrors: true` so a missing
row answers `null` rather than throwing a `NotFound`, and it must be `approved`
on a review that passes `canAcceptPublicWrite`:

```ts
if (comment.status !== "approved") return { success: false, error: "Comment not found" };

const review = await payload.findByID({ collection: "reviews", id: reviewId,
  depth: 0, disableErrors: true });

if (!review || !canAcceptPublicWrite(review, new Date())) {
  return { success: false, error: "Comment not found" };
}
```

Both refusals answer identically to a missing comment on purpose: a distinct
reply would tell an anonymous caller that a comment exists on a draft or a
scheduled review. `canAcceptPublicWrite` is the same predicate `submitComment`
and Phase 6's `toggleLikeReview` use, so a write a reader can make still agrees
with what a reader can see.

`revalidatePath` now runs for each locale after a successful report, because a
reported comment leaves the public read (`Comments.access.read` returns only
`approved` rows) and the review page is ISR:

```ts
if (review.slug) {
  for (const path of localizedPaths(`/reviews/${review.slug}`)) revalidatePath(path);
}
```

### FR-6 — the commenter name takeover

Before, a submission whose email hash matched an existing commenter rewrote that
row's `name` to whatever the request carried:

```ts
if (commenter.name !== name.trim()) {
  await payload.update({ collection: "commenters", id: commenter.id,
    data: { name: name.trim() } });
}
```

Anyone who knew or guessed a commenter's address could rename them across every
comment they had ever posted. The update is gone. Nothing is lost: the display
name is `Comments.authorName`, written per comment from the submitted value
(`comments.ts:130` in the base), and that is the field `CommentList` renders.
The commenter row is keyed by `emailHash` and exists to carry `trusted` and
`banned`, neither of which a guest can set.

### FR-8 / AC-13 — `getApprovedComments` was unbounded

Before: no validation, no rate limit, `limit: 100`. It is a server action, so it
is a public HTTP endpoint; `reviewId: NaN`, `0` and `-1` all ran a query.

After: a positive-integer check runs first, before the limiter and before the
database, then a per-IP limit keyed `comments:${ip}` at 60 requests per 60
seconds:

```ts
if (!Number.isInteger(reviewId) || reviewId <= 0) {
  return { success: false, error: "Invalid review ID" };
}
const rateLimitResult = await rateLimit(`comments:${ip}`, COMMENT_FETCH_LIMIT,
  COMMENT_FETCH_WINDOW_SECONDS);
```

The row ceiling is now a named constant, `MAX_COMMENTS_PER_REVIEW`, documented
with what it actually is — see deviation 2 below.

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-4 | Guest commenting still succeeds after `Comments.create` and `Commenters.create` closed, producing an approved or pending comment | `submitComment guest identity > completes a guest submission end to end while create is closed on both collections` — asserts both creates happen, `authorName`/`relatedReview`/`commenter`/`status` land, and that neither call carries `overrideAccess`, `user` or `req`. The five pre-existing `submitComment` cases (auto-approve, spam hold, trust bypass, banned, rate limit) still pass unmodified. | pass |
| AC-8 | Reporting an approved comment sets `status: reported` and revalidates | `reportComment > hides a comment once the third report lands and revalidates its review` — asserts `data.status === "reported"`, `reportCount === 3`, and `revalidatePath` called with `/en/reviews/test-review` and `/id/reviews/test-review`, twice total | pass |
| AC-9 | A report cannot alter `content`, cannot set `approved`, cannot change `relatedReview` | `reportComment > writes only the fields a report owns and can never approve a comment` — `Object.keys(data).sort()` equals exactly `["reportCount","reportedBy","status"]`; explicit `not.toHaveProperty` on `content`, `relatedReview`, `authorName`, `commenter`; `data.status` is `"reported"`, never `"approved"` | pass |
| AC-10 | A known email with a different name leaves the commenter row untouched | `submitComment guest identity > leaves an existing commenter's name untouched and shows the submitted name on the comment` — zero `commenters` updates in `payload.update.mock.calls` | pass |
| AC-11 | The resulting comment displays the submitted name | Same case asserts `data.authorName === "Someone Else"` on the comment create while the row keeps `Jane Reader` | pass |
| AC-13 | `getApprovedComments` rejects a missing or non-positive `reviewId` and enforces a rate limit | `rejects a review id that is not a positive integer` covers `NaN`, `0`, `-1`, `1.5`, `Infinity`, `undefined`, `null`, `"1"`, and asserts neither the limiter nor `payload.find` was reached; `enforces a per-IP rate limit before reading`; `keys the rate limit on the client address` asserts `("comments:203.0.113.5", 60, 60)` | pass |

### Supporting assertions beyond the ACs

| Requirement | Test |
| --- | --- |
| FR-5: only an `approved` comment is reportable | `rejects a comment that is not approved` (pending, rejected, reported) |
| FR-5: the review must be publicly visible | `rejects a comment on a review that is not publicly visible` (draft; published but scheduled for 2099) |
| FR-5: a deleted comment fails cleanly | `rejects a comment that no longer exists` |
| FR-5: the review id resolves from a bare relationship | `resolves the review id from an unpopulated relationship` |
| P5.T1.4: repeat report is success, not silence | `treats a repeat report from the same address as a success that writes nothing` (also exercises case-insensitive matching) and `stays idempotent after the comment has already been reported` |
| FR-8: the ceiling stays bounded | `returns approved comments under a bounded ceiling` asserts `limit: 100` |
| FR-5: the write stays on the trusted Local API path | `leaves access control at the Local API default so an anonymous report can land` |

## 4. Before / after

The production file was restored from the **phase base** with

```
git checkout 3b34c7152b3522bea9ab183f3472ea6a6ff10a21 -- src/app/actions/comments.ts
```

and explicitly **not** `git checkout --`, which yields the *committed*
(already fixed) version and would pass, proving nothing — the pitfall recorded
in `verification/phase-2.md`. The test file was the fixed one in both runs, so
the only variable was `src/app/actions/comments.ts`.

**Before** — `bun test src/app/actions/__tests__/comments.test.ts`,
`10 pass, 11 fail, 62 expect() calls`, exited with code 1.

| Failing test | What the failure shows |
| --- | --- |
| `leaves an existing commenter's name untouched…` | `Expected length: 0 / Received length: 1` — one commenter row was rewritten from the submitted name (FR-6) |
| `hides a comment once the third report lands and revalidates…` | `Expected: [ "/en/reviews/test-review" ] / But it was not called` — no revalidation (FR-11) |
| `counts a report without touching status below the threshold` | `Expected path: not "status" / Received value: "approved"` — a report wrote `status: "approved"` (AC-9) |
| `treats a repeat report…as a success` | `Expected: true / Received: false` — a duplicate report errored |
| `stays idempotent after the comment has already been reported` | `Expected: true / Received: false` |
| `rejects a comment that is not approved` | `Expected: false / Received: true` — pending/rejected/reported comments were all reportable |
| `rejects a comment on a review that is not publicly visible` | `Expected: false / Received: true` — no visibility gate existed |
| `resolves the review id from an unpopulated relationship` | The recorded `findByID` call was `{collection:"comments", id:11}` — the review was never read |
| `rejects a review id that is not a positive integer` | `Expected: false / Received: true` for `NaN`, `0`, `-1`, `1.5`, `Infinity`, `undefined`, `null`, `"1"` |
| `enforces a per-IP rate limit before reading` | `Expected: false / Received: true` |
| `keys the rate limit on the client address` | `Expected: [ "comments:203.0.113.5", 60, 60 ] / But it was not called` |

**After** — restoring the fixed file with `git checkout HEAD -- src/app/actions/comments.ts`
and re-running the same command: `21 pass, 0 fail, 102 expect() calls`, exit 0.

Full transcript: `.conductor/evidence/phase-5-before-after.txt`.

## 5. Deviations

### Deviation 1 — `P5.T1.2` as literally worded would break reporting (FR-5)

The plan says "update only `status`, with `overrideAccess: false`". Both halves
are unworkable, and the brief's resolution 1 was followed.

**"Only `status`" cannot be right**, because reporting must still increment
`reportCount` and append to `reportedBy` — that is how three reports flip a
comment to `reported` (`comments.ts:229-239` in the base). A write of `status`
alone would never reach the threshold.

**`overrideAccess: false` would deny every report.** `Comments.access.update`
returns `false` when there is no user (`Comments.ts:44-58`), and a reporter is
anonymous. Following the instruction produces an action that always fails.

**What was implemented instead is the requirement, AC-9, by construction:**

- The update payload is an explicit object literal with exactly `reportCount`,
  `reportedBy` and — only once the threshold is met — `status: "reported"`.
  Nothing from the request body is spread into it, so `content`,
  `relatedReview`, `authorName` and `commenter` are unreachable, not merely
  filtered out.
- `status` is derived in code from the count, never read from input, and the
  only value it can take is `reported`. A report cannot approve a comment.
- Access stays at the Local API default (`overrideAccess: true`) so the
  anonymous path keeps working; the write is scoped by its payload instead of by
  a rule that would deny it.

`AC-9` is proven by `writes only the fields a report owns and can never approve
a comment`, and the base run shows the old code failing it by writing
`status: "approved"`.

### Deviation 2 — `P5.T3.3`'s "page size the UI actually renders" does not exist (FR-8)

The plan says to lower the hard limit from 100 to the page size the UI renders.
**There is no page size.** `CommentList.tsx:62` renders `comments.map(...)` over
every comment it is given — no pagination, no "load more", no slice — and
`CommentSection.tsx:34-40` replaces its whole list with whatever the action
returned. There is nothing to match.

Per the brief's resolution 2, the query stays bounded and the number is a named
constant whose comment states the truth:

```ts
/**
 * Ceiling on the rows `getApprovedComments` returns in one call (`FR-8`).
 *
 * This is not a page size. `CommentList` renders `comments.map(...)` over
 * everything it is given - there is no pagination, no "load more" and no
 * slice - so the UI has no page size for this number to match. What the
 * constant is, honestly, is a defensive ceiling on a single anonymous
 * request...
 *
 * The value stays at the 100 the query already used. Lowering it would
 * silently truncate a busy review's comment list with no affordance to reach
 * the rest, which `NFR-3` forbids; the defect `FR-8` names is the missing
 * validation and rate limit, and both are added here. Adding pagination to
 * `CommentList` is the change that would make a smaller number correct.
 */
const MAX_COMMENTS_PER_REVIEW = 100;
```

**Why 100 and not lower.** Lowering it would truncate a review with more than
the new ceiling and give the reader no way to reach the remainder — the UI has
no control to load more — which is a change to public reads and therefore
`NFR-3`. The actual FR-8 defect is the missing validation and rate limit, and
both are added. Confirmed the UI is unaffected: `CommentSection` and
`CommentList` were not touched, and they render up to 100 rows exactly as
before.

## 6. Files changed

| File | Change |
| --- | --- |
| `src/app/actions/comments.ts` | `REPORT_THRESHOLD`, `REPORT_THANKS_MESSAGE`, `MAX_COMMENTS_PER_REVIEW`, `COMMENT_FETCH_LIMIT`/`COMMENT_FETCH_WINDOW_SECONDS`; removed the commenter name rewrite; `reportComment` validates its subject, scopes its payload, is idempotent and revalidates; `getApprovedComments` validates and rate-limits |
| `src/app/actions/__tests__/comments.test.ts` | 16 new cases across three new suites; the five existing `submitComment` cases are unchanged |

No file outside `Touches` was modified. No dependency was added. No migration
or schema change (`NFR-4`).

## 7. Commits

| SHA | Message |
| --- | --- |
| `946fcedfa7ab23d157c7fbfc1ad283fd7fa5f5b6` | `fix(comments): scope reports, keep guest names and bound comment fetching` |
| `36885b6f7fcb72d3a1773ba2bfd19672c0129cca` | `test(actions): cover reporting scope, guest identity and comment fetching` |
| (this report) | `docs(conductor): record phase 5 verification` |

Evidence artifacts:

- `conductor/tracks/20261026-access-control-hardening/verification/phase-5.md` — this report (committed with the track)
- `.conductor/evidence/phase-5-before-after.txt` — the full before/after transcript (gitignored, per the workflow's rule that large artifacts live under `.conductor/evidence/`)

The verification command was run twice: once on the code head `36885b6` and
again on the final tree carrying this report. Both exited 0 with
`741 pass, 0 fail`.

## 8. Notes

- **What is not proven by test.** The `payload.findByID` and `payload.update`
  mocks assert *what the action asked for*; they do not execute Payload's
  access layer. So the claim "`Comments.access.update` denies an anonymous
  caller, therefore `overrideAccess: false` would deny every report" rests on
  reading the rule at source (`Comments.ts:44-58`) and on Phase 2's
  verification, not on a test in this phase. Likewise AC-4 proves the action
  never asks for access to be enforced — the reason the closed `create` rules
  do not block it — rather than exercising the rules themselves. Both are the
  same reasoning Phases 2 and 3 recorded; a test that drives the real Local API
  against Postgres would need the integration layer the workflow does not have.
- **The `reported` status is a hiding mechanism, not a moderator decision.**
  Three anonymous reports remove a comment from the public read. That is
  pre-existing product behaviour (`FR-5` is scoped to *what the write can
  touch*) and this phase neither strengthened nor weakened it; it is recorded
  here because the report limit of 5 per 5 minutes per IP means three
  throwaway addresses can still hide any comment. Out of scope for Phase 5.
- **`rateLimit` fails open.** `src/lib/rate-limit.ts` returns success when Redis
  is unreachable or errors, so the new `getApprovedComments` limit is a
  mitigation that degrades rather than a hard guarantee. That is the existing
  helper's documented behaviour, unchanged here.
- **Concurrency.** Two reports landing in the same instant can both read
  `reportCount: 1` and both write `2`, so the counter can under-count. Fixing
  it needs a database-level increment or a lock, which is outside this phase's
  scope and was not introduced. The threshold is a moderation signal, not a
  security boundary, so the under-count costs a delayed hide, not a bypass.
- **`reportComment`'s idempotency check runs before the status gate** so a
  double-click after the third report is still a success. Reversing the order
  would make the same person's second click answer "Comment not found".
- **`getApprovedComments` returns no `totalDocs`.** It never did, and adding one
  would invite the UI to render a count it cannot page through. Left alone.

**Result: verified.**
