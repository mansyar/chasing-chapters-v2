# Phase R3 — Review Fixes (round 3)

- **Track:** `20261023-bilingual-site-experience`
- **Phase:** R3 — Review Fixes (round 3)
- **Date:** 2026-10-24
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Base:** `b7e5ceac7446b09af6384cffe85d18a04761b319` (phase base)
- **Head:** `7751466` (last source/test commit; this evidence file is the commit after it)
- **Result:** verified. All three round-3 findings are closed, and each is proven rather than
  just edited: F1 by the textless-editor-state cases (rejected in `en`, accepted in `id`, accepted
  when a paragraph carries text), F2 by the regenerated types plus the guard they forced and a
  second contract assertion, F3 by the widened seed heal and two consecutive `bun run test:e2e`
  runs from the same database (**95 passed** each). The full chain is green: 523 unit tests,
  95 browser tests, build clean. No deviations.

Covers round-3 findings **F1** (Medium), **F2** (Low) and **F3** (Low) of
`conductor/tracks/20261023-bilingual-site-experience/review.md`; the code paths they touch serve
FR-10 (localized review bodies and titles, with fallback to English).

## Commits

| Task | Commit | Subject |
| --- | --- | --- |
| R3.T1.1, R3.T1.2 | `a090f13` | `fix(validation): treat a textless editor state as a blank default-locale value` |
| R3.T2.1, R3.T2.2 | `19c65a7` | `fix(types): regenerate the payload types and guard the review body render` |
| R3.T3.1, R3.T3.2 | `7751466` | `test(e2e): clear the id body of every review the suite translates` |
| R3.T4 | this file | `docs(conductor): record phase R3 verification` |

## Commands

```
$env:DATABASE_URI="postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e"; $env:STORAGE_ADAPTER="local"; $env:NEXT_PUBLIC_R2_PUBLIC_URL=""; bun run typecheck && bun run lint && bun test && bun run test:e2e && bun run build
```

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| Types | `bun run typecheck` | 0 | `✓ No type errors in 228 files [3.42s]` |
| Lint | `bun run lint` (`biome check .`) | 0 | `Checked 220 files in 835ms. No fixes applied.` |
| Unit | `bun test` | 0 | **523 pass, 0 fail**, 1219 `expect()` calls, `Ran 523 tests across 42 files. [7.59s]` |
| Browser | `bun run test:e2e` | 0 | **95 passed (2.8m)**, three workers, standalone server on `:3100` |
| Build | `bun run build` | 0 | `▲ Next.js 16.4.2 (webpack)`, 25/25 static pages, full route table, no error |

Whole chain exit code: **0**.

### `bun run build` environment

The chain exports `DATABASE_URI` pointing at the `_e2e` database, `STORAGE_ADAPTER=local` and an
empty `NEXT_PUBLIC_R2_PUBLIC_URL`, because the local dev database cannot build (`column
reviews_locales.title does not exist`: the 20261023 migrations were never applied to it). The same
condition the previous two phases recorded. Pre-existing noise, unchanged by this phase: the two
`google-gax … Can't resolve '../../package.json'` webpack warnings, `No email adapter provided`, the
seed's `[Revalidation] … static generation store missing` lines, and the unit suite's failure-path
console output (`rate-limit`, `translate-batch`, `translation-lock`, `translate-test-mode`).

## Findings → fix → proof

