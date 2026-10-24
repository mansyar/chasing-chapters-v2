# Integrated Verification — Bilingual Site Experience

- **Track:** `20261023-bilingual-site-experience`
- **Date:** 2026-10-24
- **Branch:** `feat/20261023-bilingual-site-experience`
- **Base:** `98351d54d692ea8842468df5705cc2c0be0a5c60` (`main`)
- **Head:** `00653de` (code; the doc-sync commits follow)
- **Result:** Verified — every configured layer is green, every acceptance criterion is proved by a
  test that ran in this tree

## Commands

| Layer | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `bun run typecheck` | 0 | No type errors in 228 files |
| Lint | `bun run lint` | 0 | Checked 220 files — no fixes applied |
| Unit + coverage | `bun test --coverage` | 0 | 524 pass / 0 fail across 42 files; all files 79.91 % funcs / 89.32 % lines (gate 80 % on new code — every new module is 100 % except `requireDefaultLocaleValue.ts` at 91.49 % lines) |
| Build | `bun run build` | 0 | Production build, 25/25 static pages generated in ~34 s; run against the harness database (`_e2e`, `STORAGE_ADAPTER=local`, empty `NEXT_PUBLIC_R2_PUBLIC_URL`) because the local dev database predates this track's migrations |
| E2E | `bun run test:e2e` | 0 | **95 passed / 0 failed / 0 skipped** (3.1 m) — 37 public, the rest locale/admin/a11y/content coverage |

Counts at the start of the track: 436 unit, 41 browser. Growth: +88 unit cases, +54 browser specs.

## New-code coverage

| File | Funcs | Lines | Note |
| --- | --- | --- | --- |
| `src/lib/i18n/locale.ts` | 100 | 100 | routing/`localizePath`/`isStaticAssetPath` |
| `src/lib/i18n/dictionary.ts` | 100 | 100 | key-set parity tested |
| `src/lib/i18n/format.ts` | 100 | 100 | interpolation |
| `src/lib/seo/metadata.ts` | 100 | 100 | canonical/alternates/OG |
| `src/lib/seo/sitemap.ts` | 100 | 100 | per-locale entries |
| `src/lib/seo/structured-data.ts` | 100 | 100 | `inLanguage` schemas |
| `src/lib/feed.ts` | 100 | 100 | locale-aware RSS |
| `src/collections/requireDefaultLocaleValue.ts` | 100 | 91.49 | uncovered: the create-in-another-locale path and two defensive branches |
| `src/hooks/formatSlug.ts` | 100 | 100 | non-default-locale write keeps the slug |

The all-files figure is dragged down by `e2e/global-setup.ts` (value-imported by a unit test for
`upsertCover`) and by pre-existing files; the workflow's gate scopes coverage to new code.

## Requirements

