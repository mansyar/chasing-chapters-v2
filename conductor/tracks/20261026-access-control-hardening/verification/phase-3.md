# Phase 3 verification - Commenter identity

- **Track:** 20261026-access-control-hardening
- **Phase:** 3 - Commenter identity
- **Date:** 2026-10-26
- **Branch:** fix/20261026-access-control-hardening
- **Base:** 0a4994e66b4c2db0be83130838bff39b5484d1f4
- **Head:** 45e85f0ae9e97f133bff187168e05fa96294f3a3
- **Result:** verified

## 1. Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 254 files (606.40ms) |
| static | `bun run lint` | 0 | Checked 246 files in 138ms. No fixes applied |
| unit | `bun test` | 0 | 703 pass, 0 fail, 1663 expect() calls, 51 files (2.56s) |
| unit | `bun test src/collections/__tests__/Commenters.test.ts` | 0 | 3 pass, 0 fail, 12 expect() calls |
| combined | `bun run typecheck && bun run lint && bun test` | 0 | All three layers pass |

The combined command was run twice: once on the code tree after the fix, and again on the final tree after the evidence file was added. Both exited 0. The `expect()` total differs between the two runs (1663 then 1664) because a few pre-existing suites take a conditional retry path - the same variance Phase 2 recorded. Pass/fail counts are stable at 703 / 0, and the file count at 51.

The unit total moved from 700 to 703 and the file count from 50 to 51: the three cases in the new `Commenters.test.ts` account for the whole difference, and `expect()` calls moved 1651 → 1663 (+12), matching the 12 assertions in that file. No other suite changed.

## 2. What changed

### `src/collections/Commenters.ts` - anonymous create closed (FR-2)

```ts
read: ({ req: { user } }) => user?.role === "admin",
// Guest commenting does not need an open create rule: the
// `submitComment` server action writes through the Local API, where
// `overrideAccess` defaults to true and this rule is not consulted.
// Leaving it open let anyone mint a commenter with `trusted: true`,
// which skips the spam hold on that commenter's comments.
create: ({ req: { user } }) => Boolean(user),
update: ({ req: { user } }) => user?.role === "admin",
delete: ({ req: { user } }) => user?.role === "admin",
```

`read`, `update` and `delete` are byte-identical to their previous state. The rule denies anonymous callers rather than everyone, per the brief's constraint: `Boolean(user)` matches the spec's "denies anonymous" wording and keeps authenticated staff working in a collection whose other three rules they already hold. `() => false` was not chosen, so there is no disagreement to record.

### `src/collections/__tests__/Commenters.test.ts` - new file

Modelled on `Comments.test.ts`: it imports the collection config directly, calls the access callbacks with a constructed `req`, and stands up no Payload instance and no database. Three cases:

- **"denies an anonymous create"** - `createAccess({ req: { user: null } })` must be `false`. This is the AC-3 assertion.
- **"allows an authenticated create"** - `true` for both an admin and a writer, so the rule is pinned as denying anonymous callers rather than everyone.
- **"leaves the read, update and delete rules admin-only"** - all three rules asserted against `null`, writer and admin. `trusted` and `banned` have no field-level access (deliberately, see §6), so these three collection rules are the only other guard on the flags the moderation policy reads; the assertions exist so a later edit cannot loosen them unnoticed.

### `trusted` / `banned` field-level access - not added

Per the brief's constraint, no field-level `access` was added to either checkbox. With `create` closed and `update` already admin-only, no anonymous path can set either flag. Recorded in §6 rather than implemented.

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-3 | An anonymous `POST /api/commenters` is rejected | `Commenters.test.ts` "denies an anonymous create" - asserts `create` returns `false` for `req.user = null`; demonstrated failing on the pre-fix rule (§4). "allows an authenticated create" asserts `true` for admin and writer, so the rule denies anonymous rather than denying everyone | covered |

### Supporting assertions, beyond the criterion

- "leaves the read, update and delete rules admin-only" - this is the check that the create change did not widen or narrow its neighbours, and that the only guard on `trusted`/`banned` still holds for anonymous, writer and admin callers.
- The `Comments.beforeChange` suite (16 cases, Phase 2) still passes untouched, so the consumer of the `trusted` flag still derives status as before.

## 4. Before / after (P3.T2.2)

The same test file was executed twice: once against the pre-fix `Commenters.ts`, and once after the rule changed. Full pre-fix output is archived at `.conductor/evidence/phase-3-before.txt`.

The before run was taken on the working tree *before* the collection was edited - `git status --short` reported only the untracked new test file, so `src/collections/Commenters.ts` was byte-identical to its committed state. That state was then confirmed independently, without checking anything out, with `git show HEAD:src/collections/Commenters.ts`, which returns the pre-fix line `create: () => true, // Created automatically when guests comment`. This avoids the pitfall recorded in `verification/phase-2.md`: `git checkout -- <path>` yields the *committed* version, which after a commit is already fixed, so the run passes and proves nothing.

**Before the fix - `bun test src/collections/__tests__/Commenters.test.ts` → 2 pass, 1 fail, exit 1:**

