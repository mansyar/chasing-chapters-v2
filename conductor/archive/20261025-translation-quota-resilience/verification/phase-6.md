# Phase 6 verification — Admin visibility of quota failures

| | |
|---|---|
| **Track** | `20261025-translation-quota-resilience` |
| **Phase** | 6 — Admin visibility of quota failures |
| **Date** | 2026-10-25 |
| **Branch** | `fix/20261025-translation-quota-resilience` |
| **Base** | `75a8a54` (plan commit for this phase; Phase 5 verified at `a77c486`) |
| **Head** | `543e44c` |
| **Result** | **verified** |

## 1. Result

`verified`. All three layers exit 0, AC-9 is covered by five tests that fail
without the change, and the breakdown is labelled honestly: it describes the
bounded page the bell fetched, never the whole backlog.

## 2. Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Static | `bun run typecheck` | 0 | `bun check` — no type errors in 252 files (470.94ms) |
| Static | `bun run lint` | 0 | `biome check .` — 243 files checked, no fixes applied (120ms) |
| Unit | `bun test` | 0 | 676 pass, 0 fail, 1587 expect() calls, 49 files (2.30s) |

The phase verification command was run exactly as written:

```
bun run typecheck && bun run lint && bun test
```

Targeted re-run of the phase's own suite: `bun test
src/components/admin/__tests__/translation-attention.test.ts` → 36 pass, 0 fail,
59 expect() calls.

Coverage of the new logic-bearing module
(`bun test --coverage src/components/admin/__tests__/translation-attention.test.ts`):

```
 src\components\admin\translation-attention.ts | 100.00 % Funcs | 98.37 % Lines | 262-263
