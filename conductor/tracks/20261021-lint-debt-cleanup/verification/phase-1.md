# Phase 1 Verification — Translation Stack Typing (production)

- **Track:** 20261021-lint-debt-cleanup
- **Phase:** 1 — Translation Stack Typing (production)
- **Date:** 2026-10-21
- **Branch:** `refactor/20261021-lint-debt-cleanup`
- **Base commit:** `4f208e0`
- **Head commit:** `7986d17`
- **Result:** ✅ PASS — all 27 Phase 1 `noExplicitAny` warnings eliminated; typecheck, lint and unit tests green.

## Commands

| Layer | Command | Exit | Summary |
|---|---|---|---|
| Typecheck | `bun run typecheck` | 0 | `bun check` — 0 type errors in 174 files |
| Lint | `bun run lint` | 0 | `biome check .` — **40 warnings** (baseline 67), 0 errors |
| Unit tests | `bun test` | 0 | 236 pass, 0 fail (454 expect calls, 22 files) |
| Full gate | `bun run typecheck && bun run lint && bun test` | 0 | All three green in one chain |
| AC-5 probe | grep `: any\|as any\|any\[\]\|eslint-disable` over the four touched files | 0 hits | Only prose comments contain the word "any" |

Note: every `git commit` also re-ran the full gate via the repo pre-commit hook (4/4 commits green).

## Acceptance criteria

| ID | Criterion | Evidence | Status |
|---|---|---|---|
| P1 goal | All 27 `noExplicitAny` in translate.ts (12), translateReview.ts (9), retranslate.ts (4), utils.ts (2) eliminated | Lint after: translate.ts, translateReview.ts, retranslate.ts, utils.ts no longer appear in Biome output; `Found 40 warnings` (67 − 27 = 40) | ✅ |
| Spec FR-1 | `any` replaced with concrete types (Payload generated types for domain data; `unknown`-backed structural narrowing at boundaries) | `Review` from `src/payload-types.ts` used in translateReview.ts / retranslate.ts; structural `RichTextNode`/`RichTextDocument` with `unknown` index signature in translate.ts / utils.ts | ✅ |
| Spec FR-4 | Dead `eslint-disable-next-line @typescript-eslint/no-explicit-any` comment lines removed | 0 eslint-disable comments remain in the four touched files (incl. the file-level disable in utils.ts) | ✅ |
| Spec NFR-1 | No runtime behavior change | All 236 unit tests pass unchanged; diff is type-only except documented edge-guard changes (see Deviations) | ✅ |
| Spec NFR-2 | Typecheck passes | 0 errors | ✅ |
| Spec NFR-3 | All 236 unit tests pass | 236 pass / 0 fail | ✅ |
| Plan gate | Warnings strictly below 67 baseline, no new rules weakened | `biome.config.json` untouched; 40 warnings | ✅ |
| Spec AC-4 (e2e) | Deferred to Phase 3 per plan | — | ⏭ Phase 3 |

## Per-task commits

| Task | File(s) | Commit |
|---|---|---|
| P1.T1 translate.ts (12 warnings) | `src/lib/translate.ts` | `a41a825` |
| P1.T2 translateReview.ts (9 warnings) | `src/hooks/translateReview.ts` | `a9c9215` |
| P1.T3 retranslate.ts (4 warnings) | `src/lib/retranslate.ts` | `a2bd8ff` |
| P1.T4 utils.ts (2 warnings) | `src/lib/utils.ts` (+ `src/lib/feed.ts`) | `7986d17` |

## Approach notes