```text
src\collections\__tests__\Commenters.test.ts:
21 | 	it("denies an anonymous create", async () => {
...
26 | 		expect(await createAccess({ req: { user: null } })).toBe(false);
                                                           ^
error: expect(received).toBe(expected)

Expected: false
Received: true

      at <anonymous> (C:\Users\Ansyar\Documents\Upskilling\Web Development\chasing-chapters\src\collections\__tests__\Commenters.test.ts:26:55)
(fail) Commenters collection create access > denies an anonymous create [0.57ms]

 2 pass
 1 fail
 12 expect() calls
Ran 3 tests across 1 file. [13.00ms]
```

**After the fix - 3 pass, 0 fail, 12 expect() calls, exit 0.**

### Which failure proves the defect

One of the three cases failed, and it failed for the right reason. `Expected: false, Received: true` is the defect itself: on the pre-fix code the rule is `() => true`, so a request carrying no user is accepted. That is direct evidence for AC-3, not an artifact of a rule that is missing rather than wrong - the callback existed and returned the permissive value.

The other two cases passed before the fix as well, and are recorded as such rather than presented as proof. "allows an authenticated create" passes either way (`() => true` admits everyone, including staff), and "leaves the read, update and delete rules admin-only" was already true and is a regression guard, not a demonstration of the bug. The single failure carries the weight.

## 5. Why the server action is unaffected (P3.T1.2)

Proven by reading the code path rather than asserted:

1. **The action passes no access override.** `src/app/actions/comments.ts` contains no `overrideAccess` anywhere - a search of `src/` returns eight occurrences, none of them in that file (they are the two explanatory comments in `Comments.ts` and `Reviews.ts`, the preview route, the review page, `retranslate.ts`, and the `retranslate` test's mock). The commenter find/create block at lines 73-114 therefore runs entirely on defaults.
2. **The Local API defaults the flag to true.** `node_modules/payload/dist/collections/operations/local/create.js:7` destructures `overrideAccess = true`, so the value reaching the operation is `true` unless a caller says otherwise.
3. **The operation skips the rule when the flag is set.** `node_modules/payload/dist/collections/operations/create.js:126` guards the check with `if (!overrideAccess) { await executeAccess(...) }`. With the default in place, `collectionConfig.access.create` is never invoked for the action's create.

The brief asked for this to be re-confirmed rather than taken from it, including that `comments.ts` still passes no `overrideAccess: false` on the commenters create - it does not, as of this phase. Phase 5 owns that file and may change it; if it ever does, this rule becomes load-bearing for guest commenting and AC-4 must be re-proven there.

### Other commenter write paths, checked

- `Comments.afterChange` (`src/collections/Comments.ts:145-152`) calls `payload.update` on `commenters` - an update, not a create, and a Local API call with the same default. Unaffected by the create rule.
- `src/scripts/migrate-emails.ts` reads and updates commenters through the Local API in a one-off script. Unaffected for the same reason.
- The only other `create` on this collection in the tree is the action's. There is no second anonymous path.

## 6. Evidence paths and commits

- `src/collections/Commenters.ts` - the `create` rule
- `src/collections/__tests__/Commenters.test.ts` - new file, three cases
- `.conductor/evidence/phase-3-before.txt` - archived pre-fix run (gitignored)
- This file
- Commit `0581500` - `fix(commenters): deny anonymous commenter creation`
- Commit `45e85f0` - `test(commenters): cover the commenter access rules`

## 7. Deviations

None. Both changed files are inside `Touches`.

## 8. Notes

- **What this does not prove.** That a real `POST /api/commenters` over REST returns 401/403. That needs a running Payload instance with a live session, which this project's harness does not provide for collection access rules - the e2e suite drives the admin UI, not the REST API. This is the same limitation Phases 1 and 2 recorded. The unit test proves the rule's behaviour and the write path it governs; the REST path is covered by construction, because Payload evaluates exactly this callback. If a future track adds authenticated REST coverage, AC-3 should be re-proven there.
- **What this does not prove, part two.** That `submitComment` still creates a commenter end to end now that `create` is closed. That is AC-4, which the plan assigns to Phase 5 (`P5.T4.5`), and the argument for it is in §5: the action never consults the rule. Recording it here so the gap is visible rather than implied covered.
- **No field-level access on `trusted` or `banned`, deliberately.** The brief forbade it and it remains out of scope. The reasoning is worth writing down because it is the kind of change a later reviewer will reach for: with `create` closed and `update` admin-only, no anonymous path reaches either flag, so a field rule would add nothing but blast radius. If a future change ever opens `update` to writers - which `Comments.ts`'s sibling rule does for comments - this reasoning expires and the field rules become necessary. That dependency is the thing to remember, not the rule.
- **The `afterChange` trust grant was not touched.** `Comments.afterChange` still sets `trusted: true` at three approved comments. Combined with Phase 2 (only an admin can approve), the flag now moves only on admin decisions or on an admin's own commenter edit - which is the intended consequence, but it does mean the automatic grant is now reachable only through admin action.
- **Both halves of the chain matter.** Phase 2 closed `POST /api/comments`; this phase closes `POST /api/commenters`. Either alone would have broken the documented exploit, but the spec keeps them separate because closing only the comment endpoint would still leave an attacker able to mint a trusted row and use it the moment any write path reopens. Both are now closed.