| Finding | Sev. | Fix | Proof |
| --- | --- | --- | --- |
| F1 — moving `reviewContent` off `required: true` also removed the field type's own rich-text validator (Payload installs it only when `field.validate` is `undefined`), and `isBlank` only rejects `undefined`/`null`/`""` — a rich-text value is never a string, so a review saved with a textless editor state in `en` | Medium | `src/collections/requireDefaultLocaleValue.ts` — `isBlank` now branches on shape: strings by `trim()`, objects by a local `hasText`. `hasText` mirrors `@payloadcms/richtext-lexical`'s own `hasText` (read from `node_modules/@payloadcms/richtext-lexical/dist/validate/hasText.js`): no `root.children` → false; every child textless → false; a `text` node counts as empty when its `text` is not a non-blank string. Reimplemented (not imported) so the server module does not pull the editor's client code, with a comment naming `hasText` as the model. `requireDefaultLocaleValue` itself is unchanged: same messages, same non-default-locale short-circuit, so the `id` clear is still accepted unconditionally, and the `create` message still names the default locale | The three unit cases below, plus the existing `""`/`undefined` matrix still green for all `REQUIRED_DEFAULT_LOCALE` pairs |
| F2 — `src/payload-types.ts` was stale: it declared `Review.reviewContent` non-optional, while Payload derives nullability from `field.required`, which the phase moved off the field | Low | `bunx payload generate:types` regenerates `reviewContent?: { … } \| null` (2 lines changed). The forced break at `src/app/(public)/[locale]/reviews/[slug]/page.tsx:261` is fixed by rendering the body only when present: `{review.reviewContent ? <RichText data={review.reviewContent} /> : null}`, layout untouched. `e2e/global-setup.ts` drops the `null as unknown as Review["reviewContent"]` cast (and its now-inapplicable comment, and the newly unused `Review` import) for plain `null`. A contract assertion is added: `field(Reviews, "reviewContent").required` is not `true` | `bun run typecheck` exits 0 with only that one file broken before the guard; the new `it(...)` fails if the flag comes back, so a future regeneration cannot silently narrow the type again |
| F3 — the seed's healing clear was scoped on `localizedTitle`, so only the stale review healed. The `failed` fixture review has no localized title but the admin bulk spec translates it, leaving `[stub-id]` text in its `id` locale that a re-seed never cleared | Low | `e2e/global-setup.ts` — the clear is now scoped on `review.translationStatus !== "translated"` (every review with no authored Indonesian body) and returns early; the localized-title write moved out of that branch and stays unconditional on its own flag, so the stale review keeps its translated heading over an English body. `context: { skipTranslation: true }` kept on every write; the doc comment rewritten to describe the implemented rule. `e2e/content-localization.spec.ts` — the no-Indonesian-content case keeps its English-text assertion and adds `not.toContainText("[stub-id]")` on the article | Two consecutive `bun run test:e2e` runs from the same database, **95 passed** each (see below); the discriminating case is `content-localization.spec.ts:198` |

## The textless editor state (F1)

`src/collections/__tests__/localization.test.ts` — the `validate` helper's `value` widened from
`string | undefined` to `unknown`, because a `richText` field never receives a string. Two new cases
in the `content localization (FR-10)` describe:

```ts
it("treats a textless editor state as a blank default-locale value", () => {
	const textless = {
		root: { type: "root", children: [{ children: [], type: "paragraph", version: 1 }] },
	};
	const whitespaceOnly = {
		root: {
			type: "root",
			children: [{ children: [{ text: "   ", type: "text" }], type: "paragraph", version: 1 }],
		},
	};

	expect(isRejected(validate(Reviews, "reviewContent", textless, "en"))).toBe(true);
	expect(isRejected(validate(Reviews, "reviewContent", whitespaceOnly, "en"))).toBe(true);
	// The `id` locale may still clear the body and fall back to English.
	expect(validate(Reviews, "reviewContent", textless, "id")).toBe(true);
});

it("accepts an editor state that carries text", () => {
	const written = {
		root: {
			type: "root",
			children: [{ children: [{ text: "The English body.", type: "text" }], type: "paragraph", version: 1 }],
		},
	};

	expect(validate(Reviews, "reviewContent", written, "en")).toBe(true);
});
```

That is the full contract the brief asked for — textless rejected in `en`, accepted in `id`, a
paragraph of text accepted in `en` — plus the whitespace-only text node, which is the same rule the
string branch applies. The existing cases (`""` and `undefined` rejected in `en`, both accepted in
`id`, create refused in `id`) are unchanged and still green for every `REQUIRED_DEFAULT_LOCALE` pair.

## What the type regeneration changed, and the guard it forced (F2)

Regeneration touched two lines of `src/payload-types.ts`: `Review.reviewContent` went from a
required object to `?: { … } | null`. Everything else that reads the body already tolerated an
absent one (`extractTextFromRichText` in `src/lib/utils.ts` returns `""` for `null`/`undefined`, so
`FeaturedHero`, `ModernBookCarousel`, `src/lib/feed.ts` and the feed route were untouched), which is
why exactly one call site broke:

```
<RichText data={review.reviewContent} />
→ {review.reviewContent ? <RichText data={review.reviewContent} /> : null}
```

around the same `prose … font-serif` wrapper, in the review detail page's "Review Content" block —
the sibling sections (`whatILoved`, `whatCouldBeBetter`, `perfectFor`) were already guarded that
way. The fixture cast is gone with the type that required it, so the seed now says
`reviewContent: null`, which is what it means.

The added contract assertion is what keeps the fix from silently reverting:

```ts
it("leaves the review body out of `required` so its generated type stays nullable", () => {
	const body = field(Reviews, "reviewContent") as { required?: boolean };
	expect(body.required).not.toBe(true);
});
```

## Double e2e (F3)

Both runs used the same `chasing-chapters_e2e` database, so run 2 started from exactly what run 1
wrote.

