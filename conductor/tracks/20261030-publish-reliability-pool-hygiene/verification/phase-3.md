# Phase 3 — A publish that did not become visible says so

- Track: `20261030-publish-reliability-pool-hygiene`
- Phase: 3
- Date: 2026-10-30
- Branch: `fix/20261030-publish-reliability-pool-hygiene`
- Base commit: `c629e35`
- Head commit (last code commit): `028518a`
- Commits: `40761d2` (T1), `028518a` (T2), then the evidence file itself
- Result: **verified** — static and unit layers clean, and the e2e suite green
  (145/145, exit 0) once it ran without a second suite competing for port 3100.
  The three timeouts recorded during the phase were contention, not a
  regression; see "E2E outcome" for the reasoning and the clean run.

## Goal

Every publish ends in a recorded, identifiable outcome: a save that leaves a
review published but not visible is recorded as a `scheduled` signal rather than
an error, and a publish that is not readable through the public gate after the
response is reported once with the slug and the locale. Covers FR-4, FR-5,
NFR-3, NFR-4, AC-4, AC-5.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| Static | `bun run typecheck` (`bun check`) | 0 | No type errors in 301 files |
| Static | `bun run lint` (`biome check .`) | 0 | 298 files checked, no fixes applied |
| Unit | `bun test` | 0 | 953 pass, 0 fail, 3742 expect() calls, 72 files |

Run as one command first, then the e2e step on its own because the chain's
build stage exceeds the shell timeout:

```
bun run typecheck && bun run lint && bun test   # exit 0
bun run test:e2e                                # see below
```

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| E2E | `bun run test:e2e` | 0 | 145 passed, 0 failed, suite 2.7m on an uncontended machine. Earlier runs under contention: 142/145 in 10-12m — see "E2E outcome" |

## E2E outcome

The e2e layer **passes on this tree**: `bun run test:e2e` → 145 passed, 0 failed,
exit 0, suite 2.7m.

Getting there needs the history, because two earlier runs did not pass and the
difference was not the code:

| Run | Concurrency | Result |
| --- | --- | --- |
| 1 | alone | cut off by a shell timeout, no verdict |
| 2 | **a second suite alive** | 145 tests, 142 passed, 3 failed (10.3m) |
| 3 | **a second suite alive** | same 3 failures on re-run |
| 4 | alone | **145 passed, exit 0 (2.7m)** |

All three failures were 30s timeouts in `e2e/language-control-a11y.spec.ts`:
`:253` fetching a `/_next/static/chunks/aaea2bcf-….js` chunk, and `:307` in both
locales on `page.goto("http://localhost:3100/en/reading-lists")` and its skip
link. Every run — passing or failing — logged
`[Warmup] Server did not become ready; skipping warm-up`, so that warning is
normal here and not the discriminator.

The discriminator is duration and port sharing:

- The suite is 2.7m uncontended and 10-12m contended, so failing runs were
  running roughly four times slower — the shape of two suites sharing one
  machine, one database and one `localhost:3100`.
- The runner serves `.next/standalone/server.js` on 3100, and warm-up gives the
  listener 120s (`waitForServer`) before giving up. A second suite cannot bind
  that port, so it either reaches the first run's server or nothing, and every
  worker then pays cold-render cost against the 30s test timeout.
- All three failures are requests to the one public route that renders
  dynamically (`/reading-lists` is `ƒ` in the route table; the other public
  pages are SSG), or to a static chunk fetched while that route was rendering —
  a slow render, not a wrong answer.
- Phase 1's run on this machine also logged the warm-up warning and passed
  145/145.

Nothing in this phase touches what those three tests assert: they measure the JS
a public page ships (dictionary strings must not reach the client) and the `lang`
attribute of every public page, whereas this phase adds one gated read in a
publish hook that runs after the response. No page, component or client bundle
changed. With the suite run alone the layer is green, so NFR-4 is met.

Both scheduled-path specs the phase must leave alone stayed green on every run —
`e2e/publish-schedule.spec.ts` (9 declarations: 404 in both locales, REST API,
home latest, browse list both locales, reading-list card, count parity, both
feeds, sitemap, no OG image) and `e2e/admin/review-schedule.spec.ts` — and no
`publish-verification` or `review_publish_scheduled` log line appeared in any
run, which is what AC-4 asks for.

## What changed

### T1 — the outcome of a published save is a value (`40761d2`)

`src/lib/publish-verification.ts` (new) holds the one classifier:

```ts
type PublishOutcome = "visible" | "scheduled" | "not-published";
classifyPublishOutcome(doc, now): PublishOutcome
```

It delegates to `isPubliclyVisible` from `src/lib/publish-visibility.ts` rather
than restating the rule, so "published but not visible" means exactly what it
means for a reader — the schedule has not arrived — and a draft or an
unpublish lands in `not-published`. There is deliberately no fourth "broken"
answer: whether a visible review is *readable* is a database question and is
T2's job.

Unit-tested (`src/lib/__tests__/publish-verification.test.ts`): visible with no
schedule, a past schedule, a future schedule (→ `scheduled`), the exact-`now`
boundary (visible, inclusive), a draft, an unparsable `publishAt` (visible, the
fail-open rule), and no status at all.

### T2 — the public gate is read once after the response (`028518a`)

`verifyPublicVisibility({ doc, now, read })` performs **one** read, shaped like
the public page's:

```ts
payload.find({
  collection: "reviews",
  where: { and: [{ slug: { equals } }, publishedAndVisibleWhere(now)] },
  limit: 1,
  depth: 0,
  overrideAccess: false,   // the collection's own public read rule applies
  pagination: false,
})
```

- No `user`, so `Reviews.access.read` falls through to
  `publishedAndVisibleWhere` — the same gate an anonymous reader hits.
- Nothing back → one `reportErrorToSentry` call carrying the document id in the
  message and `extra: { route: "/en/reviews/<slug>", locale: "en" }`.
- The read throws → `unreadable`: logged as
  `{ kind: "publish_verification_failed", slug }`, **not** reported, because a
  failed read is not evidence that the review is invisible.
- Scheduled, draft, unpublished and slug-less documents → `skipped`, no read.

The reader is injected (`PublicGateReader`), so the module never reaches into
`payload` and the tests run without a database. `src/hooks/revalidatePages.ts`
supplies the real one and wires the check into the **Phase 1 deferred path**:

```ts
deferPastResponse(async () => {
  await revalidateReviewPagesAfterWrite(doc, payload);
  await verifyPublishedReview(doc, payload);
}, `review "${doc.slug ?? doc.id}"`);
```