```

The two uncovered lines are the pre-existing `Date`-instance branch of
`asDateValue`; every line this phase added is covered. The gate is 80%.

## 3. Acceptance criteria

| AC | Criterion | Test | What it asserts |
|---|---|---|---|
| **AC-9** | The bell's failure breakdown separates quota failures from network, timeout, and unexpected failures. | `translation-attention.test.ts` → `describe("summarizeAttentionErrorKinds")` → **`separates quota failures from network, timeout, credentials and unexpected failures`** | Builds six `failed` docs whose `translationError` is exactly what the pipeline persists (`formatTranslationError(error)`), one per cause, and asserts the whole typed breakdown with `toEqual`: `{ quota: 1, network: 1, timeout: 1, credentials: 1, unexpected: 2 }`. Quota is counted in its own bucket and never merged into network/timeout/unexpected. |
| | | **`falls back to unexpected for an unclassifiable stored message`** (T3.2) | A `failed` doc whose stored message is `"the provider said something we have never seen"` — no pattern matches — yields `errorKind === "unexpected"` and `expect(() => summarizeAttentionErrorKinds(items)).not.toThrow()`. The fallback is confirmed from the code (`classifyTranslationError` ends with `if (!kind) kind = "unexpected"`) and pinned by the test. |
| | | **`round-trips every kind through the stored message`** | Feeds the exact persisted format (`"<actionable message> (raw: <detail>)"`) back through the attention classifier for all five kinds and asserts each lands on the kind the pipeline recorded. This is the property the whole design rests on: no new field, no migration, no change to what the pipeline writes. |
| | | **`gives each present kind its own line, in canonical order`** (T2.1) | The rendered breakdown is one line per kind, in `TRANSLATION_ERROR_KINDS` order, so quota and credentials are visually separate lines rather than a single comma-joined string an operator has to parse. |
| | | **`names the sample and the true backlog when the page is truncated`** | The scope line names the sample and the backlog; see §6. |

Supporting tests: **`counts zero for every kind absent from the fetched page`**,
**`leaves rows without a stored failure message out of every kind`** (a `stale`
review and a blank-message `failed` review are *not* `unexpected` failures — they
carry no kind), **`keeps the stored message on the item for the operator`**,
**`tolerates a non-string translationError`**, plus the five
`formatAttentionKindBreakdownLines` cases (truncated page, whole backlog,
singular, no kind recorded, empty page).

## 4. Task coverage

| Task | Satisfied by |
|---|---|
| **P6.T1.1** — derive the kind from the persisted `translationError` using the existing classifier; no new stored field | `src/components/admin/translation-attention.ts`: `AttentionCandidateDoc` gains `translationError?: unknown`; `TranslationAttentionItem` gains `translationError: string \| null` and `errorKind: TranslationErrorKind \| null`; `deriveErrorKind(message)` calls the existing `classifyTranslationError(new Error(message)).kind` — the classifier's `unknown` parameter is used as-is and its signature is unchanged. `translationError` is a plain `textarea` field on `Reviews` with no `hidden` flag and no field-level access rule, so the REST list already returns it; **no query change was needed**. |
| **P6.T1.2** — expose a per-kind breakdown as a small typed structure keyed by `TranslationErrorKind` | `export type AttentionKindCounts = Record<TranslationErrorKind, number>` and `summarizeAttentionErrorKinds(items)`. The zero-initialiser `emptyAttentionKindCounts()` spells out all five kinds literally, so adding a kind to `TRANSLATION_ERROR_KINDS` fails the typecheck instead of silently reporting zero — the renderer cannot miss a kind. |
| **P6.T2.1** — show quota failures as a distinct line | `formatAttentionKindBreakdownLines(counts, shownCount, totalCount)` returns a scope line followed by **one line per present kind**; `TranslationAttentionBell.tsx` renders each line as its own `<div>`. `quota` and `credentials` are therefore separate, individually readable lines — "Google is throttling" vs "credentials are wrong" needs no log reading. |
| **P6.T2.2** — keep the `N+` cap behaviour for the total count | `formatAttentionBadgeLabel` is **not modified**; the badge still renders `formatAttentionBadgeLabel(count)` where `count` is `totalDocs`. The three existing badge tests (`shows the exact count below the list limit`, `marks a truncated list with a plus suffix`, `honors a custom limit`) are untouched and pass. The new breakdown is rendered as a separate block and does not feed the badge. |
| **P6.T3.1** — quota separated from network, timeout and unexpected | `separates quota failures from network, timeout, credentials and unexpected failures` (AC-9) + `round-trips every kind through the stored message` + `gives each present kind its own line, in canonical order`. |
| **P6.T3.2** — an unclassifiable stored message falls back to `unexpected` rather than throwing | `falls back to unexpected for an unclassifiable stored message` — asserts both the fallback value and `not.toThrow()`. |

## 5. How the kind is recovered from stored data

No new field, no migration, no change to what the pipeline persists. The chain:

1. The pipeline persists `translationError` via `formatTranslationError(error)`,
   which writes `"<actionable message> (raw: <detail>)"`.
2. `ACTIONABLE_MESSAGES.quota` is
   *"Translation quota exceeded. Wait a few minutes before retrying…"* — so the
   stored string **contains** the classifier's own vocabulary.
3. `deriveErrorKind` re-feeds the whole stored string to the existing
   `classifyTranslationError` (`new Error(stored)`), and the same pattern
   (`QUOTA_MESSAGE_PATTERN` etc.) that classified the original error matches the
   stored message. `classifyTranslationError` ends with
   `if (!kind) kind = "unexpected"`, so an unrecognised message still yields a
   kind and never throws.
4. `round-trips every kind through the stored message` pins this for all five
   kinds.

**The `credentials` case deserves a note.** `403` is classified as `quota` only
when the message matches the rate-limit pattern; otherwise it is `credentials`
(spec: *"403 not matching rate-limit pattern → `credentials`, non-retryable"*).
Because the stored string is prefixed with the actionable message, a credentials
failure stored as *"Translation credentials are invalid or lack permission… (raw:
…403…forbidden…)"* re-classifies as `credentials` — the actionable prefix wins
over the raw `403`, which is the correct answer.

## 6. How the breakdown is labelled

The bell's query is bounded by `TRANSLATION_ATTENTION_LIMIT` (20) while the
badge counts `totalDocs` (the true backlog). `translationError` is free text, so
there is **no** server-side `where` that filters by kind — the breakdown can only
be computed from the rows actually fetched. The rendering says so.

Rendered output, produced by running the real pure functions over 20 synthetic
`failed` rows against a backlog of 47
(`.conductor/evidence/phase6-render.test.ts`, output verbatim):

```
COUNTS: {"quota":13,"network":1,"timeout":1,"credentials":3,"unexpected":1}
LINES (shown 20 of backlog 47):
  Failure kinds across the 20 reviews shown, not the whole backlog of 47:
  13 quota
  1 network
  1 timeout
  3 credentials
  1 unexpected
