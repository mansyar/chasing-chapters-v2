# Phase 6 — Like visibility and moderation revalidation

| Field | Value |
| --- | --- |
| Track | `20261026-access-control-hardening` |
| Phase | 6 — Like visibility and moderation revalidation |
| Date | 2026-10-26 |
| Branch | `fix/20261026-access-control-hardening` |
| Base | `dd27dd3413f1393765a1df5d260570766029d864` |
| Head (code) | `94a9c091fcdf5c0637321f9e10afdb95c1b3af29` |
| Evidence commit | `6637984` (this file, on top of the code head) |
| Result | **verified** |

Goal, from the phase contract: *Liking a non-public review is rejected, and
approving a comment makes it visible without waiting for ISR.* Covers FR-7,
FR-10, AC-12, AC-15.

## 1. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `✓ No type errors in 256 files` |
| static | `bun run lint` | 0 | `Checked 248 files in 179ms. No fixes applied.` |
| unit | `bun test` | 0 | `725 pass, 0 fail, 1730 expect() calls`, 53 files |
| unit (targeted) | `bun test src/app/actions/__tests__/like-review.test.ts src/app/actions/__tests__/moderation.test.ts` | 0 | `19 pass, 0 fail` |
| **verify_phase** | **`bun run typecheck && bun run lint && bun test`** | **0** | all three layers green |

Runner: `bun test v1.4.3-canary.1 (43a42a836)`. `bun run typecheck` runs
`bun check`; `bun run lint` runs `biome check .`.

The suite emits stderr from pre-existing suites (translation retry/quota/budget
simulations, Redis fail-open paths, the rate-limit block, the revalidation hook)
plus the one expected line from the new moderation case that asserts a failed
lookup is swallowed. None of it is a failure — the exit code is 0 and the
summary reads `0 fail`.

The command above was run twice: once on the code head `94a9c09`, and again on
the final tree that also carries this evidence file, where it again exited 0
with `725 pass, 0 fail`.

## 2. What changed

### 2.1 FR-7 — the review is loaded and checked before the counter is touched

`src/app/actions/like-review.ts`. The pre-fix action incremented first and only
then loaded the review, at `:52`, purely to read its slug for revalidation. The
counter write had therefore already landed by the time anything could ask
whether the review was visible, so a like against a draft, a scheduled review,
or an id that was never published all succeeded.

The load now happens before the mutation:

```ts
const payload = await getPayload({ config: configPromise });
const review = await payload.findByID({
	collection: "reviews",
	id: numericId,
	depth: 0,
	disableErrors: true,
});

if (!review || !canAcceptPublicWrite(review, new Date())) {
	return { success: false, error: "Review not found" };
}
```

`disableErrors: true` is what makes a missing review answer with `null` instead
of throwing (`node_modules/payload/dist/collections/operations/findByID.js:107`
— `if (!disableErrors) { throw new NotFound(req.t); } return null;`). Without it
the nonexistent-id case would fall into the catch
and answer `"Failed to update likes"`, which is a different message from the
draft case — the exact asymmetry the fix removes.

Two ordering reasons, both recorded in the code comment:

1. A like must not be counted for a review the liker cannot see. Counting it is
   a write that outlives the request and shows up on the review once it does go
   public.
2. The pre-fix code errored on a nonexistent id but silently succeeded on a
   draft. Those two answers differed, which told a client that an unpublished
   review exists. After the fix both return the same `"Review not found"`.

The rate limit stays exactly where it was — `5` likes per `60` seconds per
`like:${ip}:${reviewId}`, ahead of any database access. It runs before the
write and was never the defect; moving it would have changed NFR-1-adjacent
behaviour for no reason.

### 2.2 FR-10 — the review's paths are revalidated after a status change

`src/app/actions/moderation.ts`. The pre-fix action authenticated, updated, and
returned. The public review page is ISR with `export const revalidate = 60`
(`src/app/(public)/[locale]/reviews/[slug]/page.tsx:36`), so an approved comment
stayed invisible until the window expired.

The fix copies the shape already established in `submitComment`
(`src/app/actions/comments.ts:146-148`): resolve the review's slug, then
`revalidatePath` each of `localizedPaths("/reviews/<slug>")`.

```ts
const slug = await resolveReviewSlug(payload, id);

if (slug) {
	for (const path of localizedPaths(`/reviews/${slug}`)) {
		revalidatePath(path);
	}
}
```

