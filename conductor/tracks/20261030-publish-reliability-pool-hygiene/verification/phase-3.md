# Phase 3 — A publish that did not become visible says so

- Track: `20261030-publish-reliability-pool-hygiene`
- Phase: 3
- Date: 2026-10-30
- Branch: `fix/20261030-publish-reliability-pool-hygiene`
- Base commit: `c629e35`
- Head commit (last code commit): `028518a`
- Commits: `40761d2` (T1), `028518a` (T2), then the evidence file itself
- Result: **failed** — the static and unit layers are clean and cover every
  acceptance criterion of this phase, but the e2e layer failed the same three
  timeouts on two independent runs. See "E2E outcome" below.

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
| E2E | `bun run test:e2e` | 1 | 145 tests, 142 passed, 3 failed (suite 10.3m) — reproduced twice, identical failures. See "E2E outcome" |

## E2E outcome

The e2e layer **failed on this tree, reproducibly**: two independent full runs of
`bun run test:e2e` on `028518a` each ended with 145 tests, 142 passed and the
**same three** failures in `e2e/language-control-a11y.spec.ts`, exit 1.

| Test | Failing step | Error |
| --- | --- | --- |
| `:253` "keeps the dictionary off the client and reports the JS it ships" | `line 280` `await page.request.get(src)` for `/_next/static/chunks/aaea2bcf-….js` | test timeout of 30000ms exceeded (the first run surfaced it as `apiResponse.body: Response has been disposed` at `line 283`) |
| `:307` "declares en on every public page" | `line 309` `page.goto("http://localhost:3100/en/reading-lists")` | test timeout of 30000ms exceeded, waiting until `load` |
| `:307` "declares id on every public page" | `line 322` `getByRole("link", { name: "Lewati ke konten" })` on `/reading-lists` | test timeout of 30000ms exceeded (count never became 1) |

Both runs logged `[Warmup] Server did not become ready; skipping warm-up`, so
every worker paid cold-start cost. `/reading-lists` is the one public index route
built as `ƒ` (dynamic) — the built route table shows every other public page as
`●` (SSG) — so it is the only public page in those two tests that needs a server
render, and all three failures are requests to that same render path timing out
at the 30s ceiling rather than returning a wrong answer.

Everything else passed, including both scheduled-path specs this phase must
leave alone — `e2e/publish-schedule.spec.ts` (9 declarations: 404 in both
locales, REST API, home latest, browse list both locales, reading-list card,
count parity, both feeds, sitemap, no OG image) and
`e2e/admin/review-schedule.spec.ts` (3 tests) — and the admin draft-preview
suite. No publish-verification or `review_publish_scheduled` log line appeared
at any point.

Nothing in this phase touches what those three tests assert: they measure the JS
a public page ships (dictionary strings must not reach the client) and the
`lang` attribute of every public page, whereas this phase adds one gated read in
a publish hook that runs after the response, and no page or component changed.
That is an argument, not evidence: NFR-4 is recorded **not met**, and this phase
is reported `failed` rather than `verified`.

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
| NFR-4 | All existing unit and Playwright tests pass unchanged | `bun test` 953 pass / 0 fail (941 before this phase); `bun run test:e2e` **142/145 on both runs**, the same 3 timeouts in `e2e/language-control-a11y.spec.ts` — **not met on this tree**. The only existing test file edited is the hook's own, for its new branch (declared below) | not met |

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
- **e2e is the one open check, and it is reproducible, not flaky.** Two full runs
  on `028518a` failed the same three cases — all in
  `e2e/language-control-a11y.spec.ts`, all 30s timeouts, all on requests to the
  one dynamically rendered public route (`/reading-lists`) or to a static chunk
  while that route was being rendered, both after
  `[Warmup] Server did not become ready`. Details are under "E2E outcome". The
  next step is to establish whether that route's cold-render cost is the cause
  (the warm-up failure is the obvious lever, and it is outside this phase's
  Touches) — the phase does not claim these three green.
- The scheduled path is untouched: `publish-visibility.ts` is unchanged and
  both schedule specs pass.
