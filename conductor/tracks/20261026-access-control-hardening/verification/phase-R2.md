# Phase R2 — Review fixes (round 2: D1–D3)

- **Track:** `20261026-access-control-hardening`
- **Branch:** `fix/20261026-access-control-hardening`
- **Phase base:** `10b1d8eb2456db8abf617160fc1a9b25fb252440`
- **Head at this evidence:** `b88b377ca7c1dc2985070e46ef04a95f98812611`
- **Date:** 2026-10-26

---

## 1. Result

**Verified.** All three round-2 findings are resolved, and the phase state is
recorded honestly: the phase verification command — which includes the e2e
suite — exits 0 on the committed tree.

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| D1 | Medium | The fetch rate limit lost its aggregate bound when R1 keyed it per review | Fixed |
| D2 | Medium | The comment-fetch state module documents and tests a retention behaviour the component does not render | Fixed |
| D3 | Low | Phase R1 was recorded `verified` while `bun run test:e2e` never ran | Fixed |

`D1` and `D2` are closed by code and by assertions that fail if the fix is
reverted (§3, §4). `D3` is closed by this phase running the e2e suite (§2) and
by the evidence recording exactly what did and did not run (§9). `plan.md` is
the primary's to write; this phase does not touch it.

---

## 2. Commands

Services for the e2e layer were started with `docker compose up -d` (Redis and
PostgreSQL were already running).

| # | Command | Exit | Summary |
| --- | --- | --- | --- |
| 1 | `docker compose up -d` | 0 | `chasing-chapters-redis-1 Running`, `chasing-chapters-postgres-1 Running` |
| 2 | `bun run typecheck` | 0 | `✓ No type errors in 258 files` |
| 3 | `bun run lint` | 0 | `Checked 250 files in 172ms. No fixes applied.` |
| 4 | `bun test` | 0 | 763 pass, 0 fail, 3081 expect() calls, 54 files |
| 5 | `bun run test:e2e` | 0 | `Running 112 tests using 3 workers` → `112 passed (1.9m)`; `[e2e] The suite finished.` |
| 6 | `bun run typecheck && bun run lint && bun test && bun run test:e2e` (the phase verification command, run as one line) | 0 | All four layers pass in sequence; e2e included and green |

Per-task runs during the phase:

| Command | Exit | Summary |
| --- | --- | --- |
| `bun test src/app/actions/__tests__/comments.test.ts src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | 39 pass, 0 fail, 1342 expect() calls |
| `bun test src/components/comments/__tests__/comment-fetch-state.test.ts` | 0 | 14 pass, 0 fail |

The e2e layer is the one `D3` is about, so it is recorded in full: the
production build succeeded (`⚠ Compiled with warnings in 45s`, the only warning
being the pre-existing `google-gax` module-not-found from `src/lib/translate.ts`),
27/27 static pages generated, and the Playwright suite reported
`112 passed (1.9m)` with 0 failed and 0 flaky. The three comment e2e specs
(`should display comment form`, `should show validation error for empty fields`,
`should submit comment successfully`, `should display comments section container`)
and `review-detail.spec.ts` › `should display comment section` all passed, so the
comment fetch path the R2 change touches still serves a reader correctly.

---

## 3. Findings

### D1 — the fetch rate limit lost its aggregate bound

**What was wrong.** R1 changed the fetch key from `comments:${ip}` to
`comments:${ip}:${reviewId}` to stop every reader behind one NAT sharing a
bucket. That fixed the shared-bucket problem and removed the catalogue-wide
cap in the same stroke: the per-review key bounds how often *one review id*
can be asked for, so one address could make 120 requests **per review id** per
minute and no ceiling would ever fire. Breadth was unbounded again — the
defect `FR-8` exists to close.

**What was done.** The per-review bucket stays, and a second, aggregate
per-address bucket is added and checked **first**:

- `comments:${ip}:${reviewId}` — per-review, 120 per 60 s (unchanged)
- `comments:${ip}` — aggregate, 1200 per 60 s, checked first

Both bounds are stated in the code comment, and the comment now says
explicitly which bound each key provides and that the aggregate key is the one
that makes the action useless for enumerating the catalogue.

**The assertion that would fail if reverted** —
`getApprovedComments > caps one address across many review ids, not only per review`
(`src/app/actions/__tests__/comments.test.ts`): it drives
`aggregateLimit + 1` calls, each naming a **different** review id, and asserts
the last one is refused with `Too many requests`, that the aggregate counter
reads `aggregateLimit + 1`, that the refused call's per-review key was never
touched (`undefined`), and that `payload.find` ran exactly `aggregateLimit`
times. Without the aggregate bucket, every one of those calls lands in its own
per-review bucket and all of them succeed — the sweep is never refused.

**Also** — `getApprovedComments > checks the aggregate bucket before the
per-review one`: with the aggregate key refusing, the action must make exactly
one `rateLimit` call — the aggregate — and must not read from the database.
Ordering matters: a sweep that has filled only the aggregate must not spend a
per-review slot before it is refused.

**Also** — `getApprovedComments > keys the rate limit on the client address and
the review` still asserts the per-review key `("comments:203.0.113.5:1", 120,
60)`, and `gives each review its own bucket from the same address` still
asserts two review ids get two distinct per-review buckets. Both were
rewritten to assert by **key** rather than by call position, because the
aggregate call now precedes the per-review call and the call indices moved.

### D2 — the retention contract was not real

**What was wrong.** `comment-fetch-state.ts` documented that a failed refresh
keeps the comments already on screen, and `comment-fetch-state.test.ts`
asserted that state. But `CommentSection.tsx` rendered
`isLoading ? … : hasError ? <error block> : <CommentList comments={comments} />`,
so the retained comments were never rendered: the `hasError` branch replaced
the list. R1's evidence contradicted itself on this.

**What was done.** The three layers are reconciled to one behaviour:

- The **module doc** now describes the two failure situations separately — an
  initial load that failed (nothing to fall back to → the error block) and a
  refresh that failed while rows were on screen (the rows are kept, the
  failure is reported in a banner above them).
- A **pure selector** `selectCommentsRender(state)` returns
  `"loading" | "error" | "list-with-error" | "list"`. It is the single place
  the decision is made, and it is testable without a component harness — the
  project has no React test harness, which is why the state lives outside the
  component in the first place.
- The **component** now renders four branches from that selector: the loading
  text, the `role="alert"` error block (`commentsLoadError`) for `"error"`, an
  amber `role="status"` banner (`commentsRefreshError`) for `"list-with-error"`,
  and `<CommentList … />` for `"list"` and `"list-with-error"` — so the
  retained rows are on screen in the refresh-failure case.

A new dictionary string `commentsRefreshError` was added to **both** `en` and
`id` ("The comments could not be refreshed. Showing the ones we already had." /
"Komentar tidak dapat diperbarui. Menampilkan komentar yang sudah ada."). `id`
is typed as `Record<DictionaryKey, string>` over `keyof typeof en`, so
`bun run typecheck` fails if either locale is missing the key.

**The assertions that would fail if reverted** — in
`src/components/comments/__tests__/comment-fetch-state.test.ts`:

- `selectCommentsRender > renders the retained list with a banner when a
  refresh fails` — a failed refresh over a loaded list must yield
  `"list-with-error"`, and the rows must still be `[aComment]`.
- `selectCommentsRender > renders the error block when the initial load fails`
  — a failed initial load must yield `"error"`.
- `selectCommentsRender > renders the loading branch before the first fetch
  settles` and the two success cases must yield `"loading"` and `"list"`.

**And the component half** — `CommentSection render branches` (four cases).
This is the part that was missing in R1: the state test passed while the
component rendered the error block instead of the rows, because nothing
asserted that the component *consumed* the state. With no React harness
available, the wiring is asserted at the source level — the same technique the
repo already uses in `src/lib/i18n/__tests__/dictionary-source.test.ts` and
`src/migrations/__tests__/destructive-markers.test.ts`:

- `takes its render mode from the selector` — the component must not branch on
  `isLoading`/`hasError` itself any more, and must call
  `selectCommentsRender(state)`.
- `renders the comment list in the list-with-error branch` — the guard around
  `<CommentList` must mention both `"list"` and `"list-with-error"`.
- `shows the error block only in the error branch` — the guard around
  `commentsLoadError` must be `"error"` and must not mention
  `"list-with-error"`.
- `shows the refresh banner in the list-with-error branch` — the guard around
  `commentsRefreshError` must be `"list-with-error"`.

Reverting `CommentSection.tsx` alone (keeping the new state module) fails all
four — see §4.

The five pre-existing `comment-fetch-state.test.ts` cases are **kept
unchanged**. None of them encoded the changed behaviour, so none needed
rewriting: they assert on the state transitions, which did not change. The
retention they document is now actually rendered.

### D3 — the phase state overstated what ran

**What was wrong.** Phase R1 was recorded `Status: verified` while
`bun run test:e2e` never ran. `workflow.md` requires e2e "when the phase
touches user-facing flows", and R1's F2 changed a user-visible branch. The
R1 evidence was honest in §7 ("no e2e run was performed for this phase") but
the recorded state was not.

**What was done.** This phase runs the e2e suite as part of its verification
command, and the result is recorded in §2 above: 112 passed, 0 failed, 0
flaky, on the committed tree. The phase's own state is what the primary
records in `plan.md`; this phase does not edit it, but it now has a real e2e
result to record rather than a skipped one.

---

## 4. Before / after

Both reproductions ran from the phase base `10b1d8e` and were restored with
`git checkout HEAD -- <path>` followed by `git restore --staged <path>`, so
the index was clean between steps (`git status --porcelain` empty).

### D1 — `src/app/actions/comments.ts` reverted to `10b1d8e`

```
$ git checkout 10b1d8e -- src/app/actions/comments.ts
$ bun test src/app/actions/__tests__/comments.test.ts

