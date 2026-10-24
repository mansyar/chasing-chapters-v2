# feat(publishing): preview any draft on its real URL and schedule when a review goes live

## Summary

Authors were publishing blind. Nothing in the app used Next's draft mode, ten public reads
filtered on `_status` alone, and `publishDate` was display metadata auto-filled at publish — so a
saved draft 404'd on the site, and "go live on Tuesday" meant setting a reminder and remembering
to press Save. The bilingual work doubled the cost: publishing blind also meant checking the
Indonesian page after the fact.

This track adds the two things that close that loop.

**Preview.** An authorized author or admin opens any review — including one that was never
published — on its real public URL in either language. The page shows a banner that names it a
preview, links to the other language while staying in preview, and exits back to the same URL.
Nothing is cacheable or indexable: `noindex, nofollow`, `Cache-Control: private, no-store`, no
canonical, no hreflang, no OG image, and no appearance in the sitemap or the feeds. The public
routes stay pre-rendered, because draft mode is a per-request bypass rather than a dynamic
switch.

**Scheduling.** A review carries an optional `Publish At`. One shared rule — a Payload `where`
fragment for queries and a pure predicate for everything else — hides it from every public
surface until that moment, then it appears on its own within the existing revalidation window.
No scheduler, no deploy, no second save; a process restart cannot lose it because it is a
timestamp. The admin names the state in the reviews list and states the exact moment in the edit
view, and an empty `Publish Date` is filled from the schedule without ever overwriting an
author's value.

Six phases, three review rounds, thirteen findings — all closed. 582 unit tests and 112 browser
specs at the end, typecheck and lint clean, and a production build that still pre-renders both
detail routes.

## Track

- Spec: `conductor/tracks/20261024-draft-preview-scheduling/spec.md`
- Plan: `conductor/tracks/20261024-draft-preview-scheduling/plan.md`
- Review: `conductor/tracks/20261024-draft-preview-scheduling/review.md`
- Integrated verification: `conductor/tracks/20261024-draft-preview-scheduling/verification/integrated.md`

## What happened

| Phase | Checkpoint | What it delivered |
| --- | --- | --- |
| 1 — Publishing Gate | `c76ba18` | `publishAt` field + generated migration, one visibility rule, applied to home, browse, detail (incl. metadata and `generateStaticParams`), feeds, sitemap, both OG handlers and related reviews; `publishDate` filled from the schedule |
| 2 — Preview Entry and Draft Rendering | `ba97843` | Session-validated entry route, POST exit, Payload's native Preview button, draft rendering on the real route with the session read only inside the draft branch, banner, draft metadata; route table unchanged |
| 3 — Admin Surface, Fixture and Proof | `b519fdd` | Publish-state derivation, list cell, edit notice, never-published draft fixture, browser coverage of the whole feature, AC sweep |
| R1 — Review Fixes | `b9aae41` | Five surfaces still on the old filter (incl. the anonymous REST read), the notice's unsaved clear, the RSS builder's duplicate rule, the partial-update date hole, the banner copy |
| R2 — Review Fixes | `a198b1f` | The date fill's cleared-vs-absent regression, the two counts that still included a scheduled review |
| R3 — Review Fixes | `efa311d` | The fill's remaining schedule hole on a partial update, the login helper's retry budget |

## Requirements

- [x] FR-1 authenticated preview entry per review and locale
- [x] FR-2 draft mode renders the newest version, session required as well
- [x] FR-3 banner with the other locale and an exit
- [x] FR-4 previewed responses are unindexable and uncacheable
- [x] FR-5 one rule gates every public surface
- [x] FR-6 optional UTC `Publish At`, writer and admin, with an admin surface
- [x] FR-7 the admin names the state and the moment
- [x] FR-8 empty `publishDate` filled from the schedule, author value preserved
- [x] FR-9 scheduling does not change translation behaviour
- [x] NFR-1 both detail routes stay pre-rendered
- [x] NFR-2 no new secret or env var
- [x] NFR-3 no draft content in ISR, the translation cache, the sitemap or a feed
- [x] NFR-4 one shared predicate
- [x] NFR-5 existing surface green

