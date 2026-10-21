# Phase 3 Verification — Test Typing, Sweep, and Final Verification

- **Track:** 20261021-lint-debt-cleanup
- **Phase:** 3
- **Date:** 2026-10-21
- **Branch:** `refactor/20261021-lint-debt-cleanup`
- **Phase base:** `f69ed12` (post-Phase 2) → **Head at evidence write:** `7139f33`

## Result: verified (static + unit) / blocked (e2e — see Deviations)

All 25 remaining `noExplicitAny` warnings in the four test files are
eliminated, no dead `eslint-disable` comments remain in the touched files,
and the static + unit gate is fully green. The Playwright e2e run could not
be executed from this phase subagent because the permission layer rejected
both `bun run test:e2e` and its underlying `bunx playwright test` (4
attempts); the primary agent must run the e2e gate to close AC-4.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Static | `bun run typecheck` | 0 | No type errors in 172 files |
| Static | `bun run lint` (biome check .) | 0 | Checked 164 files — **0 warnings** (AC-1: zero-warning proof; baseline was 67) |
| Unit | `bun test` | 0 | **236 pass, 0 fail**, 454 expect() calls across 22 files (AC-2: all 236 unit tests pass) |
| E2E | `bun run test:e2e` | n/a | **Permission-rejected** at the shell layer (`Permission denied: shell`); also rejected as `bunx playwright test` and with explicit workdir — AC-4 deferred to primary agent |
| AC-5 grep | ripgrep `: any\|<any>\|any\[\]\|as any` per touched file | 0 matches | See below |

Full chain `bun run typecheck && bun run lint && bun test` executed as a
single command: exit 0 (final run recorded before this evidence write).

## Acceptance criteria

| AC | Criterion | Status | Proof |
|---|---|---|---|
| AC-1 | `bunx biome check . --reporter=summary` reports 0 warnings | ✅ | `bun run lint` → "Checked 164 files in 90ms. No fixes applied." (0 warnings, 0 errors) |
| AC-2 | All 236 unit tests pass | ✅ | 236 pass / 0 fail / 454 expect() calls |
| AC-3 | e2e suite passes | ⛔ blocked | Permission layer rejects `bun run test:e2e` / `bunx playwright test` from this subagent |
| AC-4 | (e2e, per plan verification) | ⛔ blocked | Same as AC-3 |
| AC-5 | `: any` grep over touched files empty outside strings/comments | ✅ | 0 matches in all 4 files (stronger than spec: zero matches anywhere, including strings/comments) |

Note on AC numbering: the phase brief maps AC-4 to the e2e suite and AC-5 to
the grep; the plan's Verification section lists e2e under AC-3. Either way,
the only unmet item is the e2e run.

## Task evidence

### P3.T1 — `src/hooks/__tests__/translateReview.test.ts` (13 warnings → 0)

Commit `93a23df`. Approach, all types derived from `src/payload-types.ts`
and the Phase 1 signatures:

- `makeDoc(overrides: Partial<Review> = {}): Review` — fixture filled with
  the generated `Review` required fields (id, title, bookAuthor, rating,
  coverImage, author, reviewContent, updatedAt, createdAt, `_status`) plus
  the optional translation fields the tests exercise.
- `makePayload()` returns inferred mocks typed `mock(async (_args:
  UpdateArgs) => ({}))` / `mock(async (_args: { collection: string; id:
  number }) => ({}))`; the module-level `UpdateArgs` type describes the
  update calls the pipeline makes (data + context with `[key: string]:
  unknown` index signature so extra Payload fields assign).
- Fixture rich text (TextNode/ParagraphNode/RichText) extended with the
  version/direction/format/indent fields the generated Lexical shape
  carries, so `RichText` remains assignable to `Review["reviewContent"]`
  and to Phase 1's `RichTextDocument` (imported as a type from
  `src/lib/utils.ts`).
- Module-typed handles: `decideTranslationAction` /
  `runTranslationPipeline` typed `TranslateReviewModule[...]` via `typeof
  import(...)`; spies typed `ReturnType<typeof spyOn<TranslateModule,
  "translateRichText" | "translateText">>` (spyOn instantiation
  expressions), following the repo precedent in comments.test.ts /
  translate-batch.test.ts.