```

In the admin bell this appears as a small block directly under the
"Translations needing attention" heading.

**Why this labelling is not misleading given the 20-row sample:**

- The scope line states the denominator explicitly — *"across the 20 reviews
  shown"* — so `13 quota` is read as 13 of the 20 shown, never as 13 of 47.
- When the page is truncated, the line also states the backlog total (*"not the
  whole backlog of 47"*), so the operator can see at a glance that the counts
  are a sample.
- When the fetched page **is** the whole backlog (`totalCount <= shownCount`),
  the clause is dropped and the line reads *"Failure kinds across the 20 reviews
  shown:"* — the two cases are distinguishable by the text itself.
- The badge is untouched and still reads `47` (the `totalDocs` backlog). The
  breakdown and the badge therefore never contradict each other: one is a
  sample, one is the total, and each says which it is.
- No number in the breakdown can be mistaken for a backlog total, because every
  count sits under a line that names the sample it belongs to.

## 7. Evidence paths and commits

| Item | Path / SHA |
|---|---|
| This report | `conductor/tracks/20261025-translation-quota-resilience/verification/phase-6.md` |
| Classification + breakdown in the attention data | `7fcc937` — `feat(admin): classify attention failures by kind in the attention data` |
| Bell render of the breakdown | `4505c24` — `feat(admin): show the failure-kind breakdown in the attention bell` |
| Round-trip test | `543e44c` — `test(admin): prove every failure kind round-trips through the stored message` |
| Base | `75a8a54` |
| Head | `543e44c` |
| Ad-hoc render helper (gitignored) | `.conductor/evidence/phase6-render.test.ts` |

Files changed:

- `src/components/admin/translation-attention.ts` (Touches)
- `src/components/admin/__tests__/translation-attention.test.ts` (Touches)
- `src/components/admin/TranslationAttentionBell.tsx` (deviation — see §8)

`src/lib/translation-errors.ts` was in `Touches` and was **not** modified: the
existing classifier and its `unexpected` fallback already provide everything the
phase needs, and the brief says to reuse the classifier rather than change it.

## 8. Deviations

| File | Reason |
|---|---|
| `src/components/admin/TranslationAttentionBell.tsx` | Outside `Touches`, and the brief names this as an expected deviation. T2.1 is a UI requirement and the pure logic in `translation-attention.ts` cannot render itself. The edit is 22 added lines and touches nothing else: two new imports, one derived `const`, and one conditional block that maps the breakdown lines to `<div>`s. The poll, the fetch, the `where` clause, the `totalDocs` badge, `formatAttentionBadgeLabel` and the item list are all unchanged, and the component is not restructured. It stays on inline styles — no Tailwind class was introduced, matching the file's existing approach. |

## 9. Notes

### Judgement calls

- **The breakdown is a list of lines, not one string.** The first implementation
  produced a single comma-joined label
  (`"… not the whole backlog of 47: 3 quota, 1 network"`). T2.1 asks for quota
  as a *distinct line*, and a comma-joined string makes the reader parse the
  line to tell one cause from another — which is precisely the thing FR-9
  exists to stop. The API is therefore `formatAttentionKindBreakdownLines`,
  returning the scope line followed by one line per kind. The renderer maps
  them to sibling `<div>`s.
- **"No kind recorded" is stated rather than left blank.** A page of `stale`
  and stuck-`pending` reviews carries no failure kind at all. The line reads
  *"none recorded"* so the operator is not left wondering whether the section
  failed to load. `stale` is not a failure and must not be reported as one.
- **Rows with no stored message are excluded from every kind, not counted as
  `unexpected`.** A `stale` review has no stored error, and a `failed` review
  with a blank message has no cause to report. Counting them as `unexpected`
  would inflate the "something is wrong, read the logs" bucket with rows that
  are not failures — the opposite of what the bell is for. `errorKind` is
  `null` for these rows and they contribute to no kind.
- **The classifier is called with `new Error(stored)`, not by changing its
  signature.** `classifyTranslationError` accepts `unknown`; the brief says to
  feed it a synthetic error carrying the stored message. Its signature is
  untouched, so Phases 1–5's tests are unaffected.
- **The counts are a pure function of the rows the caller holds.** The bell
  passes the items it just fetched; the breakdown is not cached or accumulated
  across polls, so it can never drift out of step with the list rendered below
  it.
- **The `emptyAttentionKindCounts()` initialiser is written out literally**
  rather than derived from `TRANSLATION_ERROR_KINDS`. A derived initialiser
  would keep compiling when a new kind is added and would silently report zero
  for it; the literal version breaks the typecheck, which is the property T1.2
  asks for ("so the renderer cannot silently miss a kind").
- **Test placement.** New cases were added to the existing
  `describe("translation-attention")` block as two new nested describes
  (`summarizeAttentionErrorKinds`, `formatAttentionKindBreakdownLines`). The
  file was not restructured; the pre-existing 22 cases for
  `needsTranslationAttention`, `buildAttentionWhere`, `buildReviewEditURL`,
  `formatAttentionBadgeLabel` and `extractAttentionDocs` are unchanged, except
  that the `extractAttentionDocs` item-shape assertion was extended with the
  two new item fields (`translationError: null`, `errorKind: null`).

### Is the honest presentation awkward? Yes — stated plainly

The scope line is deliberately wordy: *"Failure kinds across the 20 reviews
shown, not the whole backlog of 47:"*. That is longer than a badge and it does
consume two lines of a 320px dropdown. The alternative — printing `13 quota`
under a heading like "Failure kinds" — would be cleaner and would be wrong,
because an operator with a 47-review backlog would read 13 as the backlog's
quota count and act on the wrong number. The awkwardness is the price of not
producing a number that reads as a backlog total, and I judged that the wrong
number costs more than a long label.

Two things were deliberately **not** done, and both would need a product
decision this phase does not have:

1. **No server-side per-kind counts.** `translationError` is free text, so
   there is no `where` clause that selects by kind and no count-only query to
   run. Getting a true backlog-wide per-kind count would require either a new
   stored field (a migration, out of scope per the spec) or a `like` query on
   the error text, which is fragile and expensive. The sample is the honest
   ceiling of what the current data model supports.
2. **No sort by kind.** The REST list has no `sort` today; sorting the fetched
   page by kind would not make the sample representative, so it would only
   change which rows the sample contains.

### For the reviewer

- The `translationError` field on `Reviews` is a plain `textarea` with no
  `hidden` flag and no field-level access rule, so the existing REST list
  already returns it — no query change, no migration, and no change to what the
  pipeline writes. The `Reviews.read` access rule still scopes the list to the
  signed-in admin/writer, unchanged by this phase.
- The breakdown is derived data, never persisted. Nothing here can drift from
  the stored rows.
- The only behavioural change outside the pure module is the added block in the
  bell's dropdown. The badge, the poll interval, the fetch, the abort handling
  and the item list are byte-for-byte as they were.
- The Phase 1–5 suites are untouched and still pass unchanged (676 pass, 0
  fail overall). The two `error:` lines in the test output
  (`Redis connection failed`, `connection refused`) are the deliberate
  Redis-failure fallback paths those suites assert on, not failures.
- A residual worth knowing: a review whose `translationError` was written by an
  older build, or edited by hand in the admin UI, may classify as `unexpected`
  even when the underlying cause was quota. That is the intended honest
  fallback, and the raw message stays on the item (`item.translationError`) for
  whoever looks next.

### Non-blocking observation carried forward

1. **The bell's own list is still status-only.** Each row shows
   `title` + `translationStatus`; the kind is only visible in the summary
   block, not per row. Showing the kind on the row itself would be a further
   UI change beyond T2.1, and it would also mean surfacing the raw
   `translationError` in the admin UI, which is a judgement call about
   exposing provider detail. Low; flagged for review rather than taken on here.

## Primary verification

Re-run by the primary on the squashed checkpoint `7032e23` (base `75a8a54`), independent of the subagent's own run.

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| Static | `bun run typecheck` | 0 | No type errors in 252 files (421.17ms) |
| Static | `bun run lint` | 0 | Checked 243 files, no fixes applied |
| Unit | `bun test` | 0 | 676 pass, 0 fail, 1587 expect() calls, 49 files (2.26s) |

**Reviewed directly, not taken on trust.**

- `TranslationAttentionItem` gains `translationError` and `errorKind`; `extractAttentionDocs` populates both, and `errorKind` is `null` for a blank or missing message rather than defaulting to a kind. That distinction matters: a `stale` or stuck-`pending` review is not a failure, and counting it as `unexpected` would inflate the one bucket that means "go read the logs".
- `deriveErrorKind` feeds the **stored string** to the existing `classifyTranslationError` via a synthetic `Error`. No new field, no migration, no change to what the pipeline persists — the persisted format stays the single source of truth, which is what FR-9 asked for.
- `emptyAttentionKindCounts` spells out all five keys literally instead of deriving them, so adding a kind to `TRANSLATION_ERROR_KINDS` breaks the typecheck here rather than silently reporting zero. That is the correct failure direction for a renderer.
- `formatAttentionKindBreakdownLines` emits a scope line naming the sample, then one line per kind present, and returns `[]` when nothing is shown (so it cannot render above the empty state). The scope line names the true backlog whenever `totalCount > shownCount`.
- The bell diff is 22 added lines: two imports, one derived const, one conditional block. The poll, the fetch, the `where` clause, the `totalDocs` badge, `formatAttentionBadgeLabel` and the item list are untouched, and it stays on inline styles. The deviation is proportionate to T2.1 and is recorded.
- `src/lib/translation-errors.ts` was in `Touches` and was correctly **not** modified: the classifier and its `unexpected` fallback already did the job, and changing it would have violated the brief's instruction to reuse it.

**Result: verified.** AC-9 is satisfied by direct test evidence (quota separated from network/timeout/credentials/unexpected, and the unclassifiable-message fallback pinned), and FR-9 by the code. No existing test was weakened; the phase's own suite went from 18 to 36 cases.

Three non-blocking observations carried to review:

1. **The breakdown describes a 20-row sample, and the only honest fix is a product decision.** `translationError` is free text, so no `where` clause can filter by kind and no cheaper backlog-wide count exists. A true per-kind backlog total needs a stored kind field — which the spec puts out of scope. The labelling is honest today; the underlying limitation should be a known one, not a surprise. Low, but worth recording so nobody later "fixes" the label into a bare number.
2. **A pre-existing or hand-edited `translationError` can classify as `unexpected` when the real cause was quota.** This is the intended fallback and the raw message is preserved on the item, but it means the breakdown can under-report quota failures written by an older build. Low.
3. **The bell's list rows are still status-only** — the kind is visible in the summary block but not per row. Showing it per row would mean surfacing raw provider text in the admin UI, a judgement call beyond T2.1. Low.