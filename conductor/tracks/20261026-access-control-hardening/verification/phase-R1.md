# Phase R1 — Review fixes (F1–F4)

Track: `20261026-access-control-hardening`
Branch: `fix/20261026-access-control-hardening`
Phase base: `7cb09f1bbcd58e8d6859a2a75a2172ee9ec904ba`

## 1. Result

All four review findings are resolved.

| ID | Severity | Status |
| --- | --- | --- |
| F1 | Medium | Fixed |
| F2 | Medium | Fixed |
| F3 | Low | Fixed |
| F4 | Low | Fixed |

The verification command exits 0. F1's fix was verified against the two paths
that legitimately write the fields rather than assumed: `Comments.afterChange`
and `submitComment` both go through the Local API, whose `overrideAccess`
defaults to `true`, so field-level rules are not consulted. That is now pinned
by a test rather than left as a comment.

## 2. Commands

| Command | Exit | Summary |
| --- | --- | --- |
| `bun run typecheck` | 0 | `✓ No type errors in 258 files` |
| `bun run lint` | 0 | `Checked 250 files in 201ms. No fixes applied.` |
| `bun test` | 0 | `752 pass, 0 fail`, 54 files |
| `bun run typecheck && bun run lint && bun test` (the phase verification command) | 0 | All three stages pass in one run |

Per-fix runs used while iterating:

| Command | Exit | Summary |
| --- | --- | --- |
| `bun test src/collections/__tests__/Commenters.test.ts` | 0 | 7 pass |
| `bun test src/app/actions/__tests__/comments.test.ts src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | 28 pass |

## 3. Findings

### F1 — a writer can mint a trusted commenter

**What changed.** `trusted` and `banned` on `Commenters` gained field-level
`access` rules: `create` and `update` both admit only `role === "admin"`.
Previously the collection's `create` rule was `Boolean(user)` with no field
rules, so a writer could `POST /api/commenters` with `{"trusted": true}`, then
`POST /api/comments`, and `resolveCommentStatus` would auto-approve content it
had flagged as spam. That is the track's defect 2 with a session instead of
anonymity.

Both rules are needed. `update` alone leaves the create path open, which is
the whole finding; `create` alone would let a writer flip an existing row.

**Files.** `src/collections/Commenters.ts`,
`src/collections/__tests__/Commenters.test.ts`.

**Assertion that fails if reverted.** `Commenters moderation field access >
denies a writer both flags on create and on update` — it asserts
`typeof rule === "function"` for all four `(field, operation)` pairs, so
removing any one rule fails rather than silently skipping. Backed by
`drops both flags from a writer's create so the row lands untrusted`, which
mirrors Payload's behaviour of deleting a denied field from the write (the
row then falls back to `defaultValue: false`) rather than rejecting the
document.

**The verified write path.** `still lets the approval hook raise 'trusted'
through the Local API` drives the real `Comments.afterChange` hook and asserts
the `payload.update` call it makes carries `{approvedCommentCount: 3, trusted:
true}` and no `overrideAccess` / `user` key. Because the call omits
`overrideAccess`, the Local API default (`true`) applies and the new field
rules are not consulted — so the three-approved-comments promotion still
works.

`submitComment` is covered on the same property, extended for this phase: the
existing end-to-end guest submit test asserts no `overrideAccess`, `user` or
`req` on either `payload.create` call, and it now also asserts the commenter
create still carries `trusted: false, banned: false`. That is the write the new
rules could have silently altered — a rule that applied here would strip both
keys from the data instead of storing `false`.

### F2 — the fetch limit could silently empty a comment section

**What changed, three parts.**

1. `getApprovedComments` now rate-limits on `comments:${ip}:${reviewId}` (was
   `comments:${ip}`), matching the like action's `like:${ip}:${reviewId}`
   shape, and the ceiling moved from 60 to 120. The old key was shared by every
   reader behind one NAT, proxy or busy egress while the action is called once
   per review-page mount, so ordinary traffic on a popular review could
   exhaust the bucket for everyone behind that address.
