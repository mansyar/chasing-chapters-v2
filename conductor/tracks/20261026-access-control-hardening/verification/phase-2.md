# Phase 2 verification - Comments collection access

- **Track:** 20261026-access-control-hardening
- **Phase:** 2 - Comments collection access
- **Date:** 2026-10-26
- **Branch:** fix/20261026-access-control-hardening
- **Base:** 9300c68232e0cd6721a6585e1f8081288f73e290
- **Head:** edf14406f480a6666eba55d4c5209188c5d15c05
- **Result:** verified

## 1. Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 253 files (473.19ms) |
| static | `bun run lint` | 0 | Checked 245 files in 146ms. No fixes applied |
| unit | `bun test` | 0 | 700 pass, 0 fail, 1651 expect() calls, 50 files (2.58s) |
| unit | `bun test src/collections/__tests__/Comments.test.ts` | 0 | 16 pass, 0 fail, 25 expect() calls |
| combined | `bun run typecheck && bun run lint && bun test` | 0 | All three layers pass |

The combined command was run twice: once on the code tree after the fix, and again on the final committed tree after the evidence file was added. Both exited 0. The `expect()` total differs between runs (1652 then 1651) because a few pre-existing suites take a conditional retry path; the pass/fail counts are stable at 700 / 0.

The unit total moved from 690 to 700: ten new cases in `Comments.test.ts`, none removed and none of the six existing `beforeChange` cases modified. Phase 1's total was 690; the 10 added here account for the whole difference.

## 2. What changed

### `src/collections/Comments.ts` - anonymous create closed (FR-3)

```ts
// Guest commenting does not need an open create rule: the
// `submitComment` server action writes through the Local API, where
// `overrideAccess` defaults to true and this rule is not consulted.
// Leaving it open only exposed `POST /api/comments` to anyone.
create: ({ req: { user } }) => Boolean(user),
```

The rule denies anonymous callers rather than everyone, as the brief required: `read`, `update` and `delete` are untouched, and authenticated staff still reach a collection they can legitimately write.

### `src/collections/Comments.ts` - status restricted to admins (FR-9)

```ts
access: {
	// The collection rule above lets a writer update comments on
	// their own reviews, so the privileged transition has to be
	// withheld here: a writer may still moderate a comment, but
	// Payload drops `status` from their write rather than
	// rejecting it. Approving is an admin decision (FR-9).
	//
	// Deliberately no `create` rule. On create the derivation hook
	// below owns this field, and a create-time rule could drop the
	// value before the hook sets it.
	update: ({ req: { user } }) => user?.role === "admin",
},
```

No `access.create` was added on `status`, per the constraint in the brief. The `afterChange` hook that increments `approvedCommentCount` and sets `trusted` at three approvals was not touched.

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-5 | An anonymous `POST /api/comments` is rejected | `Comments.test.ts` "denies an anonymous create" - asserts `create` returns `false` for `req.user = null`; "allows an authenticated create" asserts it returns `true` for admin and writer, so the rule denies anonymous rather than denying everyone | covered |
| AC-14 | A writer cannot set a comment's `status` to `approved` | `Comments.test.ts` "denies a writer the status field on a comment they may otherwise update" - asserts the collection `update` rule still returns the writer's `relatedReview.author` constraint *and* that the field rule returns `false`; "drops status from a writer's write so approval does not land" asserts the resulting write has no `status` key; "lets an admin approve a comment" asserts the admin's write carries `status: "approved"` | covered |

### Supporting assertions, beyond the two criteria

- "leaves the read, update and delete rules unchanged" - anonymous read still resolves to `{ status: { equals: "approved" } }`, anonymous update still `false`, delete still admin-only. This is the check that the create change did not widen or narrow the neighbours.
- "keeps a writer's read access to comments on their own reviews" (P2.T2.2) - writer read still resolves to `{ "relatedReview.author": { equals: writer.id } }`, admin read still `true`. Writers keep the read access moderation needs.
- "leaves the status field unrestricted on create" - asserts `status.access.create` is `undefined`, so a future edit cannot silently introduce a create-time rule that fights the derivation hook.
- "keeps the status field required with a pending default" - the field's shape is unchanged apart from the added access rule.
- "derives the status on create regardless of a submitted value" (P2.T1.2) - a create carrying `status: "approved"` still comes out of the hook as `pending`. This is the positive-path proof that the action's create path still produces a derived status.

## 4. Before / after

The same test file was run against the pre-fix `Comments.ts` and against the fixed one. Full pre-fix output is archived at `.conductor/evidence/phase-2-before.txt`.

**Before the fix - `bun test src/collections/__tests__/Comments.test.ts` → 12 pass, 4 fail, exit 1:**

```text
error: expect(received).toBe(expected)

Expected: false
Received: true

(fail) Comments collection create access > denies an anonymous create [1.96ms]
```

```text
error: expect(received).not.toHaveProperty(path)

Expected path: not "status"

Received value: "approved"

(fail) Comments status field access > drops status from a writer's write so approval does not land [0.32ms]
```

```text
error: expect(received).toBe(expected)

Expected: false
Received: undefined

(fail) Comments status field access > denies a writer the status field on a comment they may otherwise update [0.33ms]
```

