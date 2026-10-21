<!-- conductor:start -->
## Conductor

This project uses Conductor for spec-driven development.

- Start with `conductor/index.md`.
- Run `conductor-status` before proposing work.
- Use `conductor-new-track` for new work, `conductor-implement` for
  execution, and `conductor-review` before a PR.
- Treat `conductor/tracks/*/plan.md`, `metadata.json`, `tracks.md`, and
  `review.md` as Conductor state. Do not edit them outside the Conductor
  workflow.
<!-- conductor:end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