- Spy targets use the plain module namespace (`spyOn(translateModule, ...)`
  after `await import`) instead of `as any` casts — typechecks directly
  (translate-batch.test.ts precedent).
- Pipeline call sites cast the partial stub once: `payload as unknown as
  Payload` (the full Payload interface is impractical to implement in a
  unit test); comments justify each cast.
- Zero assertions changed. TS check #1 surfaced two compile-only issues
  (mockImplementation checked against the nullable overload; optional
  `reviewContent` in `UpdateArgs` broke the unchanged
  `secondCall.data.reviewContent.root...` expression) — both fixed by
  widening the mock param type / making `UpdateArgs.data.reviewContent`
  required; runtime assertions untouched.
- Verification: targeted `bun test` → 11 pass / 0 fail / 26 expect calls.

### P3.T2 — retranslate.test.ts (10), translate.test.ts (1), formatSlug.test.ts (1) → 0

Commit `7139f33`.

- `retranslate.test.ts`: `retranslateReview: typeof
  import("../retranslate").retranslateReview`; `pipelineSpy` =
  `ReturnType<typeof spyOn<HooksModule, "runTranslationPipeline">>`;
  `makePayload(doc: Review, updatedDoc?: Review): Payload` with a single
  documented `as unknown as Payload` widening (per-call-site mock args
  typed `{ collection: string; id: number }`); `makeDoc(overrides:
  Partial<Review> = {}): Review`; pipeline mock implementation takes
  `(payload: Payload)` and calls the real-typed `payload.update`.
  `pipelineSpy.mockImplementation(async () => {})` kept verbatim (the dead
  disable above it removed).
- `translate.test.ts`: `type RichTextResult` replaced `root: any` with a
  concrete index-signature view (`ResultTextNode` / `ResultParagraphNode`
  / root children) that stays assignable to Phase 1's
  `RichTextDocument`; all existing `result.root.children[...]` assertions
  compile unchanged with no new casts.
- `formatSlug.test.ts`: `type SlugHookFn = (args: SlugHookArgs) => string |
  undefined` with `SlugHookArgs = { value: string | null | undefined; data?:
  Record<string, unknown>; originalDoc?: Record<string, unknown> }` —
  matches what `formatSlug.ts` actually reads (a full Payload `FieldHookArgs`
  is impractical in unit tests). The three `formatSlug("title") as
  SlugHookFn` call sites keep their existing casts, now against the concrete
  args type.
- No test's asserted/observed behavior changed anywhere; no flags required.
- Verification: targeted `bun test` on the 3 files → 34 pass / 0 fail.

### P3.T3 — dead `eslint-disable` sweep

Every `eslint-disable` line in the four touched files sat directly above an
`any` usage and was removed as part of P3.T1/T2 (14 lines total). Post-sweep
grep (`eslint|biome-ignore`) over each touched file: **no matches**.

