# Specification: Docs Truthfulness

- **Track ID:** `docs_truthfulness_20261010`
- **Type:** Chore
- **Branch:** `docs/docs-truthfulness`
- **Status:** new
- **Created:** 2026-10-10

## Overview

Bring the three operator-facing documents in line with what the repository actually ships. A reader of `README.md`, `docs/ADMIN_GUIDE.md`, or the opening of `docs/pagespeed-optimization.md` must not be told to run a script, use a control, or trust a metric that the product does not have. This track edits documentation only. It does not implement missing features or record new measurements.

## Decisions

1. **Files:** `README.md`, `docs/ADMIN_GUIDE.md`, and the opening status of `docs/pagespeed-optimization.md` only.
2. **Scheduled publishing:** not available. Remove it from the admin status table. One sentence in both the admin guide and the README that it is not implemented. Do not describe it as planned.
3. **Pagespeed:** relabel, do not remeasure. The January 2026 table is historical. The header points at figures already written in this file. No new scores.
4. **False claims already in the README are in scope** when they tell a reader a control or metric exists. Leaving them would fail the success criterion already agreed.

## Functional Requirements

### FR1 — README matches the repo

Correct `README.md` so it agrees with `package.json`, `conductor/tech-stack.md`, and the shipped behavior:

- CMS is Payload 3.90, not 3.0.
- Animations are CSS (`tw-animate-css`), not Motion / Framer Motion. That package is not installed.
- Test commands are `bun test` and `bun run test:e2e`. Remove `bun run test:vitest` and `bun run test:vitest:run`.
- Scheduled publishing is not available. Delete the "planned but not yet available" wording.
- Comment moderation matches the shipped policy in one or two sentences: clean comments auto-approve, spam-flagged comments are held with persisted spam signals, trusted commenters (3+ approved comments) bypass the hold, banned commenters are rejected. Point at the admin dashboard widget rather than implying every comment waits in a queue.
- Auto-translation mentions the shipped safeguards already documented in the admin guide: status tracking, no English fallback on failure, and the Re-translate action. Do not duplicate the whole guide.
- Public covers are served from the R2 public domain (`NEXT_PUBLIC_R2_PUBLIC_URL`); admin uploads still go through the app. Do not claim the app is out of the upload path.
- Do not claim author analytics for books per month or favorite genres. Those panels do not exist. Reading dates are stored and shown on the review. The dashboard shows views, likes, review count, and average rating.
- Do not claim browse-by-mood or search-by-genre. Search matches title and book author. Browse filters are genre and tag. Moods display on the review and are not a filter.

Do not rewrite the file tree, deployment section, or voice beyond what is required to remove a false claim.

### FR2 — Admin guide matches the publishing and moderation workflow

In `docs/ADMIN_GUIDE.md`:

- Creating a review, and the publishing table, list only Draft and Published.
- One sentence: scheduled publishing is not available.
- Moderation section matches `resolveCommentStatus`: clean comments auto-approve; flagged comments from non-trusted commenters are pending and show `spamSignals`; trusted commenters bypass that hold; banned commenters are rejected; readers can report, and 3 reports mark a comment `reported`.
- Tell the operator that the Comment Moderation panel on the author analytics dashboard shows pending and reported counts, recent items, and Approve / Reject, with links into the Comments collection.
- Leave the Indonesian Translation section as written unless a sentence is false. It already matches the translation track.

### FR3 — Pagespeed opening is historical, and cites recorded results only

Edit only the opening status of `docs/pagespeed-optimization.md` (the goal callout, the "Last Updated" line, the baseline table, and the present-tense "Identified Issues" checklist that still treats the January defects as open). Do not rewrite the progress-history log.

- Label the 2026-01-19 table as the historical baseline, not the current score.
- Point the top of the document at the latest **production** figures already recorded in this file: the 2026-10-09 hero LCP post-deploy re-run (Performance 68 and 77 across two runs, Accessibility 100, Best Practices 96, SEO 100, CLS 0, simulated LCP about 2.8–3.0s). Cite that section. Do not round, improve, or replace those numbers.
- State that R2-direct image delivery is shipped in code, and that its production Lighthouse re-run has not been recorded. Do not present the local R2 timings as the current production score.
- "Last updated" may note that the status block was clarified on 2026-10-10. It must not read as a new audit.
- The original goal (desktop Performance 90+) may remain as a goal. It must not be written as the current score.

## Non-Functional Requirements

- Documentation only. No application source, tests, config, or conductor files change.
- No new dependencies, no Lighthouse run, no scheduled-publishing implementation.
- English. Keep each file's existing tone. Minimum edit that removes the false claim.
- Verification is a diff review plus checks against `package.json` and `src/lib/comment-moderation.ts`. No new unit tests. Workflow exempts docs from mandatory unit tests. Existing `bun test` must still pass because no logic changed.

## Acceptance Criteria

1. `README.md` contains no `test:vitest`, no Framer Motion / Motion-as-dependency, and no Payload 3.0. Test instructions match `package.json` scripts.
2. Neither `README.md` nor `docs/ADMIN_GUIDE.md` tells the operator to set a Scheduled status, or that scheduled publishing is planned.
3. The admin guide's moderation steps match the shared policy (clean → approved, flagged + not trusted → pending with spam signals, trusted bypass, banned → rejected) and name the dashboard widget.
4. The README does not claim books-per-month or favorite-genre analytics, browse-by-mood, or search-by-genre.
5. The pagespeed opening labels the January table as historical, cites the 2026-10-09 production figures already in the file, and says the post-R2 production audit is not recorded. No number in that file is changed.
6. `git diff` touches only `README.md`, `docs/ADMIN_GUIDE.md`, and `docs/pagespeed-optimization.md`.

## Out of Scope

- Implementing scheduled publishing, mood browse, genre search, reading-journal stats, site-wide i18n, or comment pagination.
- Running Lighthouse or writing new scores.
- Editing `docs/PRD.md`, `conductor/`, or any source file.
- Rewriting the pagespeed progress log, or restyling these documents.
