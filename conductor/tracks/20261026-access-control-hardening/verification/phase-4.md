# Phase 4 verification - Reading list visibility

| | |
| --- | --- |
| **Track** | `20261026-access-control-hardening` - Access Control Hardening |
| **Phase** | 4 - Reading list visibility |
| **Date** | 2026-10-26 |
| **Branch** | `fix/20261026-access-control-hardening` |
| **Base** | `b118f293544f0a43872e0c8359daf016c04a1262` |
| **Head** | `5508e0599817f3abbac2a5121f7be7249406a93d` |
| **Result** | `verified` |

## 1. Commands

| Layer | Command | Exit | Summary |
| --- | --- | --- | --- |
| Static (types) | `bun run typecheck` | 0 | No type errors in 255 files |
| Static (style) | `bun run lint` | 0 | `biome check .` - 247 files, no fixes applied |
| Unit | `bun test` | 0 | 710 pass, 0 fail, 1681 `expect()` calls, 52 files |
| Unit (targeted) | `bun test src/collections/__tests__/ReadingLists.test.ts` | 0 | 7 pass, 0 fail, 18 `expect()` calls |
| **Phase verification** | `bun run typecheck && bun run lint && bun test` | **0** | All three layers green in one run |

The suite total moved 700 -> 710 across two files since phase 2: phase 3 added
`Commenters.test.ts` (3 cases) and this phase adds `ReadingLists.test.ts`
(7 cases).

## 2. What changed

`src/collections/ReadingLists.ts` - the `read` rule, and only the `read` rule:

```ts
read: ({ req: { user } }) => {
	if (user?.role === "admin") return true;
	if (user?.role === "writer") {
		return { author: { equals: user.id } } as Where;
	}
	return { _status: { equals: "published" } } as Where;
},
```

`versions: { drafts: true }` is untouched: drafts are the feature, and who may
read them was the defect. `create`, `update` and `delete` are untouched.

### Why `_status` alone rather than `publishedAndVisibleWhere`

`publishedAndVisibleWhere(now)` returns
`{ and: [ { _status: { equals: "published" } }, { or: [ { publishAt: { exists: false } }, { publishAt: { less_than_equal: … } } ] } ] }`.
`ReadingLists` has no `publishAt` field - its field list is `title`,
`description`, `author`, `coverImage`, `reviews`, `featured`, `slug`. Importing
the review schedule fragment would name a field this collection does not have,
which is a query that either fails validation or silently matches nothing.
`_status: { equals: "published" }` is the honest form of the same rule for a
collection with no schedule. This is the reasoning FR-4 asks for, applied to the
collection as it actually is.

### Why a writer branch

The spec requires admin-vs-public only. The writer branch is **consistency with
`Reviews.read`**, not a spec requirement: `ReadingLists` already gives writers
`{ author: { equals: user.id } }` on `update` and `delete`, and writers may
create lists, so a writer's lists are drafts. Without a writer branch the public
branch would apply to them, and their own admin list would be empty - a real
regression introduced by this fix rather than a defect it repairs. It is tested
(`gives a writer their own reading lists`).

## 3. Acceptance criteria

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| **AC-6** | An unauthenticated read of a draft reading list returns no draft rows | `ReadingLists.test.ts` -> `excludes drafts from an unauthenticated read` (rule returns `{ _status: { equals: "published" } }`, not `true`) and `admits no draft row through the query it produces` / `keeps the constraint on a draft query` (a draft row is rejected by the query the rule produces, a published row admitted) | met |
| **AC-7** | An authenticated admin read of the same draft returns it | `ReadingLists.test.ts` -> `returns the draft to an admin` (rule returns `true`, so `find` composes no constraint and the draft row survives) | met |

Supporting assertions in the same file: the rule is `_status`-only and carries
no `publishAt` or `and` (`uses a status constraint rather than the review
schedule fragment`), and `versions` stays `{ drafts: true }` while
`create`/`update`/`delete` keep their exact prior results
(`leaves drafts enabled and the write rules unchanged`).

### How the test proves behaviour, not just shape

The spec requires a collection-level test to assert the rule's return value
**and** the resulting query behaviour, so that a rule which returns `false` but
is still bypassed is caught. `ReadingLists.test.ts` does both: it asserts the
returned `Where` fragment, then builds the query `find` would run - combining
the access result with the request's own `where` through the same AND
(`node_modules/payload/dist/collections/operations/find.js:75`, `combineQueries`
at `node_modules/payload/dist/database/combineQueries.js:4-17`) - and evaluates
that query against a draft row and a published row. A `true` return contributes
no constraint and the draft row survives, which is exactly the failure the shape
assertion alone would not catch on a rule that returned `false` but was ignored.