657 | 		const aggregateLimit = limits.get("aggregate") ?? 0;
658 | 		const perReviewLimit = limits.get("per-review") ?? 0;
662 | 		expect(aggregateLimit).toBe(perReviewLimit * 10);
      error: expect(received).toBe(expected)
      Expected: 1200
      Received: 0
      (fail) getApprovedComments > caps one address across many review ids, not only per review

700 | 		const result = await getApprovedComments(7);
702 | 		expect(result.success).toBe(false);
      error: expect(received).toBe(expected)
      Expected: false
      Received: true
      (fail) getApprovedComments > checks the aggregate bucket before the per-review one

 23 pass
 2 fail
 109 expect() calls
Ran 25 tests across 1 file. [171.00ms]

Exited with code 1
```

Both failures are the two new `D1` cases, and both fail for the right reason:
there is no aggregate bucket at all, so the aggregate limit is `0` and a sweep
is never refused. The 23 pre-existing cases still pass against the pre-fix
code, which is what makes the two failures attributable to the missing
aggregate bound rather than to the rest of the change.

### D2 — `src/components/comments/CommentSection.tsx` reverted to `10b1d8e`

The state module was left at the new version, so this is the D2 shape exactly:
the state module keeps the rows, the component renders the error block instead.

```
$ git checkout 10b1d8e -- src/components/comments/CommentSection.tsx
$ bun test src/components/comments/__tests__/comment-fetch-state.test.ts

187 | 		const source = collapsedComponentSource();
192 | 		expect(/\bisLoading\s*\?/.test(source)).toBe(false);
      error: expect(received).toBe(expected)
      Expected: false
      Received: true
      (fail) CommentSection render branches > takes its render mode from the selector

204 | 		const guard = guardBefore(source, "<CommentList");
205 | 		expect(guard.includes('renderMode === "list"')).toBe(true);
      error: expect(received).toBe(expected)
      Expected: true
      Received: false
      (fail) CommentSection render branches > renders the comment list in the list-with-error branch

216 | 		const guard = guardBefore(source, "dictionary.commentsLoadError");
217 | 		expect(guard.includes('renderMode === "error"')).toBe(true);
      error: expect(received).toBe(expected)
      Expected: true
      Received: false
      (fail) CommentSection render branches > shows the error block only in the error branch

224 | 		const guard = guardBefore(source, "dictionary.commentsRefreshError");
225 | 		expect(guard.includes('renderMode === "list-with-error"')).toBe(true);
      error: expect(received).toBe(expected)
      Expected: true
      Received: false
      (fail) CommentSection render branches > shows the refresh banner in the list-with-error branch

 10 pass
 4 fail
 22 expect() calls
Ran 14 tests across 1 file. [35.00ms]

Exited with code 1
```

The first failure is the pre-fix ternary itself: `expect(/\bisLoading\s*\?/.test(source)).toBe(false)`
is `false` only because the reverted component still branches on `isLoading` — the
`isLoading ? … : hasError ? ( commentsLoadError ) : ( <CommentList … /> )` shape
that put the error block where the retained rows should have been. The other three
fail because the reverted component never consults the selector, so no branch
mentions `renderMode` at all. The 10 passing cases are the five pre-existing
state cases and the five selector cases, which are independent of the component
— that is the point: **the state was already correct and the component was
still wrong**, which is exactly D2.

For completeness, the same revert with the **state module** also reverted
(`comment-fetch-state.ts` and `CommentSection.tsx`) fails at import time,
because the selector does not exist in the pre-fix module:

```
SyntaxError: Export named 'selectCommentsRender' not found in module
'.../src/components/comments/comment-fetch-state.ts'.
 0 pass
 1 fail
 1 error
