# Specification: Comment Trust & Moderation

- **Track ID:** `comment_trust_moderation_20261010`
- **Type:** Feature (light refactor)
- **Branch:** `feat/comment-trust-moderation`
- **Status:** new
- **Created:** 2026-10-10

## Overview

Implement the "trust levels" pillar of the product vision for guest comments: keep the flag-gated approval policy but make it **single-sourced, observable, and trust-aware**. Flagged comments are held for moderation with their spam reasons recorded and visible to admins; trusted commenters (≥3 approved comments) earn a bypass of the hold; admins get a live moderation surface on the admin dashboard.

Context discovered during planning:

- `Commenters.trusted` is set by the `Comments` `afterChange` hook (≥3 approved) but is **never read anywhere** — a dead feature.
- The spam-check/ban/status logic is **duplicated** between `submitComment` (`src/app/actions/comments.ts`, lines ~111–115) and the `Comments` `beforeChange` hook (`src/collections/Comments.ts`, lines ~76–93); the two copies can silently diverge.
- `getSpamReasons()` exists in `src/lib/blocklist.ts` but is exercised only by unit tests — admins never see *why* a comment was held.
- The admin dashboard (`src/components/admin/AnalyticsDashboard.tsx`) has no comment/moderation data; moderation requires hunting the raw Payload Comments list.
- The "pending moderation" warning toast **already exists** in `CommentForm.tsx` (`toast.warning`, 5s) — user-facing feedback needs verification, not new build.

## Decisions (user-confirmed)

1. **Approval policy — flag-gated only:** clean comments auto-approve for everyone; flagged comments go to `pending`; banned commenters are rejected. No first-time-commenter hold.
2. **Spam reasons — persist + display:** store the matched signals on the Comment record and show them in the admin UI.
3. **Moderation surface — dashboard widget:** a "Comment Moderation" panel on the existing custom `AnalyticsDashboard` with counts, recent items, quick actions, and deep links.
4. **Dedupe — extract shared lib:** the approval decision lives in one pure module consumed by both creation paths.
5. **Trusted bypass:** comments from trusted commenters auto-approve even when flagged (benefit of the doubt); non-trusted flagged comments behave as today.
6. **User feedback:** keep/verify the existing pending + success toasts; no regression.

## Functional Requirements

### FR1 — Shared moderation module
A pure, unit-testable module `src/lib/comment-moderation.ts` exposing e.g.
`resolveCommentStatus({ content, banned, trusted }) → { status: "approved" | "pending" | "rejected", spamSignals: string[] }`, built on `getSpamReasons()` from `src/lib/blocklist.ts`. Policy encoded: banned → rejected; clean → approved; flagged + trusted → approved; flagged + non-trusted → pending. Both `submitComment` (`src/app/actions/comments.ts`) and the `Comments` `beforeChange` hook (`src/collections/Comments.ts`) consume it; the duplicated inline logic is removed.

### FR2 — Persist spam signals
New read-only `spamSignals` field (array of text) on the Comments collection, populated at creation when content is flagged; visible in the Payload list columns and edit view so admins see why a comment was held, even after later blocklist changes.

### FR3 — Trust bypass
Comments from `trusted` commenters (≥3 approved, already computed by the existing `afterChange` hook) auto-approve even when spam signals fire. Non-trusted flagged → `pending`. Banned → rejected via the single shared path.

### FR4 — Moderation dashboard widget
"Comment Moderation" panel in `src/components/admin/AnalyticsDashboard.tsx`: pending + reported counts, the latest ~5 pending/reported comments inline with quick Approve/Reject actions, and deep links into filtered Payload Comments list views. Data comes from a lean module (e.g. `src/lib/moderation-summary.ts`) using aggregated queries / `select` projections — no full-doc bulk loads.

### FR5 — User feedback
The pending warning toast ("submitted and is pending moderation…") and the approved success toast keep working as today; no regression. Verify via e2e/unit coverage where applicable.

## Non-Functional Requirements

- TDD per `workflow.md`: failing tests precede implementation; >80% coverage on new logic-bearing code (`comment-moderation.ts`, `moderation-summary.ts`, touched server actions).
- No new runtime dependencies.
- Rate limiting (3 comments/60s, 5 reports/300s) untouched.
- Admin-only strings are English; no public-facing bilingual copy changes.
- No security regressions: email hashing, CSP, access control unchanged; guest `create` access remains but all status decisions flow through the shared module.
- Mobile admin usability for the widget (responsive panel).

## Acceptance Criteria

1. A clean comment from any commenter auto-approves (unchanged behavior).
2. A flagged comment from a non-trusted commenter → `pending`, with `spamSignals` persisted and visible in the admin UI.
3. A flagged comment from a trusted commenter → auto-approved.
4. A banned commenter → blocked, via the single shared code path.
5. Both creation paths (server action + direct Payload admin create) resolve status through the shared module — no duplicated policy logic remains.
6. The dashboard widget shows correct pending/reported counts; quick Approve/Reject actions work end-to-end; deep links open pre-filtered Payload lists.
7. All gates green: `bun run typecheck`, `bun run lint`, `bun test`, Playwright comment e2e flows pass.

## Out of Scope

- Comment replies/nesting; comment pagination beyond 100; server-rendered comments.
- Captcha/honeypot/Akismet or other third-party anti-spam services.
- Email notifications for moderation events.
- Writer-specific moderation UI beyond Payload's existing access rules.
- Fixes to unrelated dashboard efficiency beyond what the widget's own queries require.
