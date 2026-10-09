# Implementation Plan: Docs Truthfulness

**Track ID:** docs_truthfulness_20261010
**Branch:** `docs/docs-truthfulness`
**Spec:** [spec.md](./spec.md)
**Status:** Pending

> Execution follows `conductor/workflow.md`. This chore changes no logic-bearing code, so there is no Red/Green test phase and no new test file. Each phase still ends with the workflow checkpoint. `CI=true bun test` must stay green because nothing under `src/` changed. Doc commits use the `docs` type. Plan-status commits stay `conductor(plan)` and may touch only this track's conductor files. That is the operational reading of spec AC6: no product source, PRD, or other conductor doc changes.

## Phase 1: Operator docs

- [ ] Task: Align README with the repo (FR1)
  - [ ] Set CMS to Payload 3.90. Replace Motion / Framer Motion with CSS animations (`tw-animate-css`). No claim that Motion is installed.
  - [ ] Replace the test section with `bun test` and `bun run test:e2e`. Delete `test:vitest` and `test:vitest:run`.
  - [ ] Say scheduled publishing is not available. Delete "planned but not yet available".
  - [ ] Describe comment trust in one or two sentences: clean auto-approves, flagged non-trusted comments are held with spam signals, trusted commenters bypass the hold, banned commenters are rejected. Name the dashboard widget.
  - [ ] Mention translation status, no English fallback on failure, and Re-translate. Do not paste the admin guide.
  - [ ] Say public covers are served from the R2 public domain; admin uploads still go through the app.
  - [ ] Remove books-per-month and favorite-genre analytics. Reading dates are stored and shown on the review. The dashboard shows views, likes, review count, and average rating.
  - [ ] Search is title and book author. Browse filters are genre and tag. Moods display on the review and are not a filter.
  - [ ] Do not rewrite the file tree, deployment section, or voice beyond a false claim.
  - [ ] Verify: grep README for `test:vitest`, `Framer Motion`, `Payload CMS 3.0`, `books per month`, `favorite genres`, and `planned`. None remain as current claims.
  - [ ] Commit: `docs(readme): Align stack, scripts, and feature claims with the repo`
- [ ] Task: Align the admin guide with publishing and moderation (FR2)
  - [ ] Creating a review, and the publishing table, list only Draft and Published.
  - [ ] One sentence: scheduled publishing is not available.
  - [ ] Rewrite the moderation section to match `resolveCommentStatus`: clean → approved; flagged and not trusted → pending with `spamSignals`; trusted bypass; banned → rejected; 3 reader reports → `reported`.
  - [ ] Name the Comment Moderation panel on the author analytics dashboard: counts, recent items, Approve / Reject, links into Comments.
  - [ ] Read the Indonesian Translation section. Edit a sentence only if it is false.
  - [ ] Verify: grep `docs/ADMIN_GUIDE.md` for a Scheduled status row. It is gone. The not-available sentence is present.
  - [ ] Commit: `docs(admin): Remove scheduled status and match comment moderation`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Pagespeed opening and scope gate

- [ ] Task: Relabel the pagespeed opening without new numbers (FR3)
  - [ ] Edit only the goal callout, Last Updated line, baseline table, and the present-tense Identified Issues checklist. Do not edit the progress-history log.
  - [ ] Label the 2026-01-19 table as the historical baseline, not the current score.
  - [ ] Point the top at the 2026-10-09 hero LCP post-deploy production runs already in the file: Performance 68 and 77, Accessibility 100, Best Practices 96, SEO 100, CLS 0, simulated LCP about 2.8–3.0s. Cite that section. Do not change any number in the file.
  - [ ] State that R2-direct delivery is shipped in code and that its production Lighthouse re-run is not recorded. Do not present the local R2 timings as the current production score.
  - [ ] Last Updated may say the status block was clarified on 2026-10-10. It must not read as a new audit. The 90+ goal may remain as a goal.
  - [ ] Verify: `git diff -U0 -- docs/pagespeed-optimization.md` contains no changed digit that was a recorded measurement. The January table is labeled historical. The pending post-R2 audit sentence is present.
  - [ ] Commit: `docs(pagespeed): Label January baseline historical and cite recorded audits`
- [ ] Task: Confirm the track diff stays inside the three documents (AC6)
  - [ ] `git diff --name-only origin/main` lists only `README.md`, `docs/ADMIN_GUIDE.md`, `docs/pagespeed-optimization.md`, and this track's conductor files.
  - [ ] No `src/`, `docs/PRD.md`, or other conductor doc appears.
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

Manual check at each checkpoint is a read of the edited doc, not a running app. Expected outcome: an operator is not told to use a script, status, or score the repo does not have.
