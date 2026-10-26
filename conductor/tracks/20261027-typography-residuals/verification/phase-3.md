# Phase 3 Evidence — Dead hook removal + plugin guard test

- **Track:** 20261027-typography-residuals — Typography residuals
- **Phase:** 3 — Dead hook removal + plugin guard test
- **Date:** 2026-10-27
- **Branch:** refactor/20261027-typography-residuals
- **Base:** 595912f2fdc6fbea654c805792a7eaf213c8edbf
- **Head:** a20672b (guard-test commit; hook-removal commit a1572be)
- **Result:** verified

## Summary

`CardHeader` no longer carries the `has-data-[slot=card-action]` grid variant —
`CardAction` was deleted in the typography track, so the hook could never match,
and the rest of the class list is byte-identical. `prose-teal` coverage is now
pinned to the installed plugin: a new guard in `typography-source.test.ts`
enumerates the distinct `--tw-prose-*` variables from the installed
`@tailwindcss/typography`'s own `src/styles.js` (36 today) and asserts each one
is assigned inside the `@utility prose-teal` block, so a plugin upgrade that
adds or renames a variable fails loudly naming it instead of silently
untheming. No existing assertion was touched.

## Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| static | `bun run typecheck` | 0 | No type errors in 278 files |
| static | `bun run lint` | 0 | Checked 272 files. No fixes applied. |
| unit | `bun test` | 0 | 841 pass, 0 fail, 61 files |
| unit (targeted) | `bun test src/lib/__tests__/typography-source.test.ts` | 0 | 14 pass, 0 fail (13 pre-existing + 1 new guard) |

The full command was run exactly as specified:
`bun run typecheck && bun run lint && bun test`.

## Findings

| Task | What changed | Test | Status |
| --- | --- | --- | --- |
| P3.T1 (FR-4, AC-6) | Deleted `has-data-[slot=card-action]:grid-cols-[1fr_auto]` from `CardHeader` in `src/components/ui/card.tsx`; nothing else in the class list changed | Phase 1 `card-chrome.test.ts` passes unchanged (part of the 841); `grep card-action src` returns no matches | done |
| P3.T2.1 (FR-5, AC-7) | New `prose-teal plugin coverage` guard in `src/lib/__tests__/typography-source.test.ts`: reads the installed plugin's `src/styles.js`, extracts the distinct `--tw-prose-*` vars, slices only the `@utility prose-teal` block (brace-matched, so assignments elsewhere cannot satisfy it), and asserts each var is assigned there | New test passes (14/14 in the file); full suite 841 pass, 0 fail | done |

## Evidence paths

- `src/components/ui/card.tsx` (commit a1572be)
- `src/lib/__tests__/typography-source.test.ts` (commit a20672b)
- Installed plugin source enumerated by the guard:
  `node_modules/@tailwindcss/typography/src/styles.js`

## Deviations

None. Both changes stayed within the `Touches` paths. The guard was added to
the existing `typography-source.test.ts` rather than a new file, since that
file already holds the CSS-contract and prose-free guards — the layout match
the brief asked for.

## Notes

- The guard asserts coverage of whatever the installed plugin exposes (no
  pinned version, no exact count), per the brief: it fails on an empty
  extraction (plugin moved its variables) and per-variable `toContain`, so a
  failure names the missing variable.
- Counts reconcile with Phase 2 evidence (840 pass → 841 pass: exactly the one
  new guard test; no existing test added, removed, or weakened).

## Primary verification

The primary independently verified the subagent's report:

- Working tree held only the two phase commits plus the phase evidence file —
  nothing uncommitted, nothing extra.
- `git show` of each commit confirmed the changes stay inside `Touches`:
  one-line hook removal in `src/components/ui/card.tsx`; guard test appended
  to `src/lib/__tests__/typography-source.test.ts` with all pre-existing
  assertions untouched (append-only diff).
- `grep "card-action" src` returns no matches — the dead hook is fully gone,
  satisfying AC-6.
- The guard enumerates distinct `--tw-prose-*` vars from the installed plugin's
  `src/styles.js` (36 today), brace-matches only the `@utility prose-teal`
  block, asserts each var assigned there, and fails on empty extraction —
  satisfying AC-7 and the FR-5 no-codegen decision.
- Re-ran the full Verification command: `bun run typecheck` exit 0 (no errors,
  278 files), `bun run lint` exit 0 (272 files), `bun test` 841 pass / 0 fail
  across 61 files (840 pre-existing + the one new guard; the `database is down`
  line is a passing negative-path log in `moderation.test.ts`, not a failure).
