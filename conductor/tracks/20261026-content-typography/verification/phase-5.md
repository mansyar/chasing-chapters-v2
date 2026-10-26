# Phase 5 Verification - Card consolidation

- **Track:** `20261026-content-typography`
- **Phase:** 5 of 5 - Card consolidation
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base:** `6de0f4571f4e953291b062825828afcfacde5c29`
- **Head:** `3a978f9` (squashed)

## 1. Result: PASS

One shared base now carries the whole-card link, the card surface and the hover
lift, and both content cards are built on it. The reading-lists index no longer
has an inline card variant - it renders `ReadingListCard` - and the exports and
copy this track left without a consumer are gone.

The phase was executed by the primary agent, not a `conductor-phase` subagent:
the subagent pool was out of credits when the phase started. `conductor-implement`
allows that when no subagent is available, and the implementer/verifier
separation the workflow assumes did not hold, so every claim below is either a
command output or a quoted source line rather than a report to be trusted.

## 2. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | `No type errors in 265 files` |
| static | `bun run lint` | 0 | `Checked 258 files. No fixes applied.` |
| unit | `bun test` | 0 | 809 pass, 0 fail, 58 files |
| e2e | `bun run test:e2e` | 0 | 112 passed, 0 failed, 0 flaky |

The combined phase command `bun run typecheck && bun run lint && bun test &&
bun run test:e2e` exits 0.

The lint layer failed twice before it passed, both times on formatting only: the
import order in `card.tsx` and the multi-line export block Biome wanted
collapsed. Fixed with `bunx biome check --write` on the four touched files
(`Checked 4 files. Fixed 1 file.`), no behavioural edit. That is one fix within
the two-attempt budget.

The unit count is unchanged at 809 because this phase adds no test: the plan's
P5 tasks are a refactor and a deletion, and the behaviour they preserve is
already covered. What guards the outcome is the e2e suite plus typecheck, not a
new assertion - recorded here so the flat count is not read as "nothing ran".

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AC-6 | `ReviewCard` and `ReadingListCard` share one base card, the index renders `ReadingListCard`, no inline variant remains | `card.tsx` `CardLink`; both cards' JSX opens with `<CardLink`; `reading-lists/page.tsx:83` renders `<ReadingListCard`; `git grep` finds no inline card markup in the index | covered |
| FR-7 | One visual language across the surfaces that show a card | both cards take their surface, hover lift and clipping from the same `CardLink`; the index and the reading-list detail page now render the same component | covered |
| FR-8 | Exports left without an importer by this track are removed | `CardAction` and `CardDescription` deleted from `card.tsx` and its export list; `readingListsNoImage` deleted from both locales; `git grep` returns nothing for either name | covered |
| NFR-5 | Existing tests pass, none deleted or weakened | 809 pass, 0 fail, 58 files - the same count and file set as before the phase | covered |
| NFR-4 | No new runtime dependency | `package.json` untouched; `next/link` was already a dependency of the app | covered |

## 4. The shared base

`CardLink` is the markup `ReviewCard` and `ReadingListCard` had duplicated
character for character:

```tsx
<Link className={cn("group block h-full", className)} {...props}>
	<Card className="h-full overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card">
		{children}
	</Card>
</Link>
```

It lives in `card.tsx` rather than a new file because that file is the card
primitive and it is in the phase's `Touches`; a new component elsewhere would
have been outside them. `Card` is defined later in the file, which is fine - both
are function declarations and hoist.

Every card class string is preserved verbatim, including the `bg-card` that
looks redundant beside `Card`'s own background but is not: `border-none` and the
hover shadow are what make the surface read as a card rather than a bordered
box, and dropping any of them would be a visible change this phase did not
promise. So the refactor is visually neutral **for the two existing cards**.

## 5. The reading-lists index change, and why it is visible

The index's inline variant was not the same card. It was `bg-transparent` with
`hover:bg-muted/30`, no book-count badge, `rounded-xl shadow-md` on the cover
inside a `bg-black/20` overlay, `pt-6 px-2` content padding, a `text-2xl` title
and a `readingListsNoImage` text fallback.

