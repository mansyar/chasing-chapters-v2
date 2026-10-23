# Phase 3 Verification — Test-Mode Provider Stub and Admin DOM Specs

- **Track**: 20261022-e2e-production-harness — "E2E Production Harness"
- **Phase**: 3 — "Test-Mode Provider Stub and Admin DOM Specs" (FR-5, FR-6, AC-5, AC-6, NFR-2)
- **Date**: 2026-10-22
- **Branch**: `chore/20261022-e2e-production-harness`
- **Base commit**: `e2482e3` — "conductor(plan): Mark phase 'Test-Mode Provider Stub and Admin DOM Specs' as in progress"
- **Head commit**: `25b84c5` — "test(e2e): harden the admin specs against the admin shell" (this
  evidence file is committed on top of it)

## Result

**Verified.** The provider is replaced by an offline, deterministic stub behind the explicit
`TRANSLATION_TEST_MODE=1` flag, and the three admin translation surfaces — the edit-view poller, the
attention bell and the bulk re-translate action — each have a browser spec that logs in as the
fixture author, acts on the surface and asserts the visible outcome. The full phase verification
command is green: typecheck, lint, 417 unit tests and 40 browser tests, 0 failed, 0 skipped.

## Commands

Phase verification command (from the brief):

```
bun run typecheck && bun run lint && bun test && bun run test:e2e
```

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` → `✓ No type errors in 200 files` |
| static | `bun run lint` | 0 | `biome check .` → "Checked 193 files in 242ms. No fixes applied." |
| unit | `bun test` | 0 | 417 pass / 0 fail, 933 `expect()` calls, 33 files (the translation/rate-limit/lock error-path logs in the output are expected) |
| e2e | `bun run test:e2e` | 0 | seed → `next build` (102 s) → "Running 40 tests using 3 workers" → **40 passed, 0 failed, 0 skipped** (1.5 min of Playwright time) |

The e2e segment ran the command exactly as written: `bun run seed:e2e && bun run build && bunx
playwright test` (seed → build → suite). The husky pre-commit hook (typecheck + lint + `bun test`)
ran on every commit of this phase and passed each time.

### Browser suite

| Project | Test | Result |
| --- | --- | --- |
| `chromium` (37 public specs, `testIgnore: "**/admin/**"`) | the Phase 2 public suite, unchanged | 37 passed |
| `admin-attention-bell` | `e2e/admin/attention-bell.spec.ts` — "counts the reviews needing attention and links to their edit views" | passed (4.8 s) |
| `admin-bulk-retranslate` | `e2e/admin/bulk-retranslate.spec.ts` — "lists the candidates, runs the selection and reports every outcome" | passed (5.4 s) |
| `admin-translation-poller` | `e2e/admin/translation-poller.spec.ts` — "reports the finished translation and refreshes the visible status" | passed (24.5 s) |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-5 | The three admin translation surfaces have browser specs that log in, act, and assert a visible outcome: the edit-view poller shows its toast, the attention bell lists the reviews needing attention and links to their documents, and the bulk re-translate reports one outcome row per review. | `e2e/fixtures/admin-session.ts` logs in through the real admin login form (`src/components/AdminLogin.tsx`: `#email`, `#password`, "Sign In") with the fixture author from `src/lib/e2e-harness.ts` (`E2E_FIXTURE_AUTHOR`) and waits until the login form is replaced and the admin shell is up; all three specs use it. **Bell** (`e2e/admin/attention-bell.spec.ts`): the bell is visible with `aria-label="translations needing attention: 2"` and the badge "2", the panel "Translations needing attention" opens, the failed and the stale fixture review are listed with their status and their edit-view `href` (`/admin/collections/reviews/<id>`), and clicking the failed entry lands on that edit view. **Bulk** (`e2e/admin/bulk-retranslate.spec.ts`): the candidate list holds the failed and the stale fixture review ("0 of 2 selected" → "2 of 2 selected" after "Select all"), the run button "Re-translate 2 reviews" posts to `/api/translation/bulk-retranslate`, and the result shows the summary "2 reviews: 2 translated" plus one outcome row per review ("Review `<id>`: translated"). **Poller** (`e2e/admin/translation-poller.spec.ts`): the review's edit view shows the status "pending", the re-translate runs, and on the next 20-second poll tick the poller toasts "Translation completed" and the visible status becomes "translated". All three passed in the run above. | PASS |
| AC-6 | No outbound request reaches the translation API, no provider credential is needed, and the stubbed pipeline still produces a `translated` outcome. | The stub branch sits **above** the provider client: `translateBatch` returns the marked text before `getTranslateClient()` is ever reached, so no client is constructed, no credential is read and no request is sent (`src/lib/translate.ts`, `isTranslationTestMode()` + `translateWithTestModeStub()`). The unit test `src/lib/__tests__/translate-test-mode.test.ts` proves it: with the flag set, `logger.info("Initializing Google Cloud client")` is never called and neither cache function is touched (the stub also bypasses the Redis cache in both directions, so stub output can never be cached under a real cache key); with the flag unset the normal provider path runs (`"ID:Good morning"` from the mocked client). The e2e run itself is the second proof: the whole `bun run test:e2e` output contains **no** "Google Cloud", "[Translation]", quota or credential line — the provider client was never created during the run — while the stubbed pipeline still produced the `translated` outcome (the bulk run reported "2 reviews: 2 translated", and the poller spec read the Indonesian locale of the re-translated review back from the REST API and found the stub marker `[stub-id]`). The flag is read only from `TRANSLATION_TEST_MODE=1`; it is deliberately **not** gated on `NODE_ENV` (the harness serves a production build, so `NODE_ENV` is `production` there) and the deploy workflow never sets it. | PASS |

