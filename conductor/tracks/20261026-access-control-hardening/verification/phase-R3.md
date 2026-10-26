# Phase R3 - Review fixes (round 3: F1, F2)

## 1. Result

**`verified`.**

Two Low findings from the round 3 delta re-review are resolved.

**F1** - the aggregate rate-limit ceiling's justification was false as written. The
code comment claimed that because one review id can contribute at most 120 of the
aggregate's 1200 calls, reaching the aggregate required naming at least ten
distinct review ids. `rateLimit` in `src/lib/rate-limit.ts` increments the
counter and only then compares it against the limit, so a refused call still
spends the counter of whichever bucket was checked first, and R2 checked the
aggregate first. A client hammering a single review could therefore spend the
whole address-wide budget on its own and was then refused comment reads on
*every* review, for everyone behind that address - the shared-bucket harm the
per-review key exists to remove, reintroduced through the
increment-before-compare behaviour. The fix is the reordering rather than the
reword: `getApprovedComments` now checks the per-review bucket
(`comments:${ip}:${reviewId}`, 120/60s) first and the aggregate bucket
(`comments:${ip}`, 1200/60s) second, so a call the per-review bucket refuses
returns without incrementing the address-wide counter at all. The doc block now
states the property the code actually has, and explains why the order is
load-bearing rather than incidental.

**F2** - the two negative `isLoading?`/`hasError?` assertions scanned the whole
component file, so an unrelated ternary anywhere in it failed the test with no
behaviour change; and the source-level technique could not see inside a branch,
so a component that kept the four render branches but handed the list an empty
array would still pass every case. The two negative assertions are now scoped to
the comments-list region of the component (the `renderMode` branches and the
list), while the `selectCommentsRender(state)` assertion stays file-wide because
it is about the component asking the selector at all. A new case asserts that
the list receives the state's rows - the ones `applyCommentsResult` keeps on a
failed refresh - rather than an empty array.

The per-review ceiling (120/60s), the aggregate ceiling (1200/60s) and
`MAX_COMMENTS_PER_REVIEW` (100) are all unchanged, as are `submitComment`,
`reportComment`, `toggleLikeReview` and every collection rule.

## 2. Commands

| Command | Exit | Summary |
| --- | --- | --- |
| `bun test src/app/actions/__tests__/comments.test.ts src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | 41 pass / 0 fail - the two touched test files after the fix. |
| `bun run typecheck` | 0 | `bun check` - no type errors in 258 files. |
| `bun run lint` | 1 (first run) | Biome flagged one formatting difference in `comments.test.ts` (a `toHaveBeenCalledWith` call that had to be wrapped). Fixed by hand; re-run below exits 0. |
| `bun run lint` | 0 | Biome checked 250 files, no fixes applied, no errors. |
| `bun test` | 0 | 765 pass / 0 fail / 3213 expect() calls across 54 files. The console noise is other suites' intentional error-path output (Redis down, translation API failures) - not failures. |
| `bun run typecheck && bun run lint && bun test` | 0 | The phase verification command, exactly as written. 765 pass / 0 fail. |
| `git checkout ba8ff04... -- src/app/actions/comments.ts` + `bun test src/app/actions/__tests__/comments.test.ts` | 1 | Before/after for F1 - the pre-fix action fails 3 of the 26 cases. Output in section 4. |
| `git checkout 8a3d0ed... -- src/app/actions/comments.ts` + `bun test src/app/actions/__tests__/comments.test.ts` | 0 | After the fix - 26 pass / 0 fail. |
| `git checkout ba8ff04... -- src/components/comments/__tests__/comment-fetch-state.test.ts` + `bun test src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | Before/after for F2 - the pre-fix test file passes 14/14, i.e. it did not detect either defect. |
| `git checkout 8a3d0ed... -- src/components/comments/__tests__/comment-fetch-state.test.ts` + `bun test src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | After the fix - 15 pass / 0 fail. |

The before/after runs used `git checkout <sha> -- <path>` as the brief
instructs, never `git checkout -- <path>`. After each run the file was
restored from the fixed commit and `git status --porcelain` was confirmed
empty, so the index was never left holding the old version. One
`git restore --staged` attempt was denied by the sandbox; it turned out to be
unnecessary, because checking a path out of a commit that is already `HEAD`
leaves the index and the working tree matching `HEAD` (confirmed by an empty
`git status --porcelain`).

## 3. Findings

### F1 - the aggregate ceiling's justification was false as written

- **What the defect was.** `getApprovedComments` checked the aggregate bucket
  (`comments:${ip}`, 1200/60s) before the per-review bucket
  (`comments:${ip}:${reviewId}`, 120/60s). `rateLimit` increments and then
  compares, so a call the per-review bucket was about to refuse had already
  spent the address-wide counter. A single review id could therefore exhaust
  the whole aggregate budget, and the address was then refused comment reads
  on every review - the shared-bucket harm the per-review key exists to
  remove. The code comment's "at least ten distinct review ids" claim was
  false as written.
- **What changed.** The two checks were swapped, so the per-review bucket is
  consulted first and a call it refuses returns before the aggregate counter
  is touched. The doc block was rewritten to state the property the code now
  has (the aggregate counter only advances for calls a per-review bucket
  allowed, so one review id contributes at most 120 of them) and to say why
  the order is load-bearing. The `comments` doc block now also says the
  aggregate bucket is "checked second" rather than "checked first".
- **The assertion that would fail if this change were reverted.**
  `src/app/actions/__tests__/comments.test.ts`, `getApprovedComments > "does
  not spend the address-wide budget on a call the per-review bucket refuses"`:
  `expect(counts.get(AGGREGATE_KEY)).toBe(120)` after 121 calls, where 121 is
  the call the per-review bucket refused. With the old order the aggregate
  counter is 121, and the assertion fails. The same test's final pair -
  `expect(other.success).toBe(true)` for a *different* review id and
  `expect(counts.get(AGGREGATE_KEY)).toBe(121)` - is the property that
  matters: another review is still readable from the same address.
  A second, independent case, `getApprovedComments > "checks the per-review
  bucket before the aggregate one"`, asserts
  `expect(rateLimitSpy).toHaveBeenCalledTimes(1)` and
  `expect(rateLimitSpy).toHaveBeenCalledWith("comments:203.0.113.5:7", 120,
  60)` - with the old order the aggregate is called first and the spy is
  called twice.