| ID | Implemented by | Verified by | Status |
| --- | --- | --- | --- |
| FR-1 path locales | `src/app/(public)/[locale]/**`, `src/proxy.ts` | `e2e/locale-routing.spec.ts` | covered |
| FR-2 remembered choice | `LanguageToggle` + `NEXT_LOCALE` (one writer, one reader) | `locale-routing.spec.ts` (persistence, shared link does not overwrite) | covered |
| FR-3 control on every page | `.first()` toggle in the navbar + review hero | `locale-routing.spec.ts` (query preserved) | covered |
| FR-4 typed dictionary | `src/lib/i18n/dictionary.ts` | `dictionary.test.ts`, `dictionary-source.test.ts` | covered |
| FR-5 document language + metadata | `[locale]/layout.tsx`, `buildPageMetadata` | `locale-metadata.spec.ts`, `metadata.test.ts` | covered |
| FR-6 reciprocal hreflang | `localeLanguageAlternates` | `locale-metadata.spec.ts`, `metadata.test.ts` | covered |
| FR-7 legacy `?locale=` | `src/proxy.ts` (308) | `locale-routing.spec.ts` | covered |
| FR-8 sitemap alternates | `src/lib/seo/sitemap.ts` | `locale-metadata.spec.ts`, `sitemap.test.ts` | covered |
| FR-9 per-locale feeds | `[locale]/feed.xml/route.ts`, `/feed.xml` 308 | `locale-metadata.spec.ts`, `feed.test.ts` | covered |
| FR-10 localizable content + fallback | 5 collections, `requireDefaultLocaleValue`, `formatSlug` | `localization.test.ts`, `content-localization.spec.ts` | covered |
| FR-11 normalized locale | `normalizeLocale`, `resolveLocale` | `locale.test.ts` | covered |
| FR-12 pre-rendered detail pages | `generateStaticParams` × locale | build route table | covered |
| NFR-1 accessible control | `LanguageToggle` | `language-control-a11y.spec.ts` (rendered contrast, keyboard, `lang`) | covered |
| NFR-2 no client bundle growth | server-only dictionary | `language-control-a11y.spec.ts` (chunk scan), `dictionary-source.test.ts` | covered |
| NFR-3 SEO correctness | `metadata.ts`, `sitemap.ts` | `locale-metadata.spec.ts` | covered |
| NFR-4 testability | pure helpers in `locale.ts`/`format.ts` | `locale.test.ts`, `format` tests | covered |
| NFR-5 migration safety + reversibility | both migrations; `193922.down()` copies English back, `195302.down()` is a no-op | dependency migration proof on a scratch database | covered (`payload migrate:down` itself unproven — see Debt) |
| NFR-6 platform currency | `proxy.ts` (Next 16 convention) | build (`ƒ Proxy`) | covered |
| AC-1 … AC-11 | — | `locale-routing`, `locale-metadata`, `content-localization`, `language-control-a11y`, build route table | covered |

## Deviations and notes

- **Bulk action surfaces**: n/a for this track. The one cross-cutting deviation is the language
  control: the review page carries two instances (navbar and hero), deliberately kept.
- **`requireDefaultLocaleValue`** replaces `required: true` on every localizable field, including
  `reviewContent` after Phase R2/R3. Payload reads `required` on a localized field as required in
  *every* locale, which would make the pipeline's Indonesian write and the fixture's `id` clear
  impossible. The validator enforces the value in the default locale only, is rich-text aware
  (textless editor states and upload-only bodies are handled correctly), and the generated types
  (`reviewContent?: … | null`) are guarded at their single render site.
- **The e2e database is the only place the migrations have been applied to existing data.** Local
  dev databases created before this track need `bun run payload migrate:fresh` (destructive) or one
  `bun run dev` push; recorded in the phase-5 evidence and reported to the owner.
- **`/feed.xml`** permanently redirects to `/en/feed.xml`; the proxy passes it through so exactly
  one layer answers.
- **Structured data**: the synthetic English `reviewBody` is gone rather than translated; the
  schemas now carry `inLanguage` and locale-scoped `@id`s.
- **The 404 body is English** (document `lang` follows the served locale). `not-found.js` accepts no
  props, and reading the locale cookie at that boundary would make every `[locale]` route dynamic.
- **`/[locale]/reviews` is dynamic** because it reads `searchParams` for filters — pre-existing, not
  introduced here.
- **No pre-track bundle baseline** exists; NFR-2 is proved as an absolute measurement (1,532,683 B of
  uncompressed JS on `/id`) plus the absence of every dictionary string from every chunk, held by a
  pinned ceiling.

## Follow-ups (left deliberately)

1. Localize the 404 body (needs a locale signal at the root boundary without making routes dynamic).
2. Record a bundle baseline so future tracks can report a delta.
3. Prove `payload migrate:down` end to end via the CLI once the permission layer allows it.
4. Pre-existing: the local dev database's migration ledger needs a rebuild.

## Evidence

`verification/phase-1.md` … `verification/phase-5.md`, `verification/phase-R1.md`,
`verification/phase-R2.md`, `verification/phase-R3.md`, `review.md`.
