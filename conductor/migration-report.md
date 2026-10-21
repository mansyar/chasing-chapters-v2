# Conductor Migration Report

- **Date:** 2026-10-21
- **From:** Conductor 1.x
- **To:** Conductor 2.0
- **Mode:** Upgrade in place

## Context

- **Preserved:** `product.md`, `tech-stack.md`, `product-guidelines.md`
- **Regenerated:** `workflow.md` with Workflow Config and Verification Strategy
  (Bun/Next.js/Payload stack; coverage gate 80% new logic-bearing code; strict
  review; PR via `gh`, squash-merge, CI watch 15 min; base branch `main`)
- **Index:** merged in place; version marker `<!-- conductor-version: 2 -->`
  and Capabilities section added
- **Scaffolding:** `tracks.md`, `tracks/.gitkeep`, `.conductor/` ignore added to
  `.gitignore`
- **Agents:** installed `.opencode/agents/conductor-phase.md` and
  `.opencode/agents/conductor-reviewer.md` with Bun/Drizzle allowlists

## Tracks

All eight legacy tracks are archived and completed. Metadata was migrated to
the v2 schema and marked `legacy: true`. Old specs and plans were not rewritten.

| Track | Status | Missing metadata | Plan v2 | Spec v2 | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `prd_parity_20261008` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `translation_reliability_20261008` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `performance_polish_20261008` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `lighthouse_prod_fixes_20261008` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `hero_lcp_image_delivery_20261009` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `r2_image_delivery_20261009` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `comment_trust_moderation_20261010` | completed (archived) | all v2 fields | no | no | Keep as historical |
| `docs_truthfulness_20261010` | completed (archived) | all v2 fields | no | no | Keep as historical |

## Open Questions & Assumptions

- Archived tracks' `doc_sync` was set to `pending` per the v2 default; these
  tracks are complete and their docs were already synced at completion time in
  the 1.x workflow. Treat as historical; no action needed.
- Legacy metadata used `status: "new"`; completion state is recorded in the
  Tracks Registry (`[x]`) and by the `archive/` location. Both were preserved.

## Limits

- Legacy tracks are blocked by `conductor-implement`, `conductor-review`, and
  phase revert until they are recreated or manually repaired. As completed
  historical tracks they are not expected to be reopened; recreate a track with
  `conductor-new-track` if similar work returns.
- Old specs and plans were not rewritten automatically.
- When a track is repaired, remove `legacy: true` from its metadata and update
  the spec/plan to the v2 contract.
- The pre-migration directory is backed up at
  `.conductor/backups/conductor-v1-20261021-140904/`.
- v2 runs sequentially in the current worktree and creates no worktrees. No
  `.conductor/worktrees/` directory existed, so no worktree cleanup is needed.