### F2 - the source-level assertions were brittle in both directions

- **What the defect was.** (1) `expect(/\bisLoading\s*\?/.test(source))` and
  its `hasError` twin scanned the whole component file, so a future unrelated
  ternary anywhere in it failed the test with no behaviour change. (2) A
  source-level assertion cannot see inside a branch: a component that kept the
  four branches but passed `comments={[]}` in the list-with-error branch
  passed all four cases, so the retained array was still not proven to reach
  the screen - the very defect `D2` was.
- **What changed.** The two negative assertions are now scoped to
  `commentsListRegion(source)`, the slice of the component from the
  `{/* Comments List */}` marker to the end of the section, which holds the
  four render branches and the list but not the heading or the form. The
  `selectCommentsRender(state)` assertion stays file-wide. A fifth case, "passes
  the retained rows to the list in the list-with-error branch", asserts that
  the `<CommentList>` element in that region is guarded by
  `renderMode === "list-with-error"`, that its `comments` prop is present and
  is not an empty literal, and that the value it names is the state's comments
  (`state.comments`, or `comments` where the component destructures it from
  `state`).
- **The assertion that would fail if this change were reverted.** (1) The
  scoped case: `expect(/\bisLoading\s*\?/.test(region)).toBe(false)` in
  `CommentSection render branches > "takes its render mode from the selector"`.
  Reverted to the file-wide scan, an unrelated `state.isLoading ?` ternary in
  the heading fails the test - demonstrated in section 4. (2) The new case:
  `expect(value).not.toContain("[]")` in `CommentSection render branches >
  "passes the retained rows to the list in the list-with-error branch"`.
  Reverting the component to `comments={[]}` fails it - demonstrated in
  section 4. Reverting the *test* (using the pre-fix test file) leaves the
  defect undetected, which is the point.

## 4. Before / after

### F1 - pre-fix action against the new tests

```
git checkout ba8ff04de474fb0c92c47add651aa47f1404e9a1 -- src/app/actions/comments.ts
bun test src/app/actions/__tests__/comments.test.ts
```