2. `CommentSection` no longer renders a failed fetch as an empty list. The list
   state moved to `src/components/comments/comment-fetch-state.ts`, whose
   `applyCommentsResult` sets `hasError` on failure and keeps any comments
   already on screen (a failed refresh after a submit must not blank a list the
   reader was reading). The component renders `dictionary.commentsLoadError`
   in a `role="alert"` block instead of `CommentList`.
3. `commentsLoadError` was added to both locales in
   `src/lib/i18n/dictionary.ts`. `id` is typed as `Dictionary`, so the
   Indonesian string is mandatory rather than optional.

**Files.** `src/app/actions/comments.ts`,
`src/app/actions/__tests__/comments.test.ts`,
`src/components/comments/CommentSection.tsx`,
`src/components/comments/comment-fetch-state.ts`,
`src/components/comments/__tests__/comment-fetch-state.test.ts`,
`src/lib/i18n/dictionary.ts`.

**Assertion that fails if reverted.** `getApprovedComments > keys the rate
limit on the client address and the review` asserts the exact
`("comments:203.0.113.5:1", 120, 60)` triple, so reverting either the key or
the ceiling fails; `gives each review its own bucket from the same address`
asserts two calls from one address produce two distinct keys. On the
component side, `applyCommentsResult > reports a rejected fetch as an error,
not as an empty list` fails if a rejection is folded back into
`{comments: [], isLoading: false}`.

### F3 — the revalidation rationale was wrong, and report revalidation was unconditional

**What changed.** Both doc blocks claimed the public review page is ISR and
would serve a stale comment for 60 seconds. That is false:
`src/app/(frontend)/reviews/[slug]/page.tsx` renders nothing comment-related,
and `CommentSection` is a client component that fetches on mount. The
revalidation itself is kept — FR-10 and FR-11 require it — but it is now
described as defence in depth for any server-rendered surface, with the
client-fetch noted explicitly.

`reportComment`'s revalidation is now gated on `report.status === "reported"`.
Below the threshold the write touches only `reportCount` and `reportedBy`,
neither of which appears in any public output, so regenerating the page was
work with nothing to show for it.

**Files.** `src/app/actions/comments.ts`, `src/app/actions/moderation.ts`,
`src/app/actions/__tests__/comments.test.ts`.

**Assertion that fails if reverted.** `reportComment > does not regenerate the
review page below the report threshold` asserts `revalidatePath` was not
called for a first report. The existing `third report hides the comment and
revalidates both locales exactly twice` still passes, so the gate did not
disable the behaviour it was meant to keep.

### F4 — the doc block understated the gate's contract

**What changed.** `canAcceptPublicWrite`'s block said it decided whether "a
public write - a reader's comment" may target a review. It now names all three
call sites — `submitComment`, `reportComment` and `toggleLikeReview` — and
states why a fourth public write belongs behind this call rather than a
hand-rolled `_status` check: a like-shaped write checking only `_status` would
still accept a review scheduled for next week, and the write gate would drift
from the read gate.

**File.** `src/lib/publish-visibility.ts`.

**Assertion that fails if reverted.** None. This is a documentation change
with no behavioural surface, so there is nothing to assert; `workflow.md`'s
pass criteria allow a finding to be closed by documented evidence instead of a
test.

## 4. Before / after

Both reproductions start from the phase base. Each revert used
`git checkout <phase-base-sha> -- <path>` (not `git checkout -- <path>`), the
file was restored from `HEAD` afterwards, and `git status --porcelain` was
empty between steps.

### F1 — `src/collections/Commenters.ts` reverted to `7cb09f1`

Command: `bun test src/collections/__tests__/Commenters.test.ts` → exit 1,
`5 pass, 2 fail`.

