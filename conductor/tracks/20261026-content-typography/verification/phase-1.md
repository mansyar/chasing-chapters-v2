# Phase 1 Verification — Typography Foundation

- **Track:** `20261026-content-typography`
- **Phase:** 1 of 5 (Typography foundation — FR-1, FR-2, AC-1; NFR-2, NFR-4)
- **Date:** 2026-10-26
- **Branch:** `feat/20261026-content-typography`
- **Base commit:** `bca3a8bd9abac8d41f065dbf1b204d1908c111b8`
- **Head commit:** `7eb9e92a550145b4fffb7f245fafd2a9080212dd`
- **Commits:**
  - `9d2ef245d818a8949cc51c1e421f364f82a018cf` — `feat(typography): install and theme the typography plugin on site tokens`
  - `7eb9e92a550145b4fffb7f245fafd2a9080212dd` — `feat(typography): resolve the eight prose usages and add the AC-1 source test`

## Result: PASS

All four verification layers green. The typography plugin (`@tailwindcss/typography@0.5.20`) is installed as a devDependency, registered via `@plugin`, and themed onto the site token set through a documented `@utility prose-teal` block. All eight `prose` usages are deliberately resolved: five keep prose with the token theme, three switch to deliberate non-prose styling.

## Commands

| Layer  | Command                                                            | Exit | Summary                                                                                     |
| ------ | ------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------- |
| static | `bun run typecheck`                                                 | 0    | No type errors in 259 files                                                                  |
| static | `bun run lint`                                                      | 0    | Biome check clean (after 1 formatting fix to the new test file)                              |
| unit   | `bun test`                                                          | 0    | Full suite passes, including the new `typography-source.test.ts`                             |
| unit   | `bun test src/lib/__tests__/typography-source.test.ts`              | 0    | 4 pass / 0 fail / 14 expect() calls                                                          |
| e2e    | `bun run test:e2e`                                                  | 0    | Production standalone build compiled with the `@plugin` directive; 112 Playwright tests pass |

Full verification command, run exactly as written in the brief:

```
bun run typecheck && bun run lint && bun test && bun run test:e2e
```

Exit code 0. (Two lint retries were needed before the first successful full run — both were `biome format` reflows of the new test file, within the 2-retry budget. The pre-existing `google-gax` "Module not found" build warnings are unrelated to this phase.)

## AC table

| ID   | Criterion                                                                                                                            | Evidence                                                                                                                                                                            | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC-1 | Source test asserts the `@plugin "@tailwindcss/typography";` directive in `globals.css` and the plugin declared in `package.json`    | `src/lib/__tests__/typography-source.test.ts` (4 tests pass; also asserts the token theme exists, the plugin is NOT a runtime dependency, and the three prose-free sites stay prose-free) | PASS   |
| FR-1 | Plugin installed, registered via `@plugin`, themed to the token set; every `prose` usage styled or deliberately replaced              | Disposition table below; e2e build compiled the directive successfully; review-detail e2e specs (content display, structured sections, favorite quote) all pass                      | PASS   |
| FR-2 | Dark-mode correctness via `dark:prose-invert` plus token-driven overrides                                                           | `@utility prose-teal` sets both the base and `--tw-prose-invert-*` variable sets to the same token references; `.dark` flips the tokens, so both modes resolve correctly. Dark-mode e2e specs (language-control-a11y light/dark legibility, navigation dark mode toggle) pass | PASS   |
| NFR-2 | No layout shift on above-the-fold content from prose margins; clamped/skeleton sites look as before activation                     | Hero/carousel keep `line-clamp-3` (+ `italic` on carousel) and `text-muted-foreground text-lg`; prose's margins/max-width are gone entirely; skeleton keeps `max-w-3xl space-y-4`. The e2e homepage carousel/hydration specs pass | PASS   |
| NFR-4 | No new runtime dependency beyond the typography plugin                                                                            | `package.json`: plugin added under `devDependencies` only; source test asserts `dependencies` does not contain it; no other package changes                                            | PASS   |

## Verified theming mechanism

Read from the installed plugin source (`node_modules/@tailwindcss/typography@0.5.20`), not invented:

- **Registration:** `README.md` documents the v4 path — add `@plugin "@tailwindcss/typography";` after `@import "tailwindcss";` (the v3 `tailwind.config.js` path is dead in this Tailwind v4 app). Added at `src/app/globals.css` line 4.
- **Variable names:** `src/styles.js` — each colour theme (gray, slate, …) defines 18 base variables: `--tw-prose-body`, `--tw-prose-headings`, `--tw-prose-lead`, `--tw-prose-links`, `--tw-prose-bold`, `--tw-prose-counters`, `--tw-prose-bullets`, `--tw-prose-hr`, `--tw-prose-quotes`, `--tw-prose-quote-borders`, `--tw-prose-captions`, `--tw-prose-kbd`, `--tw-prose-kbd-shadows`, `--tw-prose-code`, `--tw-prose-pre-code`, `--tw-prose-pre-bg`, `--tw-prose-th-borders`, `--tw-prose-td-borders` — plus the paired `--tw-prose-invert-*` set of the same 18 names.
- **The invert swap:** `src/styles.js` (the `invert` modifier, ~lines 1385-1406) generates `.prose-invert { --tw-prose-body: var(--tw-prose-invert-body); … }` — `dark:prose-invert` re-points each base variable at its invert sibling.
- **Where overridden:** `@utility prose-teal { … }` in `globals.css`, following the README's documented v4 pattern for custom colour themes (custom utilities land in the utilities layer, which beats the plugin's components-layer defaults, so `prose-teal` wins over `prose`/`prose-gray` defaults without `!important`).
- **Token mapping:** every base and invert variable is set to a `:root`/`.dark` token reference (`--foreground`, `--primary`, `--muted-foreground`, `--border`, `--background`). Because the `--tw-prose-invert-*` set mirrors the base set, `dark:prose-invert` remains on the class strings (FR-2 letter) while the actual dark-mode recolouring is carried by `.dark` flipping the tokens — the swap becomes a same-token no-op that is correct in both modes. Notable choices: links/bullets/counters/quote-borders/inline code take `--primary` (teal), `pre-bg`/`pre-code` take `--foreground`/`--background` so code blocks flip with the theme.