- **Structural rich text types.** `RichTextNode`/`RichTextDocument` are index-signature-only views of serialized Lexical documents (`[key: string]: unknown`), narrowed at use sites with `typeof`/`Array.isArray`. This shape was chosen because it is assignable in **both** directions with zero casts: the generated `Review` rich text fields assign *into* it (Payload nodes carry their own `[k: string]: unknown` index signature), and it assigns *into* the `DeepPartial` shapes Payload's local API `data` expects. Declaring optional members (e.g. `version?: number`) on the structural type breaks the second direction — verified empirically during a probe.
- **Overloads preserve null-propagation semantics.** `translateRichText` / `syncRichTextFormat` expose two overloads: non-null input ⇒ non-null output (matches Payload's non-nullable required fields), nullable input ⇒ nullable output (matches the original `any`-typed pass-through of null/undefined guards, which tests rely on).
- **Where types came from.** `src/payload-types.ts` regeneration was NOT needed — `Review` covers every consumed field. Lexical's exported serialized types were inspected but are unsuitable for generic traversal (base node type has no `children`/`text`, no discriminated union), so the small structural type is used instead.
- **utils.ts keeps its own copy of the two tiny interfaces** rather than importing from `translate.ts`, because `cn()` is used by client components and importing `translate.ts` (Google Cloud Translate + redis + node `crypto`/`fs`) into the `cn` import chain would pull server-only modules into the client bundle.

## Deviations

1. **`src/lib/feed.ts` (outside Touches).** Typing `extractTextFromRichText(content: RichTextDocument | null | undefined)` made feed.ts's `getReviewExcerpt(richText: unknown)` pass-through a compile error. Smallest fix: exported `RichTextDocument` from `utils.ts`, imported it in feed.ts, and typed `FeedReview.reviewContent?: RichTextDocument | null` and the `getReviewExcerpt` parameter. Type-only; no runtime change; all feed tests pass unchanged.
2. **`RetranslateResult.translationStatus?: string | null`** (retranslate.ts). Widened from `string` to mirror the nullable generated field instead of coalescing `null` → `undefined` (which would change JSON serialization of the endpoint response). Interface-only; runtime-identical.
3. **Defensive edge guards in traversal** (translate.ts, utils.ts): truthy checks `if (node.text)` / `if (node.children)` replaced by `typeof node.text === "string"` / `Array.isArray(node.children)`. Identical output for every well-formed Lexical document (including empty-string text nodes); for malformed input the functions now return `""`/skip instead of potentially throwing inside a `.map`. Recorded per spec's "latent bugs fix only if trivial + behavior-preserving" allowance.
4. **Leftover scratch files.** `src/scratch-assignability.ts` and `src/scratch-overload.ts` are empty untracked leftovers from assignability probes; shell deletion was denied by the permission system (only `git`/`bun run`/`bun test` commands are allowed). They are empty, lint-clean, typecheck-clean and untracked — please delete them. `.conductor/evidence/scratch-assignability.ts` (gitignored) is likewise a probe leftover.

## Evidence paths

- `conductor/tracks/20261021-lint-debt-cleanup/verification/phase-1.md` (this file)
- Lint evidence: `bun run lint` output captured in session — `Found 40 warnings` / `Found 4 errors` before import-order+format fixes, `Found 40 warnings` / 0 errors after; baseline 67 warnings measured 2026-10-21.
- Typecheck evidence: `bun check` — `✓ No type errors in 174 files`.
- Test evidence: `bun test` — `236 pass, 0 fail, 454 expect() calls, 22 files`.

## Primary verification (primary agent, independent)

- Date: 2026-10-21
- Working tree: clean after subagent commits (two untracked scratch probe files deleted by the primary agent)
- Files changed vs Touches: only src/lib/feed.ts outside Touches — accepted deviation 1 (smallest necessary type-only fix)
- Commands run by the primary agent:
  - un run typecheck — exit 0, 0 type errors
  - un run lint — exit 0, **40 warnings** (baseline 67), 0 errors
  - un test — 236 pass / 0 fail (22 files)
  - un run build — exit 0 (required starting Docker services first: PostgreSQL/Redis were down; see below)
  - AC-5 probe (independent grep for : any|as any|any[]|eslint-disable over the four touched files) — 0 hits
- Environment note: the first un run build attempt failed with connect ECONNREFUSED 127.0.0.1:5432 — PostgreSQL was not running (environment, not a code defect). Docker Desktop was started, docker compose up -d brought up postgres + redis, and the rebuild passed with exit 0.
- Result: **verified** — phase accepted.