```
src\app\actions\__tests__\comments.test.ts:
685 |    expect(counts.get(`${AGGREGATE_KEY}:${aggregateLimit + 1}`)).toBe(1);
      |                                                                     ^
error: expect(received).toBe(expected)

Expected: 1
Received: undefined

      at <anonymous> (...comments.test.ts:685:64)
(fail) getApprovedComments > caps one address across many review ids, not only per review [3.93ms]
...
728 |    expect(counts.get(AGGREGATE_KEY)).toBe(120);
      |                          ^
error: expect(received).toBe(expected)

Expected: 120
Received: 121

      at <anonymous> (...comments.test.ts:728:37)
(fail) getApprovedComments > does not spend the address-wide budget on a call the per-review bucket refuses [0.86ms]
...
752 |    expect(rateLimitSpy).toHaveBeenCalledTimes(1);
      |                            ^
error: expect(received).toHaveBeenCalledTimes(expected)

Expected number of calls: 1
Received number of calls: 2

      at <anonymous> (...comments.test.ts:752:24)
(fail) getApprovedComments > checks the per-review bucket before the aggregate one [0.37ms]

 23 pass
 3 fail
 1436 expect() calls
Ran 26 tests across 1 file. [105.00ms]

Exited with code 1
```

The middle failure is the heart of F1: with the aggregate checked first, the
121st call - refused by the per-review bucket - had already spent the
address-wide counter, so the aggregate reads 121 rather than 120.

### F1 - after the fix

```
git checkout 8a3d0ed7f7c64b2568e00622aa3799986df3d624 -- src/app/actions/comments.ts
bun test src/app/actions/__tests__/comments.test.ts
```

```
 26 pass
 0 fail
```

### F2 - the pre-fix test file does not detect either defect

```
git checkout ba8ff04de474fb0c92c47add651aa47f1404e9a1 -- src/components/comments/__tests__/comment-fetch-state.test.ts
bun test src/components/comments/__tests__/comment-fetch-state.test.ts
```

```
 14 pass
 0 fail
 26 expect() calls
Ran 14 tests across 1 file. [27.00ms]
```

### F2 - brittleness in direction one (an unrelated edit trips the old test)

With `const headingSuffix = state.isLoading ? "…" : "";` added to the
component (outside the comments-list region, no behaviour change) and the
pre-fix test file in place:

```
192 |    expect(/\bisLoading\s*\?/.test(source)).toBe(false);
      |                                ^
error: expect(received).toBe(expected)

Expected: false
Received: true

      at <anonymous> (...comment-fetch-state.test.ts:192:43)
(fail) CommentSection render branches > takes its render mode from the selector [0.69ms]

 13 pass
 1 fail
```

With the same component edit and the **new** test file in place:

```
 15 pass
 0 fail
 33 expect() calls
Ran 15 tests across 1 file. [30.00ms]
```

### F2 - brittleness in direction two (the retained array is not proven)

With the component changed to pass an empty array - `comments={[]}` instead of
`comments={comments}` on the `<CommentList>` element, keeping all four render
branches - and the pre-fix test file in place:

```
 14 pass
 0 fail
 26 expect() calls
Ran 14 tests across 1 file. [12.00ms]
```

The defect goes undetected. With the **new** test file in place, the same
component change:

```
318 |    // handed `[]` renders "no comments yet", so the retained rows would
319 |    // never reach the screen.
320 |    expect(values.length).toBeGreaterThan(0);
321 |    for (const value of values) {
322 |      expect(value).not.toBe("");
323 |      expect(value).not.toContain("[]");
      |                              ^
error: expect(received).not.toContain(expected)

Expected to not contain: "[]"
Received: "[]"

      at <anonymous> (...comment-fetch-state.test.ts:323:22)
(fail) CommentSection render branches > passes the retained rows to the list in the list-with-error branch [0.51ms]

 14 pass
 1 fail
 32 expect() calls
Ran 15 tests across 1 file. [29.00ms]

Exited with code 1
```

The component was restored from the fixed commit afterwards;
`git status --porcelain` is empty.

## 5. Files changed and commits

| File | Change |
| --- | --- |
| `src/app/actions/comments.ts` | The per-review bucket is checked before the aggregate one; the `COMMENT_FETCH_LIMIT` / `COMMENT_FETCH_AGGREGATE_LIMIT` doc block is corrected. |
| `src/app/actions/__tests__/comments.test.ts` | The aggregate-first case became the per-review-first case; the sweep case's aggregate assertion was updated for the new order; a new case proves a per-review refusal does not spend the address-wide budget. |
| `src/components/comments/__tests__/comment-fetch-state.test.ts` | The two negative assertions are scoped to the comments-list region; a new case asserts the list receives the retained rows. |

| Commit | Subject |
| --- | --- |
| `34f83938e7dd1f1b899b8e8c09242482a72173b5` | `fix(comments): check the per-review rate limit before the aggregate one` |
| `8a3d0ed7f7c64b2568e00622aa3799986df3d624` | `test(comments): scope the render assertions and cover the retained rows` |

Both hashes are copied verbatim from `git log --format=%H`. The evidence file
itself is committed as a third commit.

