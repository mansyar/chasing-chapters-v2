# Phase R4 - Review fixes (round 4: N1-N4)

- **Track:** `20261026-access-control-hardening`
- **Phase:** R4 - Review Fixes (Round 4)
- **Branch:** `fix/20261026-access-control-hardening`
- **Base:** `352a3cb` (the round 3 checkpoint)
- **Head:** `cfad32c`
- **Date:** 2026-10-26
- **Result:** verified

## 1. Result

**Verified.** The four Low findings raised by the round 4 delta re-review are
fixed. None of them was a live defect: two were documentation that overstated
what the code does, one was a test assertion that failed on behaviourally
identical code, and one was a wrong finding id in a comment.

The one change that touches behaviour is the F1/N2 documentation. The
implementation is unchanged from the round 3 checkpoint - the per-review bucket
is still checked before the aggregate - but the comment now says what that
ordering actually guarantees, in both directions.

This round was carried out by the primary rather than through a phase
subagent. The work is three files, no production behaviour change, and the
verification is a mutation matrix rather than a defect reproduction, so the
phase subagent's contribution would have been the same edits with a second
copy of the same evidence. The deviation is recorded in section 7.

## 2. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 258 files |
| static | `bun run lint` | 0 | Checked 250 files, no fixes applied |
| unit | `bun test` | 0 | 765 pass, 0 fail, 54 files |
| unit | `bun test src/app/actions/__tests__/comments.test.ts src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | 41 pass, 0 fail |

The unit count moved from 765 to 765: the round added no new test case. It
replaced assertions, and one of the two replaced assertions is now a *stronger*
claim - it accepts every behaviour-preserving rewrite that the previous
version rejected, while still rejecting the defect.

## 3. Findings

### N1 - The id-count derivation was still not exact

- **File:** `src/app/actions/comments.ts:100-102`
- **What:** The round 3 comment claimed "one review id can contribute at most
  120 of them - it has to have named at least ten distinct review ids to get
  there". Each rate-limit window is anchored at that key's own first increment
  (`src/lib/rate-limit.ts:47-48` sets `EXPIRE` only when `current === 1`), so
  a per-review key first seen mid-aggregate-window can have two of its windows
  overlap one aggregate window and contribute up to ~240.
- **Why:** The bound itself is unaffected - the aggregate still caps a sweep at
  1200 calls per window - but the stated floor for the ratio was 2x
  optimistic, and that sentence is the derivation for the next size.
- **Fix:** Make the claim window-exact.
- **Resolution:** The comment now states that the id count is approximate
  because a per-review window is anchored at its own first call, that in
  ordinary use - where reviews are visited at the pace a reader visits them -
  ten or more distinct ids are needed, and that a caller deliberately
  misaligning windows can get there with about five. It also states the case
  that matters for a reader: ordinary browsing on one review never meets the
  aggregate ceiling either way.

### N2 - The mirror of F5 was not stated

- **File:** `src/app/actions/comments.ts:454-473`
- **What:** Because the per-review increment runs before the aggregate check,
  every call the aggregate refuses has already incremented - and for a review
  id not yet seen, created - that review's per-review counter. Previously an
  exhausted aggregate returned at the first check and spent nothing.
- **Why:** Bounded, and it does not restore F5's harm, but it is a real
  behaviour delta: an address out of aggregate budget that keeps retrying one
  review pushes that review's own counter past 120, so the review can still be
  refused after the aggregate window resets.
- **Fix:** Record it in the doc block, or peek before consuming so the
  aggregate is read without incrementing when it is already exhausted.
- **Resolution:** Documented. The doc block now states that a call the
  aggregate refuses has already spent its per-review bucket, that it is bounded
  to at most one window of extra refusals on that one review for an address
  that keeps retrying while out of aggregate budget, and that it does not
  restore the harm the ordering removed.

  The behaviour is unchanged and deliberate: the alternative - reading the
  aggregate without incrementing it - needs a "peek" the rate limiter does not
  offer, and adding one to `src/lib/rate-limit.ts` for a bounded, documented
  cost would be a wider change than the finding asks for.

### N3 - The new retained-array assertion was brittle in the same direction F6 was raised about

- **File:** `src/components/comments/__tests__/comment-fetch-state.test.ts:317-336`
- **What:** The assertion failed on behaviourally identical code.
  `comments={state.comments ?? []}` and `comments={comments || []}` both failed
  the `not.toContain("[]")` check, and `comments={rows}` with
  `const rows = state.comments` failed the literal-equality check.
- **Why:** A component edit with no behaviour change failed the suite - the
  exact class of false failure F6 was fixed to remove, reintroduced by the
  assertion added in the same fix.
- **Fix:** Resolve the prop through an alias map rather than literal equality,
  and narrow the empty-array rejection to a bare `[]` literal.
- **Resolution:** Three changes to the test's helpers. The prop value is read
  by scanning to the brace that closes *that* prop rather than the first one,
  using the next `name=` or the tag's own `/>` as the terminator. A redundant
  `?? []` / `|| []` fallback is stripped before comparison. The empty-array
  rejection is anchored to a bare `[]` literal, and the value is accepted when
  it names an alias that provably holds `state.comments` - resolved from
  `const { comments } = state`, `const { comments: rows } = state` and
  `const rows = state.comments`.

### N4 - A test comment cited the wrong finding id

- **File:** `src/app/actions/__tests__/comments.test.ts:690`
- **What:** The new case's comment cited `F1`, which is round 1's finding (the
  writer-minted trusted commenter). The round 3 finding is recorded as F5.
- **Why:** The citation is the only pointer from the regression test back to
  the finding it guards, and it resolved to an unrelated defect.
- **Fix:** Change the citation to `F5` and check the other references.
- **Resolution:** The citation now reads `F5`. The other references in the
  suite cite `D1` and `D2`, which are unique and unaffected - a grep for every
  finding id across the two suites found no other stale pointer.

## 4. Before / after

N1, N2 and N4 are documentation and comment changes, so they have no test that
fails before the fix - the defect was that the text said something false, and
the only assertion available is that the text now says something true. That is
stated here rather than dressed up as a reproduction.

N3 is a test-quality defect, and its reproduction is a mutation matrix rather
than a revert: the question is not "does the old test fail on the old code"
but "does the new test reject the defect and accept everything that is not the
defect". Each row is a one-line edit to the component, applied to the real
file, with the component restored afterwards.

| Mutation to `CommentSection.tsx` | Behaviour | Old assertion | New assertion |
| --- | --- | --- | --- |
| none (baseline) | correct | pass | pass |
| `comments={state.comments ?? []}` | correct | **fail** | pass |
| `comments={state.comments \|\| []}` | correct | **fail** | pass |
| `const rows = state.comments` + `comments={rows}` | correct | **fail** | pass |
| `const { comments: rows } = state` + `comments={rows}` | correct | **fail** | pass |
| `comments={state.comments}` | correct | **fail** | pass |
| `comments={[]}` | **the defect** | pass | **fail** |

Seven mutations, six of which are behaviour-preserving. The old assertion
rejected five of them and accepted the defect. The new one accepts all six
correct forms and rejects the defect.

The old assertion's `comments={state.comments}` row is worth noting: it
rejected even the simplest correct form, because the literal-equality check
compared against the identifier `comments` while the component's destructured
state variable is also named `comments` - which the check could not see from
outside the branch.

## 5. The rate-limit ordering, restated

The final state of the two limits, for the record:

| Key | Ceiling | Window | Bounds | Checked |
| --- | --- | --- | --- | --- |
| `comments:${ip}:${reviewId}` | 120 | 60s | Burst on one review | **First** |
| `comments:${ip}` | 1200 | 60s | Breadth across the catalogue | Second |

The ordering is what makes F5's fix work: a call the per-review bucket refuses
returns before the aggregate is touched, so one address cannot spend the
address-wide budget on a single review. A sweep across many review ids passes
each per-review bucket trivially, so it still fills the aggregate - which is
what the aggregate is for.

The 1200 figure is ten times the per-review ceiling in force. It is a
judgement, not a measurement: there is no traffic data behind it. The comment
in the source says how to re-derive it if the per-review ceiling moves.

## 6. Files changed and commits

| File | Change |
| --- | --- |
| `src/app/actions/comments.ts` | The aggregate-ceiling derivation restated (N1); the mirror case documented (N2). No behaviour change. |
| `src/app/actions/__tests__/comments.test.ts` | The finding id in the new case's comment corrected (N4). |
| `src/components/comments/__tests__/comment-fetch-state.test.ts` | The prop-value reader, the alias resolver and the empty-array check rewritten so the assertion accepts every behaviour-preserving form and rejects only the defect (N3). |

| Commit | Subject |
| --- | --- |
| `cfad32c` | `test(comments): make the rate-limit and render assertions exact` |

## 7. Deviations

- **The round was carried out by the primary, not by a phase subagent.** The
  work is three files, no production behaviour change, and the verification is
  a mutation matrix rather than a defect reproduction. A phase subagent would
  have produced the same edits and a second copy of this evidence. The
  primary's own checks - the gate, the mutation matrix and the review of the
  diff - are recorded above.

## 8. Notes - what is not proven

- **The mutation matrix was run by hand against the real component file**, and
  the component was restored from a copy afterwards. The final tree's
  `git status` is clean and `git diff` against the round 3 checkpoint shows
  only the three files above, so the mutations left nothing behind.
- **The alias resolver is a source-text heuristic.** It recognises three
  specific forms of naming `state.comments`. A component that reached the rows
  through some fourth form would fail the assertion - a false failure, not a
  missed defect, and the failure message points at the branch. That is the
  trade the project has already accepted with the rest of its source-level
  assertions, and it is named as a residual in `review.md`.
- **The rate limiter is still mocked in unit tests.** The increment-then-compare
  behaviour N1 and N2 depend on is read from `src/lib/rate-limit.ts` and
  modelled in the mock, not exercised against Redis.
- **No e2e ran for this round.** The phase's verification command does not
  include it, and the changes are a comment, a citation and a test's
  assertion-resolution - none of which a browser observes. The e2e layer was
  run against the final tree as part of the integrated verification, and the
  count was unchanged at 112, which is the point: nothing that used to work
  stopped working.
- **The 1200 ceiling remains a judgement, not a measurement**, and the bound
  still fails open when Redis is unreachable, as every limit in this codebase
  does. Both are recorded in `review.md` and in `integrated.md` section 9.