`?draft=true` cannot lift the constraint: `find` composes the access result into
`fullWhere` at `:75` and only then rewrites the keys for the version query at
`:103-104` (`appendVersionToQueryKey`, which prefixes keys inside `and`/`or`
recursively and leaves the boolean structure intact). The reproduction in the
spec therefore hits the same filter as any other read.

## 4. Before / after

Both runs use the same final test file. The "before" run restores the collection
config from the **phase base sha**, not from the working tree's last commit:

```
git checkout b118f293544f0a43872e0c8359daf016c04a1262 -- src/collections/ReadingLists.ts
bun test src/collections/__tests__/ReadingLists.test.ts      # 3 pass, 4 fail  (exit 1)
git checkout HEAD -- src/collections/ReadingLists.ts
bun test src/collections/__tests__/ReadingLists.test.ts      # 7 pass, 0 fail  (exit 0)
```

`git checkout --` is deliberately not used for the "before" step: it restores the
*committed* version, which by then already contains the fix, and so proves
nothing. That pitfall is recorded in `verification/phase-2.md`.

The pre-fix output is archived verbatim at
`.conductor/evidence/phase-4-before.txt` (and reproduced below in summary). The
four failures:

| Test | Pre-fix result | What it proves |
| --- | --- | --- |
| `excludes drafts from an unauthenticated read` | `Expected: { _status: { equals: "published" } }, Received: true` | The rule returned `true` - no constraint at all |
| `admits no draft row through the query it produces` | `Expected: false, Received: true` | The defect as behaviour: a draft row survived an anonymous query |
| `keeps the constraint on a draft query` | `Expected: false, Received: true` | `?draft=true` reached the draft |
| `gives a writer their own reading lists` | `Expected: { author: { equals: 5 } }, Received: true` | No writer branch existed |

