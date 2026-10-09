# Implementation Plan: Comment Trust & Moderation

- **Track ID:** `comment_trust_moderation_20261010`
- **Branch:** `feat/comment-trust-moderation`
- **Methodology:** TDD per `conductor/workflow.md` (Red → Green → Refactor; phase checkpoints; git notes)

## Phase 1: Shared Moderation Module & Trust Bypass [checkpoint: 2920652]

- [x] Task: Write failing unit tests for `src/lib/comment-moderation.ts`
  - [ ] Clean content → `{ status: "approved", spamSignals: [] }`
  - [ ] Flagged content, non-trusted → `{ status: "pending", spamSignals: [...] }`
  - [ ] Flagged content, trusted → `{ status: "approved", spamSignals: [...] }`
  - [ ] Banned → rejected outcome
- [x] Task: Run tests and confirm Red phase (`CI=true bun test`)
- [x] Task: Implement `src/lib/comment-moderation.ts` as a pure module over `blocklist.getSpamReasons()` (Green)
- [x] Task: Refactor `submitComment` (`src/app/actions/comments.ts`) to consume the module (reads `commenter.trusted`/`banned` it already fetches)
- [x] Task: Refactor `Comments.beforeChange` hook (`src/collections/Comments.ts`) to consume the module; remove duplicated inline logic; keep banned-commenter rejection
- [x] Task: Verify >80% coverage on the new module; full suite green
- [x] Task: Commit `feat(comments): shared moderation module with trust bypass` + git note + plan update (2920652)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 2: Spam Signals Persistence [checkpoint: 6ff1f72]

- [x] Task: Write failing tests asserting `spamSignals` is populated on flagged creation via both create paths
- [x] Task: Add read-only `spamSignals` array field to `src/collections/Comments.ts` + admin list column
- [x] Task: Persist signals through the shared module in both create paths (Green)
- [x] Task: Commit `feat(comments): persist and display spam signals` + git note + plan update (6ff1f72)
- [x] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 3: Moderation Dashboard Widget

- [x] Task: Write failing unit tests for `src/lib/moderation-summary.ts` (pending/reported counts + latest N items via `select`, no full-doc loads)
- [x] Task: Implement the data module (Green)
- [x] Task: Build the "Comment Moderation" panel in `src/components/admin/AnalyticsDashboard.tsx`
  - [x] Pending + reported counts
  - [x] Latest ~5 pending/reported comments inline
  - [x] Quick Approve/Reject actions
  - [x] Deep links to filtered Payload Comments list views
- [~] Task: Verify widget actions end-to-end
- [x] Task: Commit `feat(admin): comment moderation dashboard widget` + git note + plan update — SHA `80f87d4`
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)

## Phase 4: User Feedback & Final Verification

- [ ] Task: Verify pending warning toast + success toast behavior (no regression; adjust e2e if needed)
- [ ] Task: Run full gates — `bun run typecheck && bun run lint && CI=true bun test && bun run test:e2e`
- [ ] Task: Final commit `feat(comments): complete comment trust & moderation track` + git note + plan update
- [ ] Task: Phase Verification & Checkpoint (Refer to workflow.md)