| Run | Database state at start | Result |
| --- | --- | --- |
| 1 | the R2 fixture state, healed by the widened clear | **95 passed (3.1m)** — and the run itself re-translated the `failed` and `stale` reviews, writing `[stub-id] … [/stub-id]` Indonesian bodies into both |
| 2 | exactly that state: both reviews translated by the offline stub, `[stub-id]` text in their `id` locale | **95 passed (2.6m)** — the re-seed reset their status and cleared their `id` body, so `renders the English body for a review with no Indonesian content` passed the new `not.toContainText("[stub-id]")` clause |

The chained verification above ran the suite a third time against that same database and passed 95
again (**2.8m**). Under the R2 scope, run 2 is the run that fails for the `failed` review: its
`localizedTitle` is unset, so nothing cleared the stub, and the case asserted only that the English
opening is visible — which a stubbed translation also satisfies.

## Counts against the review baseline (**520 unit / 95 browser**)

- `bun test` — **523 pass / 0 fail** (baseline 520; +3 cases: two textless-state cases, one
  `required`-flag contract assertion).
- `bun run test:e2e` — **95 passed** on all three runs (baseline 95; F3 added a clause to an existing
  case, it did not add a case).
- `bun run typecheck` — 228 files, no errors.
- `bun run lint` — 220 files, no findings.

## Deviations

None. Every changed file is inside `Touches`:

`src/collections/requireDefaultLocaleValue.ts`, `src/collections/__tests__/localization.test.ts`,
`src/payload-types.ts`, `src/app/(public)/[locale]/reviews/[slug]/page.tsx`, `e2e/global-setup.ts`,
`e2e/content-localization.spec.ts`, and this evidence file. The only removal outside the edited
functions is `global-setup.ts`'s `import type { Review }`, which the dropped cast made unused (the
linter would have rejected it).

## Notes

1. The load-bearing detail of F1 is Payload's validator-installation rule, not the blank check: a
   field type's own validator (including the rich-text `hasText` guard) runs only when
   `field.validate` is `undefined`. Supplying `validate` therefore replaces it, which is why the
   local predicate had to reproduce the rule rather than rely on it. The mirror is deliberately
   shape-tolerant — it walks `children` generically instead of reproducing `hasText`'s
   one-paragraph special case — and it agrees with `hasText` on every value either one can be given:
   no children, an empty paragraph, and whitespace-only text are all textless.
2. `hasText` was read from the installed package
   (`node_modules/@payloadcms/richtext-lexical/dist/validate/hasText.js`, and
   `dist/validate/index.js` for the `if (required && hasText(value) === false)` call site), not
   imported: the package entry pulls the editor's client code into `src/collections`, which is a
   server module.
3. The seed's clear still writes `null` to five `id` fields on every non-translated review, and each
   of those writes now passes through the richer blank check. The `id` short-circuit runs before the
   check, so a clear is accepted without `hasText` ever seeing `null` in the default locale — the
   F3 heal depends on that ordering and is covered indirectly by the double run.
4. The build's `google-gax` warnings and the seed's `[Revalidation]` invariant noise are the same
   pre-existing conditions R2 recorded; nothing in this phase touched either.

## Primary verification

Re-run by the primary on the same tree after the phase reported:

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 228 files` |
| static | `bun run lint` | 0 | `Checked 220 files. No fixes applied.` |
| unit | `bun test` | 0 | **523 pass / 0 fail**, 42 files |
| e2e | `bun run test:e2e` | 0 | **95 passed (3.6m)**, 0 failed, 0 skipped |
| static | `bun run build` | 0 | 25/25 static pages |

Chain exit code 0. `b7e5cea..HEAD` is seven files: the evidence file plus exactly the six Touches,
no deviation and no unreported file.

**Checked in the code.** `requireDefaultLocaleValue` now separates the two shapes a localized field
can hand a validator: a string is blank when it trims to nothing, an object is blank when its root
carries no text — `isTextlessNode` walks `children` generically and agrees with lexical's `hasText`
on every value either can receive (no children, an empty paragraph, whitespace-only text). The
non-default-locale short-circuit still runs first, which is what keeps the fixture's `null` clear
legal, and the ordering is the reason the F3 heal works: the clear never reaches the default-locale
branch. Reimplementing `hasText` rather than importing it is the right call — the package entry
pulls the editor's client code into a server module.

`src/payload-types.ts` now declares `reviewContent?: … | null`, matching the config, and the single
render site guards it, so the next regeneration cannot turn the build red. The fixture's cast is gone
with the type that required it. The clearing write is scoped on `translationStatus !== "translated"`
and early-returns before the authored-body write, so the `failed` review heals on every seed and a
translated review keeps its authored Indonesian body.

**Residual, recorded not hidden.** The CLI rollback (`bun run payload migrate:down`) is still
unproven as a command — the shell denied it in R2 — though both `down()` bodies and their
registration order are now correct. That is a test-harness limit, not a code defect.