Adopting `ReadingListCard` there therefore changes what a reader sees: the card
gains the book-count badge, becomes a filled card with the standard hover lift,
and its title drops from `text-2xl` to `text-lg`.

That was a decision, not a side effect, and it was put to the user before any
code was written. The user chose to adopt `ReadingListCard` as-is, on the
grounds that the index was the odd one out and one visual language across the
site is what FR-7 asks for. Recorded here because a reviewer comparing
screenshots should find the change explained rather than unexplained, and
because "keep each surface's visual outcome" (P5.T1.3) is only true of the two
existing cards - the index deliberately changed.

## 6. What was deleted, and the check that it was dead

| Deleted | Why it was safe |
| --- | --- |
| `CardAction` | `git grep -n "CardAction" -- src` returned only its definition and the export list - no importer, no usage |
| `CardDescription` | same check, same result |
| `readingListsNoImage` (`"No Image"` / `"Tanpa Gambar"`) | its only consumer was the inline index variant this phase removed; `git grep` afterwards returns nothing |

Removed from both locales together, so the dictionary parity test's
identical-key-set assertion still holds.

One thing deliberately **not** deleted: `CardHeader` still carries
`has-data-[slot=card-action]:grid-cols-[1fr_auto]`, which can no longer match
now that `CardAction` is gone. It is a CSS hook inside a utility-class string
rather than an export, and FR-8 is scoped to exports left without an importer.
Leaving it is the narrower change; a reviewer who disagrees can remove it in one
line. Flagged rather than silently tidied, because a future `shadcn add card`
would regenerate the component anyway.

## 7. Files changed

| File | Change |
| --- | --- |
| `src/components/ui/card.tsx` | added `CardLink`; deleted `CardAction`, `CardDescription` and their exports |
| `src/components/ReviewCard.tsx` | JSX rewritten onto `<CardLink>`; dropped `Link`, `Card`, `cn` imports |
| `src/components/ReadingListCard.tsx` | JSX rewritten onto `<CardLink>`; dropped `Link`, `Card`, `cn` imports |
| `src/app/(public)/[locale]/reading-lists/page.tsx` | inline variant replaced by `ReadingListCard`; dropped `Image`, `Link`, `Card`, `CardContent`, `resolveMediaUrl` imports, kept `Media` (still used by the item-list schema) |
| `src/lib/i18n/dictionary.ts` | removed the orphaned `readingListsNoImage` key from both locales |

## 8. Deviations

None from the plan's file set: all five files are inside the phase's `Touches`
(`card.tsx` and the reading-lists index are both listed). The dictionary key
removal is the one addition, and it is the same class of change P5.T2.1 asks
for - an export this track left without a consumer - applied to a dictionary key
rather than a component export.

The phase being executed by the primary is a deviation from the normal
implementer/verifier split, forced by the credit exhaustion. It is recorded at
the top of this file rather than buried here.

## 9. Notes - what is not proven

- **No rendered assertion on the consolidation.** There is no React test harness
  in this repo, so "both cards look the same" rests on the two cards taking
  their surface from one function plus 112 e2e tests that render both surfaces
  and pass. A reviewer comparing the two cards' remaining JSX will see only
  their differing content, not differing chrome - that is the strongest
  available check and it is a source check.
- **The index's new look was not reviewed visually.** It was described to the
  user in prose (badge gained, filled surface, smaller title) and approved on
  that basis. Nobody has looked at a screenshot. If the badge crowds the cover
  at small widths, that is a real risk this phase cannot see.
- **`has-data-[slot=card-action]` is now unreachable** (section 6).
- **The e2e suite asserts neither card's internals**, only that the pages render
  and their links work, so it would not catch a card that rendered with the
  wrong padding. It does catch a card that fails to render at all, which is the
  failure mode a refactor of this shape actually has.