so nothing is read while the write's transaction is open. `verifyPublishedReview`
records the `scheduled` signal as `logger.info` with
`{ kind: "review_publish_scheduled", slug, publishAt }` instead of reading the
gate, then returns.

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-4 | A scheduled publish emits `scheduled` and no failure signal | `publish-verification.test.ts` → `classifyPublishOutcome` future schedule = `"scheduled"`; `verifyPublicVisibility` "reads nothing for a scheduled publish" (0 reads, 0 Sentry); `revalidatePages.test.ts` "records a scheduled publish as information instead of reading the gate" (`kind: "review_publish_scheduled"`, no gate read); e2e `publish-schedule.spec.ts` (9 declarations) and `e2e/admin/review-schedule.spec.ts` stay green and silent | met |
| AC-5 | A publish whose post-response public read returns nothing reports to Sentry exactly once with slug and locale | `publish-verification.test.ts` "reports exactly once, with the slug, locale and id, when the gate returns nothing" (`toHaveBeenCalledTimes(1)`, message contains slug + id, `extra` route/locale); "reads the review once through the public gate and stays silent when it comes back" asserts `read` called once with `overrideAccess: false`, no `user`, `limit: 1`, `depth: 0`, `pagination: false`; `revalidatePages.test.ts` "verifies a published review through the public gate after the response" (no read before the deferral flush, one gated read after) | met |
| FR-4 | A save leaving a doc published but not visible at now is a distinct `scheduled` signal, not an error | as AC-4 | met |
| FR-5 | After the response, the public gate is read once; a doc not readable through it is reported with slug and locale | as AC-5 | met |
| NFR-3 | No new runtime dependency | only `payload` (type), `./error-locale`, `./i18n/locale`, `./logger`, `./publish-visibility`; the deferral still uses `next/server`'s `after` from Phase 1 — `package.json` untouched | met |
| NFR-4 | All existing unit and Playwright tests pass unchanged | `bun test` 953 pass / 0 fail (941 before this phase); `bun run test:e2e` **145 passed / 0 failed, exit 0** when run alone (the phase's mid-run contention is analysed under "E2E outcome"). The only existing test file edited is the hook's own, for its new branch (declared below) | met |

## Evidence paths

- `src/lib/publish-verification.ts` (classifier, gate read, report)
- `src/lib/__tests__/publish-verification.test.ts` (13 tests)
- `src/hooks/revalidatePages.ts` (`verifyPublishedReview`, wired into the deferred tail)
- `src/hooks/__tests__/revalidatePages.test.ts` (2 phase-local tests + finder helper)

No large artifacts; nothing written under `.conductor/evidence/`.

## Deviations

| File | Reason |
| --- | --- |
| `src/hooks/__tests__/revalidatePages.test.ts` | Permitted by the brief. Needed because the hook now makes a third `payload.find` call: the neighbour finder answers the gate read too (a `sort`-less query), the three `find.mock.calls.length === 2` assertions became `neighbourLookups(find) === 2`, the slow-read mock answers the gate read, and two cases were added (gate read after the response; scheduled signal). |

Nothing outside `Touches` was modified.

## Notes

- **The report names one path, not two.** The incident was queried per locale,
  but the contract is one report per publish, so the route is the document's
  default-locale page (`/en/reviews/<slug>`) with `locale: "en"`. The review's
  own translations share the document id in the message, which is what an
  operator filters on.
- **The verification never runs inside the write.** It lives in the Phase 1
  `deferPastResponse` work, after `revalidateReviewPagesAfterWrite`, and it
  reads with a gate that issues no `count(*)` (`pagination: false`). It is a
  signal, not a gate: it cannot fail a publish and never throws.
- **No request scope stays a skip.** `after()` has none when the Local API is
  driven directly (e2e seeding, scripts), so `deferPastResponse` logs and skips —
  observed in the e2e run's seed output. Inlining the work instead of deferring
  was rejected: it would put the extra read back on the publish path.
- **A leaked `logger.info` spy broke another file's test, and the suite caught
  it.** `spyOn` returns this process's single spy on the method, so the first
  full `bun test` failed in `translate-test-mode.test.ts` (it asserts no
  "Initializing Google Cloud client" call is recorded on `logger.info`) purely
  because the scheduled-signal test had left an info spy installed and
  `translate-batch.test.ts` had logged through it. The scheduled test now
  restores the spy in a `finally`. Worth knowing for any future `logger.info`
  spy.
- **e2e needed a clean machine, not a code change.** Two runs failed the same
  three `language-control-a11y` timeouts while a second suite was alive on the
  same port and database; the same tree passed 145/145 in 2.7m alone. The
  evidence records the sequence rather than the verdict alone, because "reproduced
  twice" turned out to mean "reproduced twice under the same contention".
  The underlying fragility is real and worth its own track: `waitForServer`
  tolerates 120s before skipping warm-up, so a contended machine silently
  degrades every worker's cold start into the 30s test ceiling.
- The scheduled path is untouched: `publish-visibility.ts` is unchanged and
  both schedule specs pass.

## Primary verification

Re-run independently by the primary (2026-10-30, head `4e8aa2f` plus this
reconciliation).

| Check | Command | Result |
| --- | --- | --- |
| Clean tree | `git status --porcelain` | empty before the reconciliation edit |
| Files changed vs Touches | `git diff --stat c629e35..HEAD` | 5 files: the two new `src/lib` files, the hook, the hook's test (declared), the evidence file |
| Typecheck | `bun run typecheck` | exit 0 — 301 files, no errors |
| Lint/format | `bun run lint` | exit 0 — 298 files, no fixes |
| Unit/integration | `bun test` | exit 0 — 953 pass, 0 fail, 3743 assertions, 72 files |
| E2E | `bun run test:e2e` | exit 0 — 145 passed in 2.7m, run alone |

Reading the diff against the requirements:

- **FR-4:** `classifyPublishOutcome` delegates to `isPubliclyVisible` and returns
  `scheduled` only for `_status === "published"`; the hook logs it with
  `kind: "review_publish_scheduled"` and returns without reading the gate.
- **FR-5:** exactly one gated read, after the response, inside the Phase 1
  deferral; `overrideAccess: false` with no `user`, so it is the reader's query.
  A miss reports once; a throw is `unreadable` and logged, not reported — the
  right call, since a pool error is not evidence of invisibility.
- **NFR-3:** no new dependency; `package.json` untouched.
- **NFR-4:** unit and e2e green on this tree.

The one thing I'd have a reviewer look at: `verifyPublishedReview` fires on
every published-save path, not only on a transition into `published`, so an
ordinary content edit of a live review also performs the gate read. It is
one cheap read to a pooled connection, it happens after the response, and it
catches the case where a review is *edited* into invisibility — but it is a
choice, not a requirement, and worth naming.