No file outside the phase's `Touches` was modified. `src/components/comments/CommentSection.tsx`
was edited only transiently, to produce the before/after failures in section 4,
and was restored from the fixed commit afterwards; it is byte-identical to
`ba8ff04` in the final tree.

## 6. Deviations

None. Every changed file is in the phase's `Touches`
(`src/app/actions/comments.ts`,
`src/app/actions/__tests__/comments.test.ts`,
`src/components/comments/__tests__/comment-fetch-state.test.ts`), plus this
evidence file.

Two things worth recording, neither a deviation from the plan:

- `git restore --staged <path>` was denied by the sandbox on the one attempt.
  It was not needed: checking a path out of a commit that is already `HEAD`
  leaves the index and the working tree matching `HEAD`, which
  `git status --porcelain` confirmed (empty output). The index was never left
  holding the pre-fix version.
- The `bun run lint` failure on the first run was a Biome formatting
  difference in one line of the new test, not a logic error. It was corrected
  by hand and the verification command re-run to exit 0.

## 7. Notes - what is not proven

This section is not optional, and the honest answer is that both fixes are
proven at a narrower level than the wording of the findings might suggest.

**The rate limiter is mocked, so the increment-before-compare behaviour is
modelled, not exercised.** `src/app/actions/__tests__/comments.test.ts`
replaces `rateLimit` with a counting mock that increments a per-key counter
and then compares it against the limit - the same shape as the real
`src/lib/rate-limit.ts`. The new F1 test proves that the *action* no longer
spends the address-wide counter on a call the per-review bucket refuses. It
does not prove the real Redis-backed limiter behaves that way, only that the
action's call order and early return are what the fix intends. The real
limiter's own increment-before-compare behaviour is unchanged by this phase and
is covered separately by `src/lib/__tests__/rate-limit.test.ts`.

**The ordering fix does not make the aggregate bucket a pure "sweep" counter
in the strict sense.** With the per-review bucket first, a caller that sweeps
1200 *distinct* review ids spends 1200 per-review increments and 1200
aggregate increments - the sweep is still capped, which is what R3.T1.2
required, and the test proves it. But a caller that hammers one review id 120
times and then moves to a second one spends 120 aggregate increments, not 1200:
the aggregate is now bounded by "calls a per-review bucket allowed", which is
what the doc block says. The "at least ten distinct review ids" claim survives
the reordering, and is now true for the first time rather than false as
written - but the 1200 figure remains a judgement, not a measurement, and this
phase did not change it.

**The source-level technique still checks source text, not a rendered tree.**
There is no React test harness in this project (no `@testing-library`,
`react-test-renderer`, `jsdom` or `happy-dom`, and no `.test.tsx` anywhere), so
`src/components/comments/__tests__/comment-fetch-state.test.ts` asserts on the
component's text. The new R3.T2.2 case establishes that the `<CommentList>`
element in the list-with-error branch is handed the state's rows rather than
an empty array. What it does **not** establish is that those rows are
actually painted: a component could pass the right array to `<CommentList>` and
`<CommentList>` could still render nothing. Establishing that needs a render
harness, which is out of scope for this phase.

**The F2 assertions are scoped by source markers, so they are sensitive to
those markers.** `commentsListRegion` finds the region by the
`{/* Comments List */}` comment and the closing `</section>`. If the component
is restructured so those markers move or disappear, the helper returns an
empty string and the test fails with "expected region to be non-empty" rather
than silently passing. That is the intended failure direction, but it does mean
a refactor of the component's comments will require the test to be updated.
The scoping also means the two negative assertions no longer cover the
heading or the form: a ternary on `isLoading` in the heading would now pass.
That is deliberate - it is the brittleness F2 asked to remove - but it means
the file-wide guarantee is gone.

**The aggregate bound fails open when Redis is down**, as every limit in this
codebase does (`rateLimit` returns `success: true` when the client is
unavailable or the command throws). This phase did not change that behaviour
and the F1 fix does not affect it, but it remains true that with Redis down
neither bucket bounds anything.

**The e2e suite was not re-run.** The phase verification command is
`bun run typecheck && bun run lint && bun test`, and that is what ran, to exit
0. The e2e layer is not part of this phase's verification command, and the
changes here are a server-action call order and unit-level source
assertions - neither of which the existing e2e suite exercises. The R2
evidence already records that no e2e case drives a failed comment refresh, so
there is no e2e coverage to lose here either.

**`plan.md` was not updated.** It is Conductor state owned by the primary
agent, and the brief forbids editing it.