The comment is loaded at `depth: 1` so `relatedReview` resolves into the review
object and carries its slug. `reviewSlug` returns `null` for a bare numeric id,
which is how a deleted review is represented — `relatedReview` is typed
`number | Review` (`src/payload-types.ts:394`), so a missing relationship is
representable and must be guarded rather than asserted.

`resolveReviewSlug` wraps the lookup in its own try/catch and returns `null` on
failure. This matters: the status change has already been written when the
lookup runs, so a lookup failure must not turn a completed moderation into a
reported error the admin cannot act on. There is a test for exactly that.

`revalidatePath` is called directly rather than through
`src/hooks/revalidatePages.ts`'s internal `safeRevalidatePath`, which is not
exported and tolerates only one specific Next.js invariant error. `comments.ts`
calls `revalidatePath` directly, and this follows that precedent instead of
exporting a new helper.

### 2.3 Tests

`src/app/actions/__tests__/like-review.test.ts` is new (the file did not exist).
`moderation.test.ts` keeps its four original cases unmodified and gains seven.

Both suites mock the same modules the established tests mock: `payload`,
`@payload-config`, `next/headers`, `next/cache`, `@/lib/db` (the counters), and
`@/lib/rate-limit`. The like suite asserts on the *counter calls* — a rejected
like must not call `atomicIncrement` at all, and that assertion is the one that
proves FR-7, because the counter is the mutation the requirement is about.

Both files are `"use server"` modules, so every export must be async; no
non-async export was added. The existing `Number.isInteger`/`parseInt` guards
and the admin-only `payload.auth` check at `:66` are untouched.

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-12 | Liking a draft or scheduled review is rejected (FR-7) | `like-review.test.ts` — "rejects a draft review without touching the counter", "rejects a review scheduled for later without touching the counter", "rejects an unlike on a non-public review too", "answers an unknown id exactly like an unpublished one"; before/after in `.conductor/evidence/phase-6-like-before-after.txt` | pass |
| AC-15 | An admin approving a comment makes it visible without waiting for ISR expiry (FR-10) | `moderation.test.ts` — "revalidates both locale paths of the review after approving", "revalidates after rejecting too…", "loads the comment deeply enough to reach the review's slug"; before/after in `.conductor/evidence/phase-6-moderation-before-after.txt` | pass |

Supporting assertions that guard the fix rather than the defect:

| Assertion | Test | Why |
| --- | --- | --- |
| A published review still increments and revalidates both locales | "counts a like on a published review and revalidates its paths" | the fix must not break the happy path |
| A published review still decrements | "still decrements a published review" | unlike stays symmetric |
| The rate limit still runs before the visibility check | "keeps the rate limit ahead of the visibility check" | `findByID` is never called when limited |
| A non-numeric id is still rejected by the schema | "rejects a non-numeric id before reaching the database" | the existing zod guard is preserved |
| No revalidation when the caller is unauthorized | "does not revalidate when the caller is unauthorized" | a rejected request must not invalidate pages |
| A comment whose review is deleted still succeeds | "still succeeds when the comment's review is gone" | no page exists to invalidate |
| A comment that cannot be reloaded still succeeds | "still succeeds when the comment itself cannot be reloaded" | status already written |
| A failed lookup still succeeds | "still succeeds when reloading the comment fails outright" | status already written |

The four original `moderation.test.ts` cases — invalid status, unauthenticated,
non-admin writer, admin approve — are unmodified and pass, which is NFR-2
(admin moderation behaviour unchanged).

## 4. Before / after

Both reproductions restore the production file from the **phase base** with
`git checkout dd27dd3413f1393765a1df5d260570766029d864 -- <path>`, not
`git checkout --`. The latter yields the *committed* (already fixed) version and
would pass, proving nothing — the pitfall recorded in `verification/phase-2.md`.

### FR-7

`git checkout dd27dd3… -- src/app/actions/like-review.ts` →
`bun test src/app/actions/__tests__/like-review.test.ts`:

**4 pass, 4 fail, 21 expect() calls — Exited with code 1.**

All four failures are on the counter, which is the mutation:

```
error: expect(received).not.toHaveBeenCalled()
Expected number of calls: 0
Received number of calls: 1
(fail) toggleLikeReview visibility > rejects a draft review without touching the counter
(fail) toggleLikeReview visibility > rejects a review scheduled for later without touching the counter
(fail) toggleLikeReview visibility > rejects an unlike on a non-public review too
(fail) toggleLikeReview visibility > answers an unknown id exactly like an unpublished one
```

`Received number of calls: 1` is the defect stated directly: the pre-fix action
wrote the counter for a review nobody could see. The four cases that passed
pre-fix — published increment, published decrement, rate-limit-before-visibility,
non-numeric id — are the control that shows the mocks are wired to the real
action, so the four failures are the defect and not a broken harness.

After restoring to HEAD: **8 pass, 0 fail, 33 expect() calls.**

### FR-10

`git checkout dd27dd3… -- src/app/actions/moderation.ts` →
`bun test src/app/actions/__tests__/moderation.test.ts`:

**8 pass, 3 fail, 23 expect() calls — Exited with code 1.**

```
error: expect(received).toHaveBeenCalledWith(...expected)
Expected: [ "/en/reviews/dune" ]
But it was not called.
(fail) setCommentStatus > revalidates both locale paths of the review after approving
(fail) setCommentStatus > revalidates after rejecting too, since hiding a comment is also a visible change
(fail) setCommentStatus > loads the comment deeply enough to reach the review's slug
```

`But it was not called` is the defect in its own terms: the approval wrote the
status and invalidated nothing, so the cached page kept serving the old comment
list for up to 60s. The three guard cases that also passed pre-fix (no
revalidate when unauthorized, review gone, comment not reloadable) pass
trivially before the fix because nothing revalidates at all; they pin the
*after* behaviour and are not counted as proof of the defect.

After restoring to HEAD: **11 pass, 0 fail, 26 expect() calls.**

## 5. Which visibility predicate, and why

`canAcceptPublicWrite` from `src/lib/publish-visibility.ts` — not
`isPubliclyVisible`, and not a new comparison of `_status` by hand.

The module documents the two predicates as answering different questions. A like
is a public, unauthenticated write: it is exactly the case
`canAcceptPublicWrite` exists for, and its doc comment states the rule — *"the
write path has to agree with the read path. A reader who can see a review can
comment on it, and a reader who cannot must get the same answer as for a review
that does not exist, or a scheduled review leaks its existence through a
distinct reply."* That is FR-7's requirement almost verbatim.

`isPubliclyVisible` is the read-side predicate; `canAcceptPublicWrite` delegates
to it today, so the behaviour is identical. Choosing the write-side name keeps
the call site honest about which question it is asking and means a future
divergence between the read and write rules lands on the correct side by
default. This also matches `submitComment`, which uses the same predicate with
the same `new Date()` and the same `"Review not found"` message — a reader gets
one answer whether they try to comment on or like a hidden review.

Not inventing a third predicate matters for the same reason: the module's
opening comment requires `publishedAndVisibleWhere` and `isPubliclyVisible` to
stay in step, and a hand-rolled `_status === "published"` check in the action
would be a third expression of the rule that nothing keeps in step.

## 6. Evidence paths and commits

Evidence artifacts (gitignored, under `.conductor/evidence/`):

- `.conductor/evidence/phase-6-like-before-after.txt`
- `.conductor/evidence/phase-6-moderation-before-after.txt`

Commits on this phase:

| Commit | Message |
| --- | --- |
| `217231f168f42752c1c3f3a0e087a7adb3c429d3` | `fix(likes): reject likes on reviews that are not publicly visible` |
| `72a2f835a20087f4dbedc243456ecbe220e27445` | `fix(moderation): revalidate review paths after a comment status change` |
| `23c6467c28452809511e7ef2d3749e4f0f85ecaa` | `test(actions): assert the like counter is never written for a non-public review` |
| `94a9c091fcdf5c0637321f9e10afdb95c1b3af29` | `fix(moderation): never fail a completed status change on a lookup error` |

Files changed:

- `src/app/actions/like-review.ts`
- `src/app/actions/moderation.ts`
- `src/app/actions/__tests__/like-review.test.ts` (new)
- `src/app/actions/__tests__/moderation.test.ts`

## 7. Deviations

None. Every change falls inside the phase's `Touches` paths.

## 8. Notes

