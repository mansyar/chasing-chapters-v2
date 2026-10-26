# Phase 1 evidence — Boundaries, locale resolution, Sentry reporting + unit tests

- Track: 20261027-route-error-boundaries — Route error boundaries
- Phase: 1
- Date: 2026-10-27
- Branch: feat/20261027-route-error-boundaries
- Base commit: 113b007ea81152a91c42d43a45b53e5159df676c
- Head commit: (uncommitted — git requires shell access, which is denied in
  the executor environment; the primary should review, verify, and commit)
- Result: **blocked** — implementation complete, verification not runnable here

## What was built

- `src/lib/i18n/dictionary.ts` — four `error*` entries (`errorTitle`,
  `errorDescription`, `errorTryAgain`, `errorBackHome`) added to both the `en`
  source of truth and the `id` translation. Existing key-parity tests cover
  them automatically.
- `src/lib/error-locale.ts` (new, client-safe) — `parseAcceptLanguage`
  (quality values, region subtags, drops `q=0`/wildcard/malformed),
  `resolveErrorLocale` (cookie → header → English), `readCookieValue` (pure
  cookie-header parsing), `resolveBrowserErrorLocale` (cookie → `navigator`
  language → English, SSR-safe), `ERROR_COPY` (client-safe mirror of the four
  error strings), `reportErrorToSentry` (capture with route/locale extra,
  never throws).
- `src/components/error-content.tsx` (new, client) — shared presentational
  boundary UI: `role="alert"`, serif title, description, Try Again button +
  Back Home link. Reads copy from `ERROR_COPY`; renders no error internals.
- `src/app/(public)/[locale]/error.tsx` (new, client) — segment boundary:
  valid URL locale wins, otherwise cookie → browser language → English;
  reports to Sentry with the pathname; renders `ErrorContent` with reset +
  `/{locale}` home.
- `src/app/global-error.tsx` (rewritten, client) — root boundary owning its
  own `<html>`/`<body>` shell (mirrors `not-found.tsx`, next/font
  Inter/Playfair); resolves locale without layout help; reports with route
  `"global"`; offers reset + home.
- `src/lib/__tests__/error-locale.test.ts` (new) — 13 unit tests: header
  parsing, resolver precedence/fallback, cookie parsing, SSR fallback,
  dictionary parity lock, Sentry route context, Sentry-failure isolation
  (Sentry stubbed via `mock.module`, following the repo's translate-test
  precedent).

## Commands

| Layer | Command | Exit | Summary |
| ----- | ------- | ---- | ------- |
| typecheck + lint + unit | `bun run typecheck && bun run lint && bun test` | not run | Blocked: shell access is denied in the executor environment (`Permission denied: shell`), so the verification command could not be executed. The primary must run it and hand back output. |

## Acceptance criteria

| ID | Criterion | Evidence | Status |
| -- | --------- | -------- | ------ |
| FR-1 | Segment + root boundaries render the branded bilingual UI | `error.tsx`, `global-error.tsx`, `error-content.tsx`, dictionary `error*` entries | Implemented, verification pending |
| FR-2 | Reset + home actions on both boundaries | `onRetry={reset}`, `homeHref={`/${locale}`}` in both boundaries | Implemented, verification pending |
| FR-3 | Locale via `NEXT_LOCALE` cookie → header → English fallback | `resolveErrorLocale`, `resolveBrowserErrorLocale`, `readCookieValue` + unit tests | Implemented, verification pending |
| FR-4 | Sentry reporting with route context | `reportErrorToSentry` + unit tests (route extra, throw isolation) | Implemented, verification pending |
| AC-3 | Error UI renders with recovery actions in both locales | `ErrorContent` + `ERROR_COPY` parity test | Implemented, verification pending |
| AC-4 | Errors reported to Sentry with route context | `reportErrorToSentry` call in both boundaries' `useEffect` | Implemented, verification pending |
| AC-5 | UI renders even if Sentry fails | `try/catch` in `reportErrorToSentry` + no-throw unit test | Implemented, verification pending |

## Evidence paths

- `src/lib/error-locale.ts`
- `src/lib/__tests__/error-locale.test.ts`
- `src/lib/i18n/dictionary.ts` (error section, `en` + `id`)
- `src/components/error-content.tsx`
- `src/app/(public)/[locale]/error.tsx`
- `src/app/global-error.tsx`

## Deviations

- Segment boundary prefers a *valid URL locale* first, then cookie → browser
  language → English. The spec's cookie → header → English chain is preserved
  as the fallback; segment priority prevents showing the wrong language when
  the URL locale is valid (e.g. cookie `en` while browsing `/id/...`).
  Smallest change achieving correctness; no files outside `Touches`.
- No files outside `Touches` were modified. No commits were made (git needs
  shell, denied). No verification commands could be run (shell denied).

## Notes

- The client boundaries cannot import the server dictionary (repo convention,
  enforced by `dictionary-source.test.ts`), hence the `ERROR_COPY` mirror with
  a parity test that fails on drift.
- Server prerender of a boundary resolves English (no browser signals), then
  hydrates to the resolved locale; `suppressHydrationWarning` is set on the
  root shell. Segment-valid URLs resolve identically on server and client, so
  no mismatch in the common case.
- `import * as Sentry` in the client-safe lib follows the pre-existing
  `global-error.tsx` pattern; reporting stays UI-independent by construction.
## Primary verification

The phase subagent had no shell/git access, so the primary ran the phase
verification command directly and applied the formatter:

- `bun run typecheck` → exit 0, no type errors in 271 files.
- `bun run lint` (`biome check .`) → initially 3 formatting findings
  (`metadata.json` single-line scaffold artifact, `global-error.tsx`,
  `error-locale.ts`); fixed with `biome check --write`, re-run clean over
  265 files.
- `bun test` → 830 pass, 0 fail across 59 files (the `database is down`
  line is expected console output from a passing rejection-path test).

Accepted deviation: the segment boundary prefers a valid URL locale before
the cookie→header→EN chain. This is the smallest change achieving correct
language selection and preserves the spec chain as the fallback.

- Result: **verified**
- Checkpoint: recorded in plan.md
