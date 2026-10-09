# Track: Comment Trust & Moderation

- **Track ID:** `comment_trust_moderation_20261010`
- **Type:** Feature (light refactor)
- **Branch:** `feat/comment-trust-moderation`
- **Status:** new
- **Created:** 2026-10-10

**Documents:**
- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)

## Summary

Implements the product vision's "trust levels" for guest comments. Today `Commenters.trusted` is computed (≥3 approved) but never read, spam/ban/approval logic is duplicated between `submitComment` and the `Comments` `beforeChange` hook, spam reasons are invisible to admins, and there is no moderation surface outside the raw Payload list. This track extracts a single shared moderation module (`src/lib/comment-moderation.ts`), persists and displays spam signals on flagged comments, gives trusted commenters a bypass of the moderation hold, and adds a Comment Moderation widget (counts + recent items + quick approve/reject) to the admin dashboard.