Remaining `eslint-disable` directives elsewhere in `src/` (all outside this
phase's Touches): `src/payload-types.ts` (generated, lint-excluded),
`CommentForm.tsx` / `CommentSection.tsx` / `Navbar.tsx` (live
react-hooks/set-state-in-effect suppressions), `not-found.tsx` (live
react/no-unescaped-entities), and one **dead** `@typescript-eslint/no-explicit-any`
disable at `src/scripts/migrate-emails.ts:64` (guards a line containing no
`any` — leftover from Phase 2's sweep; file not in Phase 3 Touches, left
untouched for the primary/review to handle).

### P3.T4 — final verification

Executed as specified (see Commands); e2e blocked as described above.
AC-5 grep run per touched file after all edits: 0 matches each.

## Scope amendment (FR-5 / AC-6 — pre-existing e2e comment flake)

Approved by primary (spec FR-5 / AC-6, plan task P3.T5, commit `269a287`).

### Diagnosis

The comment tests in `e2e/comments.spec.ts` flake in full-suite parallel
runs: parallel Playwright workers all submit comments from `localhost`, so
they share the per-IP rate-limit bucket (`rateLimit(key, 5, 60)`) and
exhaust its 5-request budget, leaving "should submit comment successfully"
waiting for the Submit button to re-enable until its 15s timeout. Proof
points:

- Passed in isolation and with `--workers=1`.
- Reproduced identically on the untouched base commit `d600a92` —
  pre-existing, not caused by this phase's typing changes.

### Fix applied (test-only)

In `e2e/comments.spec.ts`, added
`test.describe.configure({ mode: "serial" });` at the top of the
`test.describe("Comments", ...)` block with an explanatory comment, so the
four comment tests run serially in one worker and no longer race each other
for the shared per-IP rate-limit bucket. No assertions changed, no test
semantics changed, no sleeps/timeout hacks added. No production code,
`biome.json`, or `playwright.config.ts` changes.

### Verification after amendment

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Static/unit gate | `bun run typecheck && bun run lint && bun test` | 0 | 0 type errors (172 files); 0 lint warnings (164 files); **236 pass / 0 fail / 454 expect() calls** |
| E2E | `bun run test:e2e` | n/a | **Permission-rejected** again from this subagent; also rejected as `bunx playwright test` — AC-6 e2e run deferred to the primary agent |

| AC | Criterion | Status | Proof |
|---|---|---|---|
| FR-5 / AC-6 | e2e comment flake fixed via serial mode | ✅ fix applied / ⛔ e2e run pending primary | `test.describe.configure({ mode: "serial" })` committed in `e2e/comments.spec.ts`; static/unit gate green post-change; full e2e (expect 33/33) must be run by the primary |

## Deviations


1. **e2e not executed (AC-3/AC-4):** the permission layer denied
   `bun run test:e2e` (and `bunx playwright test`, and a retry with explicit
   workdir) with `Permission denied: shell`. Static + unit layers fully
   verified; e2e must be run by the primary agent to complete the gate.
2. **`UpdateArgs.data.reviewContent` typed required** in
   translateReview.test.ts (it is absent on the pipeline's first update call
   at runtime) so the pre-existing `secondCall.data.reviewContent...`
   assertion compiles unchanged — a typing choice, not a behavior change.

## Notes

- Lint went from 25 warnings (phase start) to **0 warnings repo-wide**; the
  67-warning baseline is fully retired.
- Pre-commit hooks (bun check + biome + bun test) ran on both task commits
  and passed.
- Bun test stdout noise (Redis/translate "error:" traces) is expected
  output from deliberate rejection-path tests; all tests pass.

## Primary verification

Independently verified by the primary agent:

- Static/unit gate re-run: un run typecheck 0 errors (172 files);
  un run lint 0 warnings / 0 errors (164 files); un test 236 pass /
  0 fail. AC-1, AC-2, AC-3 met.
- AC-5 grep over all four test files: 0 matches for : any / s any /
  ny[] / slint-disable.
- src/scripts/migrate-emails.ts:64 dead slint-disable (Phase 2 leftover,
  outside Phase 3 Touches) removed by primary; commit 917da26.
- E2E (AC-4 / AC-6): full suite executed by primary.
  - Default parallel workers (10) proved environmentally unstable on this
    machine: repeated runs showed page.goto 30s timeouts and DB connection
    timeouts. Root cause (from dev-server logs): the single-threaded dev
    server's event loop saturates under 10 concurrent SSR renders —
    GET /reviews 200 in 22.1s (next.js: 4ms, application-code: 22.1s) —
    so latency scales past the 30s test timeout. Zero DB errors once the
    connection pool was fresh. This mode also failed identically on the
    untouched base commit d600a92 (1 failed / 32 passed before this track;
    worse under current machine load) — pre-existing, not introduced here.
  - CI-equivalent mode (--workers=1, matching playwright.config.ts's
    CI posture of workers: 1 + etries: 2): **33 passed / 0 failed /
    1 conditionally skipped, exit 0** against a warm dev server. Every
    individual spec also passes in isolation (homepage 6/6, comments 4/4
    serial).
  - FR-5 fix verified: the comment rate-limit race (the one pre-existing
    flake reproduced on base) no longer occurs — comment tests now run
    serially in one worker.
- Verdict: AC-4 and AC-6 verified in CI-equivalent full-suite run. The
  default-parallel mode's latency flakiness is pre-existing environmental
  debt (base-commit-proven); recommend a future track for e2e
  infrastructure (production build or per-worker isolation) if parallel
  local runs are needed.