Exited with code 1
```

### After — committed tree

```
$ bun test src/app/actions/__tests__/comments.test.ts src/components/comments/__tests__/comment-fetch-state.test.ts
 39 pass
 0 fail
 1342 expect() calls
Ran 39 tests across 2 files. [275.00ms]
```

and the full suite: 763 pass, 0 fail, 54 files.

---

## 5. The aggregate bound

Two keys, two ceilings, both on the same 60-second window.

| Key | Ceiling | Checked | What it bounds |
| --- | --- | --- | --- |
| `comments:${ip}` | 1200 per 60 s | **first** | Breadth: how many review ids one address may ask for, in total, per window. This is the bound that makes the action useless for enumerating the catalogue — a sweep is capped at 1200 calls however many distinct review ids it names. |
| `comments:${ip}:${reviewId}` | 120 per 60 s | second | Burst on one page: how often one review id can be asked for. Prevents a refresh storm, and keeps one popular review from exhausting the bucket for everyone behind one address. |

**The arithmetic.** 1200 = 120 × 10. The ratio is the point, and it is a
ratio to the per-review ceiling *in force now*, not to the older one:

- With the per-review ceiling at 120, an address must spend 1200 calls before
  the aggregate fires. Each review id can contribute at most 120 of them, so
  the address has to have named **at least ten distinct review ids** to get
  there. Ordinary browsing on one review — a mount plus a refresh after
  posting, so about 2 calls — never meets it, and a reader behind a shared
  egress is not the caller it fires on first.
- A figure of **600** was proposed in the round-2 review on the strength of the
  older per-review ceiling of 60, where it was ten times. At 120 the same ten
  times is 1200. 600 would be only *five* times the per-review ceiling, which
  an address reaches by exhausting five reviews rather than ten — that is
  browsing, not enumeration, and the aggregate is not the right place to catch
  it. 600 was therefore not copied; the number is derived from the ceiling that
  is actually in force, and the reasoning is in the code comment so the next
  reader can re-derive it if the per-review ceiling ever moves.

**What each bound does not do.** The aggregate is a *rate* bound, not an
impossibility: 1200 calls a minute is 1200 review ids a minute at one call
each, so enumerating the catalogue is linear in its size rather than free. It
is also a bound on one address; a fleet of addresses behind different egress
is a fleet of independent budgets. Both are properties of the mechanism, not
defects of this fix, and neither is closed by it.

---

## 6. The retention behaviour

One selector, three situations, and the branch each produces.

| Situation | State | `selectCommentsRender` | What the reader sees |
| --- | --- | --- | --- |
| The first fetch has not settled | `{comments: [], isLoading: true, hasError: false}` | `"loading"` | `dictionary.commentsLoading` |
| The **initial load** failed — nothing to fall back to | `{comments: [], isLoading: false, hasError: true}` | `"error"` | The `role="alert"` error block, `dictionary.commentsLoadError`. Not an empty list: "no comments yet" would be a plausible-looking wrong answer for a review that has comments. |
| A **refresh** failed while rows were on screen | `{comments: [aComment], isLoading: false, hasError: true}` | `"list-with-error"` | The **retained rows** (`<CommentList />`) **plus** an amber `role="status"` banner above them, `dictionary.commentsRefreshError` ("The comments could not be refreshed. Showing the ones we already had."). The failure is reported *alongside* the list, not in place of it. |
| The fetch succeeded, with or without rows | `{comments: […], isLoading: false, hasError: false}` | `"list"` | `<CommentList />` on its own. An empty review is a list with nothing in it, not an error. |

The heading's comment count is shown for `"list"` and `"list-with-error"` — the
rows are on screen in both — and hidden for `"loading"` and `"error"`.

The retention itself is unchanged from R1 and still lives in
`applyCommentsResult`: a failure returns `previous.comments` with
`hasError: true`. What changed is that the component now renders them.

---

## 7. Files changed and commits

Commits, verbatim from `git log --format="%H %s" -3`:

| SHA | Subject | Files |
| --- | --- | --- |
| `4fd985eac2383e2ba881187225377732a58fa41f` | `fix(comments): bound the comment fetch by breadth as well as by burst` | `src/app/actions/comments.ts`, `src/app/actions/__tests__/comments.test.ts` |
| `b2bc5fc060257ca02ac4272fbd47c5e1d5e6c02b` | `fix(comments): render the retained comments when a refresh fails` | `src/components/comments/CommentSection.tsx`, `src/components/comments/comment-fetch-state.ts`, `src/components/comments/__tests__/comment-fetch-state.test.ts`, `src/lib/i18n/dictionary.ts` |
| `b88b377ca7c1dc2985070e46ef04a95f98812611` | `test(comments): pin the render decision and the component that consumes it` | `src/app/actions/comments.ts` (comment only), `src/components/comments/__tests__/comment-fetch-state.test.ts` |

Files changed in the phase, all inside the plan's `Touches` list:

- `src/app/actions/comments.ts` — the aggregate bucket, its constant, and the
  doc block that states which bound each key provides.
- `src/app/actions/__tests__/comments.test.ts` — the two new `D1` cases; the
  two existing key assertions rewritten to assert by key rather than by call
  position.
- `src/components/comments/comment-fetch-state.ts` — the module doc, and the
  `selectCommentsRender` selector with its `CommentsRenderMode` type.
- `src/components/comments/CommentSection.tsx` — four render branches from the
  selector, the banner, and the heading count.
- `src/components/comments/__tests__/comment-fetch-state.test.ts` — the
  `selectCommentsRender` block and the `CommentSection render branches` block.
- `src/lib/i18n/dictionary.ts` — `commentsRefreshError` in `en` and `id`.

The phase's own evidence file:
`conductor/tracks/20261026-access-control-hardening/verification/phase-R2.md`.

Untouched, as the brief requires: `submitComment`, `reportComment`,
`toggleLikeReview`, every collection rule, `canAcceptPublicWrite` and its call
sites, `moderation.ts`, `like-review.ts`, `Commenters.ts`, `Authors.ts`, and
`MAX_COMMENTS_PER_REVIEW` (still 100).

---

## 8. Deviations

**One file outside the plan's `Touches` list:** `src/lib/i18n/dictionary.ts`.
It is not in the phase's `Touches`, but `T2.3` requires a new dictionary
string for the banner and the only place the strings live is that file. The
change is the minimum: one key added to `en` and the same key added to `id`
(`id` is typed over `en`, so a miss in either locale fails `bun run typecheck`).
No existing string was changed or removed.

Everything else is inside `Touches`. `plan.md` is listed in `Touches` but was
deliberately not edited: the primary owns the Conductor state files, and the
brief says so explicitly.

---

## 9. Notes — what is not proven

- **The component's rendered output is still not asserted by a rendering
  test.** The project has no React test harness (`@testing-library`,
  `react-test-renderer`, `jsdom` and `happy-dom` are all absent, and there is
  no `.test.tsx` file), which is why the state lives outside the component at
  all. The `CommentSection render branches` cases assert the *source* of the
  component: that it takes its mode from the selector, and that the guards
  around `<CommentList>`, `commentsLoadError` and `commentsRefreshError` name
  the right modes. That is a strong check on the wiring and it fails on a
  revert (§4), but it is a check on the source text, not on a rendered tree.
  A harness would be a better answer and is out of this phase's scope.
- **The 1200 aggregate ceiling is a judgement, not a measurement.** The ratio
  to the per-review ceiling is argued in §5 and in the code comment, but no
  traffic data informed it. If real traffic shows an address legitimately
  sweeping more than ten reviews a minute, the number is the thing to move —
  and the comment says how to re-derive it.
- **The aggregate bound fails open if Redis is down**, as every limit in this
  codebase does (`src/lib/rate-limit.ts` returns `success: true` when there is
  no client or on a Redis error). That is pre-existing behaviour, out of scope
  for this phase, and unchanged by it — but it does mean the aggregate bound
  is only in force while Redis is reachable.
- **The e2e suite does not exercise the new banner or the new error branch.**
  `e2e/comments.spec.ts` covers the comment form and a successful submission;
  no Playwright test drives a failed refresh, so the banner's appearance is
  proven at the source level (above) and not end to end. The e2e result
  therefore shows the change did not break the comment flow — 112 passed, the
  same count as before this phase — not that the new branches render
  correctly in a browser.
- **`D1` is proven against the mocked limiter, not against Redis.** The unit
  test drives a limiter that counts per key and applies the ceiling the
  action asked for, so the limit that fires is the production one rather than
  a number copied into the test. The rate limiter's own behaviour under
  Redis (TTL behaviour, `expire` only on first increment) is unchanged and
  untested by this phase.
- **`plan.md` is not updated by this phase.** The primary records the phase
  state. The e2e result it can record is in §2.