```
Commenters moderation field access > denies a writer both flags on create and on update
  expect(typeof rule).toBe("function")
  Expected: "function"
  Received: "undefined"
  at Commenters.test.ts:112:25

Commenters moderation field access > drops both flags from a writer's create so the row lands untrusted
  expect(write).toEqual({ name: "x", emailHash: "abc123" })
  +   "banned": true,
  +   "trusted": true,
  at Commenters.test.ts:128:17
```

The second failure is the finding itself: a writer's create carrying
`trusted: true, banned: true` kept both flags pre-fix.

Restored with `git checkout HEAD -- src/collections/Commenters.ts`.

### F2 and F3 — `src/app/actions/comments.ts` reverted to `7cb09f1`

Command: `bun test src/app/actions/__tests__/comments.test.ts` → exit 1,
`20 pass, 3 fail`.

```
reportComment > does not regenerate the review page below the report threshold
  expect(revalidatePath).not.toHaveBeenCalled()
  Expected number of calls: 0
  Received number of calls: 2
  at comments.test.ts:363:30            <- F3

getApprovedComments > keys the rate limit on the client address and the review
  Expected: ["comments:203.0.113.5:1", 120, 60]
  Received: ["comments:203.0.113.5", 60, 60]
  at comments.test.ts:595:24            <- F2

getApprovedComments > gives each review its own bucket from the same address
  Call #1: Expected: ["comments:203.0.113.5:1", 120, 60]
           Received: ["comments:203.0.113.5", 60, 60]
  at comments.test.ts:608:24            <- F2
```

Restored with `git checkout HEAD -- src/app/actions/comments.ts`.

### F2 — `src/components/comments/CommentSection.tsx` reverted to `7cb09f1`

Command: `grep -E 'hasError|commentsLoadError|applyCommentsResult' src/components/comments/CommentSection.tsx`
→ no matches.

This is a source-level reproduction, not an executable one, and is recorded as
such. Pre-fix the component calls `setComments` only inside
`if (result.success && result.data)` and then always `setIsLoading(false)`, so
a rejected fetch leaves `{comments: [], isLoading: false}` and falls through to
`<CommentList comments={[]} …/>`, which renders `dictionary.commentsEmpty`.
There is no error branch to assert against, which is exactly the finding. See
§7 for what this leaves unproven.

Restored with `git checkout HEAD -- src/components/comments/CommentSection.tsx`.

## 5. Files changed and commits

| File | Change |
| --- | --- |
| `src/collections/Commenters.ts` | F1: field-level `create` + `update` admin-only on `trusted` and `banned` |
| `src/collections/__tests__/Commenters.test.ts` | F1: four field-rule assertions, the write-shape mirror, and the `afterChange` promotion test |
| `src/app/actions/comments.ts` | F2: per-review rate-limit key and a 120 ceiling. F3: reworded report revalidation, gated on the status becoming `reported` |
| `src/app/actions/__tests__/comments.test.ts` | F2: key and ceiling assertions. F3: the below-threshold no-revalidation test; the relationship-resolution test now uses a third report so it still exercises the revalidation. F1: the guest-submit test now asserts the commenter create still carries `trusted: false, banned: false` |
| `src/app/actions/moderation.ts` | F3: reworded `setCommentStatus` revalidation rationale |
| `src/components/comments/CommentSection.tsx` | F2: error branch replacing the empty-state fallthrough |
| `src/components/comments/comment-fetch-state.ts` | F2: new pure state module (see §6) |
| `src/components/comments/__tests__/comment-fetch-state.test.ts` | F2: new test for the error branch |
| `src/lib/i18n/dictionary.ts` | F2: `commentsLoadError` in `en` and `id` |
| `src/lib/publish-visibility.ts` | F4: generalised doc block naming all three call sites |
| `conductor/tracks/20261026-access-control-hardening/verification/phase-R1.md` | this evidence file |