```text
error: expect(received).toBe(expected)

Expected: true
Received: undefined

(fail) Comments status field access > lets an admin approve a comment [0.16ms]
```

**After the fix - 16 pass, 0 fail, 25 expect() calls, exit 0.**

### Which of the four failures actually prove the defect

Two of the four are the real proof, and two are weaker. Recording the distinction rather than presenting four equal proofs:

- **`denies an anonymous create` → `Expected: false, Received: true`.** This is the defect itself. On pre-fix code the rule is `() => true`, so it returns `true` for a request with no user. Direct evidence for AC-5.
- **`drops status from a writer's write` → `not.toHaveProperty("status")`, received `"approved"`.** This is the defect itself for FR-9. With no field rule the write keeps `status`, so the writer's approval lands. Direct evidence for AC-14.
- **`denies a writer the status field` → `Received: undefined`.** Before the fix there is no `access.update` on the field, so `statusUpdateAccess()` returns `undefined`. This proves *the configuration was added*, not that a writer is denied - a rule returning `undefined` and one returning `false` are indistinguishable to it. Same caveat Phase 1 recorded for its own `undefined` failures.
- **`lets an admin approve a comment` → `Received: undefined`.** The same shape, in the other direction: it proves the rule exists and admits an admin once present, not that anything was wrong before.

So the two assertions carrying the weight are the `toBe(false)` on the anonymous create and the `not.toHaveProperty("status")` on the writer's write. Both failed for the right reason pre-fix and pass post-fix.

## 5. Why the server action is unaffected (P2.T1.2)

Proven two ways rather than asserted:

1. **Read the action.** `src/app/actions/comments.ts` contains no `overrideAccess` anywhere (verified by search: only four `collection: "comments"` occurrences, at lines 128, 208, 242 and 272, none of them accompanied by an access override). Every Local API call therefore runs with Payload's default `overrideAccess: true`, and `executeAccess` is skipped entirely - `node_modules/payload/dist/collections/operations/create.js:126` guards the call with `if (!overrideAccess)`. The new rule cannot reach the action.
2. **Tested the derivation.** "derives the status on create regardless of a submitted value" submits `status: "approved"` through the hook and gets `pending` back, confirming the hook still assigns `data.status` unconditionally. Combined with the six pre-existing derivation cases, which are unmodified and passing, the action's create path still produces a derived status.

### Hook order, as it applies to this change

For create, Payload runs `beforeOperation` → field-level `beforeValidate` access → collection `beforeValidate` hooks → collection `beforeChange` (the derivation) → field `beforeChange` → `afterChange`. Confirmed in `create.js`: field `beforeValidate` at line 158, collection `beforeChange` at lines 198-199.

Because no field-level `create` access was added on `status`, the derivation at `beforeChange` still owns the field and is not interfered with. Had `access.create` been added, the field could have been dropped at `beforeValidate` before the hook ever ran.

## 6. Evidence paths and commits

- `src/collections/Comments.ts` - both rules
- `src/collections/__tests__/Comments.test.ts` - ten new cases across three `describe` blocks; the six existing `beforeChange` cases unmodified
- `.conductor/evidence/phase-2-before.txt` - archived pre-fix run (gitignored)
- This file
- Commit: `edf1440` - `fix(comments): deny anonymous creates and restrict comment status to admins`

## 7. Deviations

None. Both changed files are inside `Touches`.

## 8. Notes

- **What this does not prove.** That a real `POST /api/comments` over REST returns 401/403, and that a real `PATCH /api/comments/<id>` by an authenticated writer drops `status`. Both need a running Payload instance with an authenticated session, which this project's harness does not provide for collection access rules - the e2e suite drives the admin UI, not the REST API. This is the same limitation Phase 1 recorded. The unit tests prove the rules' behaviour and the write they produce; the REST paths are covered by construction, because Payload evaluates exactly these callbacks. If a future track adds authenticated REST coverage, AC-5 and AC-14 should be re-proven there.
- **No `access.create` on `status`, deliberately.** Recorded in the code comment as well as here, so the next reader does not "fix" the derivation hook by trusting client input.
- **The `create` rule denies anonymous, not everyone.** The brief offered `() => false` as an alternative and asked for the disagreement to be recorded if chosen. It was not chosen: `Boolean(user)` matches the spec's "denies anonymous" wording and keeps authenticated staff working. No disagreement to record.
- **Residual noticed, not fixed (out of scope for this phase).** The collection-level `update` rule permits a writer on comments on their own reviews, and now that `status` is withheld, a writer's remaining reachable fields on such a comment are `authorName`, `content` and `reportCount`. That is arguably still more than a moderation role needs - a writer can edit a commenter's displayed name and content - but narrowing it is a product decision about what writer moderation should mean, not an access-control defect, and it is not in this phase's scope. Flagging it for the review phase rather than changing it silently.
- **The `afterChange` hook was not touched.** It still increments `approvedCommentCount` and sets `trusted` at three approvals. Note that it fires on any update reaching `approved`, and now only an admin's update can produce that transition - which is the intended consequence, but it does mean the count only moves when an admin approves.