Three tests passed pre-fix and still pass: `returns the draft to an admin`
(admin saw everything, which is correct and is AC-7's baseline),
`uses a status constraint rather than the review schedule fragment` (the
pre-fix rule returned `true`, which trivially has neither key - a weak
assertion on its own, and it is listed here so the reader does not mistake it
for a proof), and `leaves drafts enabled and the write rules unchanged` (the
write rules were already correct).

## 5. Call-site table, re-verified

Every query in the app that reads `reading-lists`, re-read in this phase. Each
runs through the **Local API**, where `overrideAccess` defaults to `true`, so
`ReadingLists.access.read` is **not consulted** by any of them. Each filters
`_status` itself. **This change closes the REST surface; it does not change what
any page renders.**

| Site | What it relies on | Consults the read rule? |
| --- | --- | --- |
| `src/app/(public)/[locale]/reading-lists/page.tsx:47` | `where: { _status: { equals: "published" } }`, sort `-createdAt` | no |
| `src/app/(public)/[locale]/page.tsx:80` (home, featured) | `where: { _status: { equals: "published" }, featured: { equals: true } }`, limit 4 | no |
| `.../reading-lists/[slug]/page.tsx:36` (`generateMetadata`) | `where: { slug, _status: { equals: "published" } }`, limit 1, depth 1 | no |
| `.../reading-lists/[slug]/page.tsx:73` (`generateStaticParams`) | `where: { _status: { equals: "published" } }`, limit 20, `select: { slug }` | no |
| `.../reading-lists/[slug]/page.tsx:100` (page) | `where: { slug, _status: { equals: "published" } }`, limit 1, depth 2 | no |
| `.../reading-lists/[slug]/opengraph-image.tsx:26` | `where: { slug, _status: { equals: "published" } }`, limit 1, depth 1 | no |
| `src/app/sitemap.ts:28` | `where: { _status: { equals: "published" } }`, limit 1000, `select: { slug, updatedAt }` | no |
| `src/collections/__tests__/localization.test.ts:98` | the collection *config* (localized field names) - no data read at all | n/a |

Two independent confirmations that no site bypasses its own filter:

1. `grep overrideAccess src` returns only `src/lib/retranslate.ts:389` and the
   reviews page (`reviews/[slug]/page.tsx:100`) and preview route (`:59`) as
   explicit `overrideAccess: false`. None of them is a reading-list site, so
   every reading-list query takes the default `true`.
2. `grep 'draft:\s*true' src` returns four matches, and none is a reading-list
   query: the preview branch of the review page (`reviews/[slug]/page.tsx:99`),
   the preview route's doc comment and `find` call (`route.ts:20`, `:58`), and a
   doc comment in this phase's own test file (`ReadingLists.test.ts:27`)
   explaining why `draft: true` does not lift the constraint. **No
   reading-list query anywhere in `src` asks for `draft: true`.**

Neither `src/lib/e2e-harness.ts` nor `src/instrumentation.ts` reads the
collection - the former only holds fixture data and a path constant, the latter
a list of paths to warm.

## 6. Draft preview

The brief flagged one way this change could break something: draft preview, if
it read reading lists through public REST with `?draft=true`. It does not.

**Path note:** the route is `src/app/(payload)/api/preview/route.ts`, not
`src/app/api/preview/route.ts` - the `(payload)` route group is part of the
path. The brief's path does not exist; the file was found by glob.

What the route does (`route.ts:1-75`):

1. Parses `slug` and `locale`; 400 on a missing slug or unknown locale.
2. `const { user } = await payload.auth({ headers: request.headers })` and
   **returns 401 before enabling anything** when there is no user. Preview is
   authenticated by the Payload session cookie, not by a query parameter.
3. `payload.find({ collection: "reviews", …, draft: true, overrideAccess: false, user })`
   - the **Local API**, as the signed-in user, with access enforced. A writer
     previews only their own reviews.
4. `(await draftMode()).enable()` and a redirect to the review's public path.

**Findings:**

- Preview is **authenticated** - `payload.auth` + a 401 gate.
- Preview uses the **Local API**, with `overrideAccess: false`.
- Preview is **entirely review-scoped**: it queries `collection: "reviews"` and
  nothing else. `ReadingLists` has no `admin.preview` builder at all (the
  `admin` block is `{ useAsTitle: "title" }`), so the admin panel offers no
  reading-list preview entry point to break.
- The exit route (`api/preview/exit/route.ts`) only disables draft mode and
  redirects; it reads no collection.

**Consequence:** tightening `ReadingLists.read` cannot break draft preview,
because preview never reads reading lists. FR-4's assumption holds, and this
phase verified it rather than assuming it. The phase was therefore not blocked.

## 7. Evidence paths and commits

| Item | Path / sha |
| --- | --- |
| Collection config | `src/collections/ReadingLists.ts` |
| Tests | `src/collections/__tests__/ReadingLists.test.ts` |
| Pre-fix run (archived) | `.conductor/evidence/phase-4-before.txt` |
| Fix commit | `5508e0599817f3abbac2a5121f7be7249406a93d` - `fix(reading-lists): exclude drafts from unauthenticated reads` |
| Evidence commit | the commit that adds this file |

## 8. Deviations

None. Both changed files are inside `Touches`
(`src/collections/ReadingLists.ts`, `src/collections/__tests__/ReadingLists.test.ts`).

## 9. Notes

- **What this does not prove.** There is no authenticated-REST coverage in this
  project's harness: the tests call the access rule and reconstruct the query
  `find` builds, which proves the rule and its composition, not a live HTTP
  round-trip. The e2e suite drives the admin UI, not REST, so AC-6 is proven at
  the rule-and-query layer rather than by `curl`. This matches how phases 1-3
  proved their collection rules.
- **`combineQueries` behaviour, relied on above.** It returns `{ and: [where, access] }`
  when both are present, `{ and: [access] }` when only access is a `Where`, and
  `{}` when access is `true`. So an admin read composes no constraint at all,
  which is why AC-7 holds by the same mechanism as AC-6.
- **No migration, no schema change** (NFR-4): the change is one access rule; the
  `_status` and `author` fields already exist.
- **No new dependency** (NFR-6).
- **NFR-3** - public reads of published content keep the same shape and result:
  every public site filters `_status` itself through the Local API with
  `overrideAccess` defaulted to `true`, so its query is byte-identical before and
  after this change.
- The REST surface now behaves like every other collection with drafts in this
  app: anonymous `GET /api/reading-lists?draft=true` returns published rows only,
  an admin session still returns drafts.

**Result: verified.** `bun run typecheck && bun run lint && bun test` exits 0;
AC-6 and AC-7 are each covered by a test that fails on the phase base and passes
on the fix.