Commits, copied verbatim from `git log` — every phase commit except the one that
writes this sentence into this file:

- `e67843b` — `fix(commenters): withhold the moderation flags from non-admin writers` (F1)
- `e10f16a` — `fix(comments): scope the fetch limit per review and show a load error` (F2)
- `cc144a9` — `docs(comments): name every public write the visibility gate serves` (F4)
- `01f61af` — `test(comments): pin the guest commenter create's moderation flags` (F1)
- `ec271d1` — `docs(conductor): record the phase R1 verification evidence`
- `f97a577` — `docs(conductor): correct the phase R1 evidence to the final run`

F3 shipped inside `e10f16a`; it touches the same two modules as F2 and splitting
the revalidation gate away from the comment-fetch work would have meant two
commits editing the same hunk of `comments.ts`. `01f61af` extends the guest
submit test for F1's write path, after the field rules it pins had landed.

## 6. Deviations

Two files outside the plan's `Touches` list were added, both for F2's
component half:

| File | Reason |
| --- | --- |
| `src/components/comments/comment-fetch-state.ts` | No React component-test harness exists in this project (`@testing-library`, `react-test-renderer`, `jsdom` and `happy-dom` are all absent, and there are no `.test.tsx` files), so the error branch cannot be asserted through `CommentSection` directly. Extracting the state transition into a pure module is what makes `rejected fetch → hasError` testable at all. It is a new file, so no existing behaviour moved. |
| `src/components/comments/__tests__/comment-fetch-state.test.ts` | The test for the above. |

`bunfig.toml` scopes tests to `./src`, so the new test had to live under
`src/components/comments/__tests__/`.

No other file outside `Touches` was modified. No generated file, lockfile,
`plan.md`, `spec.md`, `metadata.json`, `tracks.md`, `conductor/index.md`,
`product.md`, `product-guidelines.md`, `review.md` or `pr.md` was touched.

## 7. Notes — what is not proven

- **The component's rendered output is not asserted.** F2's error branch is
  proven at the state-transition level (`applyCommentsResult`) and by reading
  the component, not by rendering it. If `CommentSection` were changed to stop
  consuming `hasError`, the state test would still pass. A component test
  harness is the change that would close this; the styleguide exempts purely
  presentational components from mandatory unit tests, and this is the closest
  the project can get without one.
- **The writer path in F1 is proven at the rule level, not over HTTP.** The
  tests call the access functions and mirror Payload's deny-by-deletion
  behaviour; they do not POST to `/api/commenters` as a writer. The suite has
  no authenticated REST coverage (recorded as out of scope on this track), so
  the mirroring of Payload's semantics is asserted from
  `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js`, not
  observed against a running server.
- **`submitComment`'s write path is covered by an extended existing test, not a
  new one.** The end-to-end guest submit test asserts no `overrideAccess`,
  `user` or `req` on either `payload.create` call, which is the property F1
  depends on, and now also that the commenter create still carries
  `trusted: false, banned: false` — the two keys a field rule that applied
  here would delete. It was extended rather than duplicated, because the path
  it drives is the same one.
- **The 120 ceiling is a judgement, not a measurement.** It clears two calls
  per page view with room for 60 views of one review per minute from a single
  address. No traffic data was consulted; if it proves too low the symptom is
  the load-error message rather than a silently empty list, which is the
  improvement F2 was after.
- **F3's gating changes when the page regenerates, not whether a reader sees
  the change.** Since the list is client-fetched, a reader sees a status change
  on their next fetch with or without the revalidation. The gate was verified
  only as "the call is not made below the threshold"; no e2e run observed a
  cached page.
- **No e2e run was performed for this phase.** `workflow.md` requires e2e when
  a phase touches user-facing flows, and F2 does change a user-visible
  branch. The phase verification command does not include e2e and the brief
  specified it exactly; the integrated e2e result recorded on this track
  predates these changes, so the error branch has not been exercised in a
  browser.