## Verification

| Layer | Result |
| --- | --- |
| unit | 582 pass, 0 fail, 46 files (baseline 524) |
| coverage | 81.30 % funcs / 89.96 % lines; every new module at or near 100 % (gate 80 % on new code) |
| lint | 236 files, no fixes |
| typecheck | 246 files |
| build | 27/27 static pages, both review detail path groups still `●` over 8 paths |
| e2e | 112 passed, 0 failed, 0 skipped, 0 unrun (3.7 m); baseline 95 |

## Review

**PASS WITH FINDINGS** over three rounds, thirteen findings, none deferred.

- Round 1 (`BLOCK`, 1 High / 3 Medium / 3 Low) caught the failure this feature invites: the new
  rule reached the seven reads the plan enumerated and not the collection's own anonymous access,
  so the public REST API still served a scheduled review in full. Also the reading-list grid, the
  comment action, the notice's unsaved clear, the banner's "unpublished" claim and the RSS
  builder's weaker copy of the rule.
- Round 2 (`PASS WITH FINDINGS`, 2 Medium / 3 Low) caught a regression the round-1 fix
  introduced — `??` treated a cleared date as absent — plus two counts that had not moved with
  the rule.
- Round 3 (`PASS WITH FINDINGS`, 3 Low) closed the last hole in the date fill (a partial update
  clearing only the date) and a login helper whose waits could not fit its own retry budget. The
  fix phase objected, correctly, that the bound my brief prescribed does not add up; the final
  numbers do.

## Deviations and risks

- **The authoring contract changed in one place.** A review's `Review Content` is now checked by
  `requireDefaultLocaleValue` instead of `required: true`, because Payload reads `required` on a
  *localized* field as required in *every* locale — which would reject a legitimate Indonesian-only
  or English-only body. The rule still demands text in English (a body that is only an image
  counts), allows the Indonesian body to be empty, and the generated type became `| null` with a
  single guarded render site. Documented in `docs/ADMIN_GUIDE.md`.
- **Scheduling is a timestamp, not a job.** That is what makes it survive restarts and need
  nothing deployed, but it also means precision is bounded by the 60-second revalidation window
  the site already had. A review scheduled for 09:00 can appear at 09:00:59.
- **Preview access follows the collection's read policy.** Any signed-in author can preview any
  review, not just their own, because NFR-2 ruled out a second permission model. Recorded as a
  decision rather than a defect.
- **Comments on a scheduled review** can still be read anonymously by id — pre-existing, outside
  FR-5's enumerated surfaces, and limited to comment text plus an existence signal (Payload
  degrades an access-blocked relationship to its id). Recorded as debt.
- **The e2e harness needed test-robustness work**, not app work: a hydration race in the notice
  case and a 30 s login timeout under load. Both were fixed in the specs; no assertion was
  weakened and no app file changed for them.
- **A local dev database predating this track** needs `bun run payload migrate:fresh` plus a
  reseed before `bun run build` works; CI and the harness migrate cleanly.

## Follow-ups

- A fixture review with a *past* `Publish At`, so "Live once the moment passes" is proved against a
  real row rather than the predicate.
- Reader-local schedule display, if wanted — that needs copy that carries a time zone.
- Prove `payload migrate:down` through the CLI; the rollback logic itself is already proven by
  direct invocation on a scratch database.
- Give the e2e server's warm-up its own budget; `[Warmup] Server did not become ready` still
  appears in green runs.
- The comments-read surface above, if "every public surface" is to be read strictly.

## Rollback

`git revert` the squashed merge. The migration is additive (`publish_at` / `version_publish_at`)
and its `down` drops both columns; nothing depends on the column, so reverting the code leaves
scheduling inert but harmless until the migration is reverted too. Preview is behind routes that
the reverted code no longer serves, and an existing `__prerender_bypass` cookie becomes inert
because nothing in the app reads draft mode any more.
