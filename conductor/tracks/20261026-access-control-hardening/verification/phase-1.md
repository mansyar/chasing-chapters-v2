# Phase 1 verification - Author role escalation

- **Track:** 20261026-access-control-hardening
- **Phase:** 1 - Author role escalation
- **Date:** 2026-10-26
- **Branch:** fix/20261026-access-control-hardening
- **Base:** f47745cd5a94ad7f301c7204f0d55829d5768408
- **Head:** 6e014e4
- **Result:** verified

## 1. Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 253 files (583ms) |
| static | `bun run lint` | 0 | Checked 245 files, no fixes applied |
| unit | `bun test` | 0 | 690 pass, 0 fail, 1632 expect() calls, 50 files (28.83s) |
| unit | `bun test src/collections/__tests__/Authors.test.ts` | 0 | 8 pass, 0 fail, 13 expect() calls |
| combined | `bun run typecheck && bun run lint && bun test` | 0 | All three layers pass |

The unit total moved from 686 to 690: four new cases, none removed.

## 2. What changed

`src/collections/Authors.ts` - field-level `access.update` added to the `role` field:

```ts
access: {
	// A writer may update their own document so they can edit their
	// name, avatar and bio, which the collection rule above allows.
	// Only an admin may move an account between roles; for everyone
	// else Payload drops `role` from the write rather than rejecting
	// the whole update, so profile editing still succeeds.
	update: ({ req: { user } }) => user?.role === "admin",
},
```

The collection-level `update` rule is unchanged. It still permits `user?.id === id`, which is what lets a writer edit their own name, avatar and bio - that behaviour is correct and is the reason the fix belongs at field level rather than on the collection.

### Why dropping the field is safe for a `required: true` field

`role` is `required: true`. Dropping it from an update could in principle fail validation. It does not, and this was verified in Payload's own source rather than assumed:

- `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js:220-244` - when field-level access returns false, Payload runs `delete siblingData[field.name]`.
- The same block then computes `const isDocumentValueAllowed = operation === 'update' || accessResult;` and, because the field is now undefined, calls `getFallbackValue({ field, isDocumentValueAllowed, req, siblingDoc })`. On an update the stored document value is restored.

So a writer's profile edit lands with `role` restored from the stored document, and the attempted escalation is silently discarded. No validation error, no rejected request.

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| AC-1 | A writer's self-update setting `role: "admin"` leaves the stored role unchanged | `Authors.test.ts` "leaves a writer's self-update with role unchanged" - asserts the resulting write has no `role` key at all and equals `{ name, bio }`; "denies a writer the role field on their own document" asserts the rule returns `false` while the collection rule still returns `true` | covered |
| AC-2 | An admin updating another author's `role` succeeds | `Authors.test.ts` "lets an admin set another author's role" - asserts the rule returns `true` and the write carries `role: "admin"` | covered |

## 4. Before / after

The same test file was run against the pre-fix `Authors.ts` and the fixed one.

**Before the fix - `bun test src/collections/__tests__/Authors.test.ts` → 5 pass, 3 fail, exit 1:**

```
error: expect(received).not.toHaveProperty(path)
(fail) Authors role field access > leaves a writer's self-update with role unchanged [0.68ms]
```

This is the assertion that matters: on pre-fix code the writer's update write **contains** `role`, so the escalation succeeds.

```
error: expect(received).toBe(expected)
Expected: false
Received: undefined
```

```
error: expect(received).toBe(expected)
Expected: true
Received: undefined
```

**After the fix → 8 pass, 0 fail, exit 0.**

### An honest caveat about what the three failures prove

Only the middle failure demonstrates the vulnerability. The other two report `Received: undefined`, because before the fix `roleUpdateAccess()` finds no `access` property on the field and returns `undefined` rather than `false`. Those two therefore prove *that the configuration was added*, not that a writer is denied - a rule returning `undefined` and a rule returning `false` are indistinguishable to them.

The assertion that actually proves the defect and its closure is `expect(write).not.toHaveProperty("role")`, which is the one that failed with `not.toHaveProperty` before the fix and passes after. Recorded here rather than presented as three equally strong proofs.

## 5. Evidence paths and commits

- `src/collections/Authors.ts` - field-level access
- `src/collections/__tests__/Authors.test.ts` - four new cases in `describe("Authors role field access")`
- This file

The four existing `afterLogin` hook tests are unmodified and still pass.

## 6. Deviations

None. Both changed files are inside `Touches`.

## 7. Notes

- The test file imports the collection config directly and asserts on the access callback's behaviour, matching how the file already tests the `afterLogin` hook. It does not stand up Payload or a database. The `applyFieldAccess` helper mirrors Payload's documented behaviour for a denied field (drop from the write, restore from the stored document) and cites the source lines that establish it, so the test's model of Payload is auditable rather than asserted.
- **What this does not prove:** that a real `PATCH /api/authors/<id>` over REST is refused the field. That requires a running Payload instance and an authenticated writer session, which this project's harness does not provide for collection access rules - e2e specs drive the admin UI, not the REST API. The unit test proves the rule's behaviour and the write it produces; the REST path is covered by construction because Payload evaluates exactly this callback for every update. If a future track adds authenticated REST tests to the e2e harness, AC-1 should be re-proven there.
- `role` remains `required: true` with `defaultValue: "writer"`, asserted by "keeps the role field required with a writer default", so creates still require an explicit role and the default still applies.
## Primary verification

The phase subagent's session was interrupted by a host restart after it had written both files but before it committed or produced evidence. The primary inspected the uncommitted diff, verified its central claim against Payload's source rather than accepting it, ran the gate, and committed.

| Layer | Command | Exit | Summary |
|---|---|---|---|
| static | `bun run typecheck` | 0 | No type errors in 253 files (583.30ms) |
| static | `bun run lint` | 0 | Checked 245 files, no fixes applied |
| unit | `bun test` | 0 | 690 pass, 0 fail, 1632 expect() calls, 50 files (28.83s) |
| unit | `bun test src/collections/__tests__/Authors.test.ts` | 0 | 8 pass, 0 fail, 13 expect() calls |

The first lint run failed on formatting in `Authors.test.ts` (three expressions Biome wanted wrapped). Fixed with the project's own formatter; lint then passed with no further changes. No behavioural edit was made.

The primary reproduced the before/after record independently: the pre-fix `Authors.ts` was restored, the new tests run (5 pass, 3 fail, exit 1), and the fixed file put back. The caveat in section 4 - that only the `not.toHaveProperty` failure demonstrates the vulnerability, the other two reporting `undefined` because no field rule existed - was found by reading the actual failure output, not inferred.

**Result: verified.**

AC-1 and AC-2 are satisfied by direct test evidence. FR-1 is satisfied by the code. The four pre-existing `afterLogin` tests are untouched and passing. The limitation recorded in section 7 - that no authenticated REST request is exercised - stands as stated; it is a property of the project's harness, not of this fix.