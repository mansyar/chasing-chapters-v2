# Phase R3 verification — Review-fix round 3 (F1, F2)

| Field | Value |
| --- | --- |
| Track | `20261024-draft-preview-scheduling` (Draft Preview & Scheduled Publishing) |
| Phase | R3 — closing round-3 F1 (Low) and round-3 F2 (Low) |
| Date | 2026-10-24 |
| Branch | `feat/20261024-draft-preview-scheduling` |
| Base | `fc9b94f` (phase base named in the brief) |
| Head | `1c4fdde` (code); this file lands in the follow-up `docs(conductor)` commit |
| Result | **verified** — typecheck, lint, unit, e2e and the production build all exit 0 in one chain; both findings closed; unit 580 → 582, browser 112 → 112; both review detail route groups still `●` |
| Commits | `03ab44e` (R3.T1), `1c4fdde` (R3.T2), evidence in this file's own commit |

## Verification

The brief's chain, run from a clean tree:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| # | Command | Exit | Real numbers |
| --- | --- | --- | --- |
| 1 | `bun run typecheck` | 0 | `No type errors in 246 files` |
| 2 | `bun run lint` | 0 | `Checked 236 files in 798ms. No fixes applied.` |
| 3 | `bun test` | 0 | `582 pass`, `0 fail`, `1330 expect()` calls, `Ran 582 tests across 46 files` |
| 4 | `bun run test:e2e` | 0 | `Running 112 tests using 3 workers` … `112 passed (5.0m)`; no failed, interrupted, did-not-run or flaky lines |
| 5 | `bun run build` | 0 | `Generating static pages using 19 workers (27/27) in 31.6s`; route table below |

Counts against Phase R2: unit 580 → **582** (+2: the stored-schedule refill and the
explicit-clear case). Browser 112 → **112** (unchanged: F2 is a timeout in a shared fixture,
proved by the admin specs staying green rather than by a new spec). No test was removed,
skipped or weakened, and every pre-existing case still passes, including the four
`publishDate` fill cases R1 and R2 added.

### How the chain was run

Rows 1–5 are one invocation, prefixed with the harness environment the brief prescribes,
because `bun run build` cannot run against the dev database (pre-existing migration-ledger
drift: `column reviews.publish_at does not exist`):

```powershell
$env:DATABASE_URI='postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e'
$env:STORAGE_ADAPTER='local'
$env:NEXT_PUBLIC_R2_PUBLIC_URL=''
bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

The URI is `.env`'s `DATABASE_URI` with the database name suffixed `_e2e`, which is what
`resolveE2EDatabaseUri` in `src/lib/e2e-harness.ts` produces, so the chain's build ran
against the same database the harness had already migrated. No `.env` file, database,
storage setting or build config was edited for this. Both `bun run test:e2e` and the final
`bun run build` printed a route table; the one quoted below is the chain's last stage, i.e.
my own build rather than the harness's.

### Build route table (AC-10 / NFR-1 — both review detail routes still pre-rendered)

```
Route (app)
┌ ○ /_not-found
├   /[locale]
│ ├ ● /en
│ └ ● /id
├   /[locale]/about
│ ├ ● /en/about
│ └ ● /id/about
├   /[locale]/feed.xml
│ ├ ● /en/feed.xml
│ └ ● /id/feed.xml
├   /[locale]/reading-lists
│ ├ ● /en/reading-lists
│ └ ● /id/reading-lists
├   /[locale]/reading-lists/[slug]
│ ├ ● /en/reading-lists/e2e-fixture-rainy-season-reading-list
│ └ ● /id/reading-lists/e2e-fixture-rainy-season-reading-list
├ ƒ /[locale]/reading-lists/[slug]/opengraph-image-g9de6a
├ ƒ /[locale]/reviews
├   /[locale]/reviews/[slug]
│ ├ ● /en/reviews/e2e-fixture-nine-kinds-of-weather
│ ├ ● /en/reviews/e2e-fixture-the-cartographers-error
│ ├ ● /en/reviews/e2e-fixture-salt-and-paper-lanterns
│ └ ● [+5 more paths]
├ ƒ /[locale]/reviews/[slug]/opengraph-image-1v12u2
├ ƒ /admin/[[...segments]]
├ ƒ /api/[...slug]
├ ƒ /api/preview
├ ƒ /api/preview/exit
├ ƒ /api/translation/bulk-retranslate
├ ƒ /feed.xml
├ ○ /robots.txt
└ ƒ /sitemap.xml

ƒ Proxy (Middleware)
```

`/[locale]/reviews/[slug]` is still one `●` group over the same 8 pre-rendered paths, in both
the harness build and the chain's build — unchanged from Phases 3, R1 and R2. The only build
warnings are the pre-existing `google-gax` ones (`Can't resolve '../../package.json'`), present
before this track. Nobody changed `revalidate`, a route's dynamic marker or the prerender set.

## Findings