## What changed

- `src/lib/translate.ts` — the offline stub: `TRANSLATION_TEST_MODE_PREFIX` / `TRANSLATION_TEST_MODE_SUFFIX`
  (the `[stub-id] … [/stub-id]` marker), `isTranslationTestMode()` and the private
  `translateWithTestModeStub()`. `translateBatch` returns the stub output right after its empty-input
  guard, before the provider path and before the cache read/write.
- `src/lib/__tests__/translate-test-mode.test.ts` (new) — four cases: the flag is only active for the
  exact value `"1"`; with the flag set the translation is produced without a provider client and
  without touching the cache; blank text passes through; without the flag the normal provider path is
  used.
- `playwright.config.ts` — `webServer.env = { ...process.env, TRANSLATION_TEST_MODE: "1" }` (the
  process environment has to be spread in, otherwise the app boots without its database and cache
  variables) and the project split described below.
- `e2e/fixtures/admin-session.ts` (new) — the shared admin helpers: the login flow, the attention-bell
  locator, the review-id resolver over the REST API and the admin paths.
- `e2e/admin/attention-bell.spec.ts`, `e2e/admin/bulk-retranslate.spec.ts`,
  `e2e/admin/translation-poller.spec.ts` (new) — one spec per admin translation surface.

## The Playwright project split

`playwright.config.ts` now declares four projects instead of one:

| Project | Selects | Depends on |
| --- | --- | --- |
| `chromium` | the public suite (`testIgnore: "**/admin/**"`) | — |
| `admin-attention-bell` | `e2e/admin/attention-bell.spec.ts` | — |
| `admin-bulk-retranslate` | `e2e/admin/bulk-retranslate.spec.ts` | `admin-attention-bell` |
| `admin-translation-poller` | `e2e/admin/translation-poller.spec.ts` | `admin-bulk-retranslate` |

Reason: the three admin surfaces share the fixture's translation states. The bell counts the reviews
needing attention, the bulk action re-translates exactly those two reviews, and the edit-view poller
watches one of them finish. Running them concurrently in a single project made them race over the
same documents (the first delivery failed exactly that way). Chaining them as dependent projects
keeps the order — bell → bulk → poller — and keeps the public suite parallel, so the worker cap
(NFR-1) and the public suite's runtime are unchanged. The order is also what makes a second run as
green as the first: every run re-seeds the fixture, which restores the `failed` and `stale` states
before the suite starts.

## Evidence paths

- `conductor/tracks/20261022-e2e-production-harness/verification/phase-3.md` — this report.
- `conductor/tracks/20261022-e2e-production-harness/verification/phase-2.md` — the fixture and the
  public-suite evidence this phase builds on.
- `src/lib/__tests__/translate-test-mode.test.ts` — the unit proof that the stub replaces the provider.
- `e2e/fixtures/admin-session.ts`, `e2e/admin/*.spec.ts` — the browser coverage.
- Commits: `112f657` (the stub + the Playwright env), `6a3c9f8` (the three admin specs + the project
  split), `25b84c5` (the admin-shell hardening), plus this evidence file on top.

## Deviations

| File | Reason |
| --- | --- |
| `playwright.config.ts` — the project split | Inside the phase's `Touches`, but more than the brief's "set the test-mode environment for the web server". The three admin specs mutate the same fixture reviews (the bulk action re-translates them, the poller moves one of them back to `pending`), so they cannot run concurrently in one project without racing over the same documents. The four dependent projects keep the deterministic order and leave the public suite untouched. |

No file outside the phase's `Touches` was changed.

## Notes

- The stub is gated on `TRANSLATION_TEST_MODE=1` alone. It is deliberately **not** gated on
  `NODE_ENV`: the harness serves a production build (`next start`), so `NODE_ENV` is `production`
  there and could not be used as the gate. The deploy workflow never sets the flag, so production
  traffic always reaches the real provider.