- **The like counter is not a per-user record.** `toggleLikeReview` takes a
  `shouldIncrement` boolean from the client and adjusts a single column, so a
  client can call it repeatedly and drive the count up or down at will (within
  the 5-per-60s limit). That is a separate defect from FR-7 — it needs a
  distinct-liker model and therefore a schema change, which the spec puts out of
  scope (`NFR-4`: no migration, no schema change). FR-7 is satisfied as written:
  a non-public review is rejected. Recorded here because it is the next thing a
  reader of this fix will notice.
- **The revalidation is fire-and-forget in the sense that it happens after the
  write.** If `revalidatePath` itself threw, the catch would report failure for
  a status change that already landed. This is the same trade `submitComment`
  makes and the phase contract asks for that shape; a failed invalidation is
  recoverable by the next ISR window, a misreported moderation is not. Not
  changed here.
- **Not proven by this phase:** that Next.js actually serves the fresh page
  after `revalidatePath` — the tests assert the call, not the cache behaviour,
  because that would need a running server and an e2e run. `revalidate = 60` on
  the review page is the reason the call is needed; that the call is made for
  both locale paths is what the tests establish.
- **Not proven:** the DB-side effect of the visibility check against a real
  Postgres. The like suite mocks `findByID`, so it proves the action's decision
  given a review document, not Payload's draft resolution. The predicate itself
  is unit-tested in `src/lib/__tests__/publish-visibility.test.ts` from an
  earlier phase.
- The rate limits were deliberately left untouched: `5` likes per `60` seconds
  per IP and review, and `3` comments per `60` seconds per IP (NFR-1 depends on
  the latter). The admin-only check at `moderation.ts:66` is unchanged, so
  writers still cannot moderate.

**Result: verified.**

## Primary verification

The primary re-ran every layer on the squashed checkpoint `dd6aa0b` and
reproduced both defects independently.

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 256 files (620ms) |
| static | `bun run lint` | 0 | 248 files checked, no fixes applied |
| unit | `bun test` | 0 | 725 pass, 0 fail, 1729 expect() calls, 53 files (4.51s) |

**Reproduced both defects from the phase base `dd27dd3`**, restoring each
production file with `git checkout <base> -- <path>` and keeping this phase's
tests:

- `like-review.test.ts`: **4 pass, 4 fail**, every failure on
  `expect(atomicIncrement).not.toHaveBeenCalled()` → `Received number of
  calls: 1`. The counter was written for a draft, for a review scheduled for
  later, for an unlike on a non-public review, and for an unknown id. That is
  the defect itself, not a proxy for it.
- `moderation.test.ts`: **8 pass, 3 fail**, all `But it was not called` on
  `revalidatePath`.

After restoring: **19 pass, 0 fail, 59 expect() calls** across the two files.

**Reviewed the production diff directly.** The like action now loads the review
at `depth: 0` with `disableErrors: true` before touching the counter, so a
missing review and an unpublished one give the same answer — the previous code
errored for the former and succeeded for the latter, which told a client the
review exists. `canAcceptPublicWrite` was chosen over `isPubliclyVisible`
and over a hand-rolled `_status` comparison: a like is a public unauthenticated
write, which is precisely that predicate's documented question, and it is the
call `submitComment` already makes. Rate limits and the admin-only check are
untouched.

**Result: verified.** AC-12 and AC-15 are satisfied by test evidence, FR-7 and
FR-10 by the code. All four pre-existing moderation cases still pass, unmodified.

Three observations carried to review, none blocking:

- **A redundant query in moderation.** `setCommentStatus` writes the comment,
  then `resolveReviewSlug` fetches the same comment again at `depth: 1` to
  reach the slug. Fetching once at `depth: 1` *before* the update and reusing
  the slug would be a single query. It is two extra round trips per moderation
  action on an admin path, so it is cheap, and the current order does read the
  fresh state — worth a reviewer's judgement rather than a silent rewrite here.
- **The like counter remains client-controlled.** `shouldIncrement` is a
  boolean from the client against a single column, so a client can drive the
  count up or down within the rate limit. That is a different defect from FR-7
  and fixing it needs a distinct-liker model, which is a schema change and
  therefore outside NFR-4. Recorded, deliberately not fixed.
- **What is not proven.** That Next.js actually serves the fresh page after
  `revalidatePath` — the tests assert the call, not the cache behaviour — and
  the visibility check's draft resolution, since `findByID` is mocked. Both
  are properties of the framework and the database rather than of this code, and
  the e2e suite does not exercise moderation.