**`prose-gray` decision: dropped.** Keeping it would fight the token theme (its fixed gray palette would need overriding at every site), and the token theme makes colouring single-sourced. Replaced by `prose-teal` at every site that keeps prose.

## Disposition of the eight `prose` sites

| #  | File / line (before)                          | Before                                                                   | After                                                                                                  | Rationale                                                                                          |
| -- | --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1  | `about/page.tsx:58`                           | `prose prose-lg dark:prose-invert text-muted-foreground`                 | `prose prose-lg prose-teal dark:prose-invert text-muted-foreground prose-p:text-muted-foreground`       | Keeps prose (T2.1). `prose-p:text-muted-foreground` preserves the muted body-text intent — the plugin paints `p` elements with `--tw-prose-body` (`--foreground`), which would have overridden the div's `text-muted-foreground`; headings/links (none today) stay token-styled |
| 2  | `reviews/[slug]/loading.tsx:57`               | `prose prose-lg max-w-3xl space-y-4`                                     | `max-w-3xl space-y-4`                                                                                   | T2.3 skeleton — bars, not prose text; prose contributed only an inert `65ch` max-width (overridden by `max-w-3xl`) and a font-size the skeleton bars ignore, so the look is unchanged |
| 3  | `reviews/[slug]/page.tsx:323` (review body)   | `prose prose-lg prose-gray dark:prose-invert max-w-3xl font-serif`       | `prose prose-lg prose-teal dark:prose-invert max-w-3xl font-serif`                                      | T2.1 keeps prose; `font-serif` and `max-w-3xl` untouched; token theme swaps the dead gray palette for brand colours |
| 4  | `reviews/[slug]/page.tsx:336` (What I Loved)  | `prose prose-sm dark:prose-invert`                                       | `prose prose-sm prose-teal dark:prose-invert`                                                           | T2.1 keeps prose; container card colours untouched (Phase 2 scope)                                  |
| 5  | `reviews/[slug]/page.tsx:347` (Could Be Better) | `prose prose-sm dark:prose-invert`                                     | `prose prose-sm prose-teal dark:prose-invert`                                                           | Same as #4                                                                                            |
| 6  | `reviews/[slug]/page.tsx:358` (Perfect For)   | `prose prose-sm dark:prose-invert`                                       | `prose prose-sm prose-teal dark:prose-invert`                                                           | Same as #4                                                                                            |
| 7  | `FeaturedHero.tsx:83`                         | `prose prose-gray dark:prose-invert max-w-none line-clamp-3 text-muted-foreground text-lg` | `max-w-none line-clamp-3 text-muted-foreground text-lg`                                               | T2.2 deliberate non-prose clamped excerpt — plain text, no links/headings to style; prose was inert here (its color/max-width were both overridden by the remaining utilities), so the look is unchanged and above-the-fold layout cannot shift |
| 8  | `ModernBookCarousel.tsx:136`                  | #7's class string plus `italic`                                          | `max-w-none line-clamp-3 text-muted-foreground text-lg italic`                                          | Same as #7, `italic` kept                                                                              |

## Evidence paths

- Source test: `src/lib/__tests__/typography-source.test.ts`
- Theming CSS: `src/app/globals.css` (`@plugin` at the head, `@utility prose-teal` after the `.dark` token block)
- Full verification output: `C:\Users\Ansyar\.local\share\opencode\shell\8ae539429bd40b66df5ea77da29b3d1efcef9f22\sh_17761e5bd001O5EK97kA0XGSzu.out` (typecheck/lint/unit/e2e, 112 passed)
- This file: `conductor/tracks/20261026-content-typography/verification/phase-1.md`

## Deviations

- None outside the brief's `Touches` list. All nine changed files are within `Touches`.

## Notes for the primary agent

- The about page gained `prose-p:text-muted-foreground` — a deliberate class addition to preserve that section's muted body-text intent under the token theme (documented above). Flagging it so it doesn't look like an accidental stray class.
- `prose-teal` deliberately sets `pre-bg`/`pre-code` from tokens, so code blocks render dark-on-light in light mode and light-on-dark in dark mode (they flip with the theme rather than staying fixed dark). If the design wants code blocks always-dark, that is a one-line follow-up.
- The `google-gax` "Module not found: package.json" build warnings pre-date this phase (import chain: translate → payload) and are untouched.
- Phase 2 (structured-section colours) was not started; those containers keep their hardcoded green/orange/blue classes.