- The stub bypasses the translation cache in both directions. `translateBatch` reads and writes Redis
  entries keyed by a hash of the source text; caching stub output under a real cache key would
  poison a later genuine translation, so the cache read and the cache write are both skipped in test
  mode.
- The marker `[stub-id] … [/stub-id]` is what lets a browser test prove that a translation really
  happened: the poller spec reads the Indonesian locale of the re-translated review back from the
  REST API and asserts the marker is there, so a cached English source text could not pass.
- The admin specs import only from `@playwright/test` and `src/lib/e2e-harness.ts`; `bunfig.toml`
  keeps `bun test` rooted at `./src`, so the specs are collected by Playwright only.
- The `translationStatus` field is a read-only react-select, so the specs read the selected option
  (`#field-translationStatus [class*="single-value"]`) instead of a native `<select>`; the exact-text
  assertion means "untranslated" can never satisfy the "translated" expectation.
- The admin login triggers a pre-existing app bug that is logged, not raised: the `afterLogin` hook
  writes a `payload-preferences` document and Payload rejects it ("The following field is invalid:
  User", status 400). The hook catches the error, so the login still succeeds — it appears once per
  login in the e2e output. It is unrelated to this phase and was left untouched.
- The `output: standalone` warning from `next start` and the `google-gax` "Can't resolve
  '../../package.json'" build warnings are pre-existing and unrelated to this phase.
- The unit suite's `expect() calls` counter moved by one between two runs of the same tree
  (933 → 934 → 933) while the outcomes stayed **417 pass / 0 fail** in every run. The new stub test
  contributes a fixed twelve assertions, so the wobble comes from a pre-existing test outside this
  phase. It is flagged for the review; it changed no outcome in this phase.

## Primary verification

Run by the primary agent, independently of the phase subagent's report, on the same branch.

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `bun check` - no type errors in 200 files |
| static | `bun run lint` | 0 | `biome check .` - 193 files checked, no fixes applied |
| unit | `bun test` | 0 | 417 pass / 0 fail across 33 files |
| e2e | `bun run test:e2e` | 0 | seed -> build -> `Running 40 tests using 3 workers` -> **40 passed (1.4m)**, 0 failed, 0 skipped |

- **AC-5 - met.** The three surfaces are driven through the real admin login form and each asserts
  a visible outcome: the attention bell shows the label `translations needing attention: 2`, the
  panel, and one link per review whose `href` is the review's edit view (the numeric id is
  resolved from the database, not hard-coded); the bulk action shows the two candidates with their
  status badges, the `0 of 2 selected` / `2 of 2 selected` counter, the summary
  `2 reviews: 2 translated` and one outcome row per review; the edit view shows `pending`, the
  toast `Translation completed` and `translated`.
- **AC-6 - met, and checked independently of the report.** The e2e section of the run log was
  isolated from the unit section and searched for provider activity: no `Google Cloud`, no
  `Initializing Google`, no `quota`, no `credentials`, no `Translation failed` and no unit-test
  noise appear anywhere in it. The stub served every translation, and the poller spec proves the
  translation really happened by reading the Indonesian locale back and finding the `[stub-id]`
  marker in it.
- **Diff against Touches:** every file in the phase's Touches list changed, plus the one reported
  deviation (`playwright.config.ts`, split into four Playwright projects) and the evidence file. No
  unreported file is in the range.
- **The project split was accepted.** The three admin specs mutate the same fixture reviews - the
  bulk action re-translates exactly the two reviews the bell counts, and the poller moves one back
  to `pending` - so in a single project they raced over the same documents. The split chains them
  as dependent projects (`admin-attention-bell` -> `admin-bulk-retranslate` ->
  `admin-translation-poller`) and keeps the public suite parallel under the same three-worker cap,
  so NFR-1 is unchanged.
- **Pre-existing defect surfaced, not introduced:** the admin login logs
  `Failed to set default locale preference: The following field is invalid: User` (400) once per
  login. The `setDefaultLocalePreference` afterLogin hook in `src/collections/Authors.ts` writes a
  `payload-preferences` document whose `user` field cannot accept an `authors` relation, because
  the preferences collection's `user` field defaults to a `users` relation and this project has no
  `users` collection - the auth collection is `authors`. The hook catches the error, so the login
  succeeds, but **the admin's locale preference is never actually stored**. It is unrelated to this
  phase, was left untouched, and is recorded as debt for the review.
- **Squash:** the phase range contained five reported task-level commits with no merge commits, no
  unreported commits and no user commits, so it was squashed into a single phase commit per
  `git.phase_squash`.