| Finding | Severity | Fix | Proving test |
| --- | --- | --- | --- |
| Round-3 F1 — the `publishDate` fill read `publishAt` only from the incoming body, so a partial update clearing `publishDate` alone (`{ publishDate: null }`) reached the fill with `data.publishAt === undefined`, filled nothing, and saved a scheduled review with no publish date — the state FR-8 and the hook's own comment forbid | Low | `src/collections/Reviews.ts:480-500` — `schedule` is derived exactly as `publishDate` is, `data.publishAt !== undefined ? data.publishAt : originalDoc?.publishAt`, and the fill reads `schedule`; the `_status === "published"` fallback still runs only when there is no schedule. Absent key ⇒ stored value; explicit `null` ⇒ the author clearing, which reaches the fill. Comments extended, not replaced | `src/collections/__tests__/publishAt.test.ts:139` `refills a cleared date from the stored schedule` — `{ publishDate: null }, "update", { publishDate: AUTHOR_DATE, publishAt: SCHEDULE }` expects `data.publishDate === SCHEDULE`; and `:151` `honours an explicit clear of both the date and the schedule` — `{ publishDate: null, publishAt: null }` over the same `originalDoc` expects `data.publishDate` to stay `null` |
| Round-3 F2 — `loginAsFixtureAdmin` clicked `Sign In` with no timeout, so the helper's stated 30 s + 3 × (15 s + 15 s) could consume a spec's whole 120 s budget before the click's own wait, and the third attempt could never run: an intermittent slow login surfaced as a test timeout instead of a retried login | Low | `e2e/fixtures/admin-session.ts:49-56` — the click is bounded (`.click({ timeout: 20_000 })`) and a comment above it states the worst case (30 s for the form, then three attempts of at most 20 s + 15 s + 15 s) so the bound, the retry count and the spec caps move together. Every assertion, `data-testid`, URL, retry count and spec timeout is untouched, and no app code changed | No new spec: the helper is shared test infrastructure, and the finding is a budget, not a behaviour. Proved by all six admin specs — the ones that call this helper — staying green inside their `test.setTimeout(120_000)` in the suite above (`112 passed (5.0m)`; the admin cases finished in 3.8 s–23.9 s) |

The two states F1 distinguishes must not be confused, and the four earlier cases are what keep
them apart. `keeps the stored date on a partial update` (`{ publishAt: SCHEDULE }` over
`{ publishDate: AUTHOR_DATE }`) still expects `data.publishDate` to stay `undefined`, while the
new `refills a cleared date from the stored schedule` (`{ publishDate: null }`) expects the
schedule — inputs differing only by a key being present-and-`null` versus absent, opposite
outcomes. `leaves the date alone when the schedule is cleared` still passes because the stored
date fills first; `fills an empty publishDate with the schedule` still passes because
`data.publishAt` wins over the stored one.

## Requirements touched

FR-8 (the fill is now complete for both fields it reads). Nothing else: no field, permission
branch, dependency, `revalidate` value, route marker, migration or `.env` changed, and the
visibility predicate (`publishedAndVisibleWhere` / `isPubliclyVisible`) is the same two shapes
R1 and R2 left it in. F2 is test infrastructure and touches no requirement.

## Deviations

None. Every changed file is inside the phase's Touches (`src/collections/Reviews.ts`,
`src/collections/__tests__/publishAt.test.ts`, `e2e/fixtures/admin-session.ts`), plus this
evidence file.

## Notes for the primary

- **One arithmetic discrepancy in the brief, disclosed rather than absorbed.** The brief's
  reason for the 20 s bound is "worst case becomes 30 s + 3 × 50 s, which fits a 120 s budget";
  30 + 3 × 50 is 180 s, which does not fit 120 s. I made the prescribed change and wrote the
  comment as the arithmetic itself (per-attempt cost, and the warning that either bound moves
  the spec cap), without recording a "fits" claim I cannot see. The bound is still the right
  fix — an unbounded click was the only step that could consume an arbitrary share of the cap —
  but if the intent was a helper that always terminates inside 120 s, the numbers need a
  decision (a smaller click bound, or 2 attempts × 3 bounds). Worth a look before the track
  closes rather than a silent disagreement.
- The realistic failing path is cheaper than the stated ceiling: a rejected login leaves the
  form in place, so the detachment wait fails at 15 s and the bell wait never runs (20 s + 15 s
  per attempt). The 50 s figure is the "form detached but no bell" path.
- The suite still prints `[WebServer] [Warmup] Server did not become ready; skipping warm-up`
  and the `[Revalidation] Could not revalidate …` / `[Translation] …` / `[RateLimit] …` noise in
  a green run; the brief predicts all of it, and nothing in it is a failure.
- No unit test asserts the 20 s constant. Reading a timeout out of a fixture with a regex would
  be a test of the source text rather than of behaviour, so the proof is that every admin spec
  still logs in and passes inside its cap; the comment carries the arithmetic the reviewer asked
  for.

## Primary correction after the phase reported

The phase report disclosed that my brief's arithmetic for F2 did not hold: `30 s + 3 x 50 s` is
180 s, not <=120 s, so the prescribed `20_000` click bound still let a three-failure login
overrun the specs' cap (the real all-failures path was 30 + 3 x 35 = 135 s). The comment the
phase wrote said so honestly rather than claiming a fit it could not see, which is the right
call to have made.

I closed the gap rather than shipping the claim: `e2e/fixtures/admin-session.ts` now bounds the
click at `10_000` and the comment states the arithmetic that actually fits — 30 + 3 x (10 + 15)
= 105 s on the all-failures path, 70 s on the success path including the bell wait. Proof is
behavioural, not arithmetic: every admin spec passes inside its 120 s cap, on runs where the
login took 3.8 s to 5.5 s.

Nothing else changed, and the full gate was re-run after this edit:

| Command | Exit | Result |
| --- | --- | --- |
| `bun run typecheck` | 0 | no type errors in 246 files |
| `bun run lint` | 0 | 236 files, no fixes applied |
| `bun test` | 0 | **582 pass, 0 fail**, 46 files |
| `bun run test:e2e` | 0 | **112 passed (3.7 m)**, nothing failed or skipped |
| `bun run build` | 0 | 27/27 static pages, both review detail path groups still pre-rendered over 8 paths |

The configured phase command exited 0. Both review findings are closed, and the disclosure the
phase made about my arithmetic is the reason the final bound is 10 s rather than 20 s: an honest
"this does not fit" was worth more than a green line.
