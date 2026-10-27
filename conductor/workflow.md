# Project Workflow

## Guiding Principles

1. **The plan is the source of truth.** Every phase, task, result, checkpoint,
   and evidence link lives in `plan.md`.
2. **The tech stack is deliberate.** A change to the stack is recorded in
   `tech-stack.md` before the implementation depends on it.
3. **Verification is agent-executed.** The phase subagent runs the configured
   checks and writes evidence. The user is not asked to manually verify routine
   work.
4. **Evidence over assertion.** A phase is complete only when the configured
   checks pass and the evidence file exists.
5. **No silent debt.** A finding is fixed, explicitly accepted with a reason, or
   tracked as an issue. It is never quietly ignored.
6. **Stay inside the phase contract.** `Touches` defines the expected blast
   radius. A required deviation is allowed, recorded, and reviewed.
7. **Non-interactive and CI-aware.** Prefer commands that terminate. Use
   `CI=true` for watch-mode tools where the ecosystem supports it.
8. **Test-first for logic-bearing code.** Unit tests are required for
   logic-bearing modules (`src/lib/`, `src/hooks/`, `src/app/actions/`,
   collection hooks, scripts). Pure UI components (layout, styling, static
   presentational components) are exempt from mandatory unit tests; they are
   verified by lint, typecheck, and e2e where applicable.
9. **User experience first.** Every decision prioritizes user experience,
   including mobile (44x44px touch targets, readable text, responsive layouts).

## Workflow Config

```yaml
project:
  type: "web-app"
  languages: ["typescript"]
commands:
  setup: "bun install && cp .env.example .env && docker compose up -d && bun run seed"
  dev: "bun run dev"
  test: "bun test"
  test:e2e: "bun run test:e2e"
  coverage: "bun test --coverage"
  lint: "bun run lint"
  format: "bun run format"
  typecheck: "bun run typecheck"
  build: "bun run build"
  verify_phase: "bun run typecheck && bun run lint && bun test"
coverage:
  gate: 80
  scope: "new-code"
verification:
  layers: ["static", "unit", "e2e"]
  retry: 2
  manual_exceptions: ["Physical iPhone device testing", "Production deployment approval"]
git:
  base_branch: "main"
  fetch: true
  commit_style: "conventional"
  task_commits: true
  phase_squash: true
review:
  strict: true
  issues:
    enabled: false
    auto_create: false
    min_severity: "medium"
    group_low: true
    labels: ["tech-debt", "conductor"]
pr:
  enabled: true
  tool: "gh"
  base: "main"
  media: "always"
  watch_ci: true
  watch_timeout_minutes: 15
  merge_method: "squash"
```

## Development Commands

### Setup

```bash
bun install                 # Install dependencies
cp .env.example .env        # Configure environment variables
docker compose up -d        # Start PostgreSQL + Redis
bun run seed                # Seed initial data
```

### Daily Development

```bash
# Start the app
bun run dev                 # Next.js dev server (http://localhost:3000)

# Run tests
bun test                    # Unit tests (Bun test runner)
bun run test:e2e            # Playwright e2e tests

# Run coverage
bun test --coverage

# Lint
bun run lint                # Biome (lint + format check)

# Format
bun run format

# Typecheck
bun run typecheck           # bun check

# Build
bun run build
```

### Before Committing

```bash
bun run typecheck && bun run lint && bun test   # Full phase verification
```

## Phase & Task Workflow

Implementation is executed one phase at a time by a phase subagent. The primary
agent owns `plan.md`, `metadata.json`, the registry, and review artifacts.

### Task Lifecycle

1. Read the phase contract in `plan.md`, the relevant requirements in `spec.md`,
   and the applicable style guides.
2. Work through the phase's tasks in order.
3. For logic-bearing code, write or update the failing test before the
   implementation (TDD, Red-Green). Pure UI components are exempt; add or
   update tests alongside the behavior change when applicable.
4. Implement the smallest change that satisfies the task.
5. Run the targeted checks for the task.
6. Commit the task with a conventional commit message.
7. Report the task's status and commit SHA to the primary agent.

The subagent does **not** edit `plan.md`. The primary marks tasks complete after
it accepts the phase.

### Deviations

- If the phase goal requires a file outside `Touches`, make the smallest
  necessary change and record it in the report under `deviations`.
- If the work requires a product or design decision, stop and report `blocked`.
- Do not silently expand scope, add a dependency, or migrate unrelated code.
- If implementation deviates from `tech-stack.md`: stop, update
  `tech-stack.md` with a dated note, then resume.

### Phase Completion

1. Run the phase's `Verification` command exactly as written in `plan.md`.
2. Run `verify_phase` when it is configured and different from the phase command.
3. Write the evidence file using the configured evidence path.
4. Return the structured report to the primary agent.
5. Do not merge, rebase, reset, push, open a PR, or edit Conductor state files.

## Verification Strategy

### Layers

- **Static:** lint (`bun run lint`), format check, typecheck (`bun run typecheck`), build (`bun run build`)
- **Unit:** isolated behavior and edge cases (`bun test`) — logic-bearing modules only
- **E2E:** complete user flows (`bun run test:e2e`, Playwright)

The project has no separate integration layer; integration behavior is covered
by unit tests with mocked externals (Redis, Google Translate, database) and by
Playwright e2e flows.

### Commands

| Layer | Command | Required |
| --- | --- | --- |
| static | `bun run lint` | yes |
| static | `bun run typecheck` | yes |
| static | `bun run build` | yes |
| unit | `bun test` | yes |
| e2e | `bun run test:e2e` | when the phase touches user-facing flows |

### Services and Fixtures

- **Services:** PostgreSQL and Redis via `docker compose up -d`
- **Database:** Payload CMS 3 with Drizzle/Postgres; schema lives in `src/`
- **Fixtures/seed data:** `bun run seed` (`src/scripts/seed.ts`)
- **Environment variables:** copy `.env.example` to `.env`
- **Start/stop commands:** `docker compose up -d` / `docker compose down`

### Pass Criteria

- Every required command exits `0`.
- The coverage gate (80%) is met for new logic-bearing code.
- Every acceptance criterion has a test or a documented evidence artifact.
- No new Critical or High review findings remain.

### Evidence

Write a report to:

```text
conductor/tracks/<track-id>/verification/phase-<n>.md
```

Include: title; track, phase, date, branch, base and head commits; result
(`verified`, `failed`, `blocked`, or `partial`); a commands table (layer,
command, exit, summary); an acceptance-criteria table (ID, criterion, evidence,
status); evidence paths; deviations; and notes. Put binaries, screenshots, and
large reports under `.conductor/evidence/`; that directory is gitignored. The
report itself is committed with the track.

### Fallback Ladder

1. Run the full configured layer.
2. If a service is missing, start it with the documented command
   (`docker compose up -d`).
3. If it still cannot run, run the narrowest reliable subset and mark the phase
   `partial` with the reason.
4. Stop and ask the user only for credentials, hardware, or an external
   approval.

### Retry Policy

- A failed check may be fixed and re-run at most **2** times.
- If it still fails, report `failed` with the command and output.
- Never mark a phase `verified` when a required check did not run.

### Human-Only Exceptions

- Physical iPhone device testing (Safari developer tools, touch interactions,
  3G/4G performance) — the agent cannot perform this.
- Production deployment approval — merging to `main` triggers the deploy
  pipeline and requires explicit user sign-off.

## Quality Gates

Before a phase is accepted:

- [ ] Required tests pass (logic-bearing code covered)
- [ ] Coverage gate is met for new logic-bearing code
- [ ] Lint and format checks pass
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Code follows the applicable `conductor/code_styleguides/`
- [ ] No secrets, credentials, or PII are introduced
- [ ] Public behavior is documented when it changed
- [ ] Works correctly on mobile (responsive layouts, touch targets)
- [ ] Evidence is written and linked in `plan.md`

## Commit Guidelines

### Message Format

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation only
- `style`: formatting
- `refactor`: behavior-preserving change
- `test`: tests only
- `chore`: maintenance
- `conductor`: Conductor infrastructure (setup, plan updates)

### Examples

```bash
git commit -m "feat(auth): add remember-me session"
git commit -m "fix(posts): correct excerpt generation for short posts"
git commit -m "test(comments): cover emoji reaction limits"
```

Task-level commits are made by the phase subagent. The primary squashes them
into one phase commit on acceptance, unless a foreign commit landed in the range.
The plan update is a separate state commit.

## Definition of Done

A track is complete when:

1. Every phase is `verified` with a checkpoint and evidence.
2. The integrated verification on the track branch passes.
3. Review is `PASS` in strict mode: every finding is fixed or explicitly
   accepted with a reason recorded in `review.md`. No unresolved findings.
4. Post-review documentation sync is complete.
5. The registry and `metadata.json` show the track as complete.
6. When a remote exists, the branch is pushed. When `pr.enabled` is true, a PR
   is open or `pr_state: "unavailable"` records that PR creation could not run.

### Track Close-out

Close out on the implementation branch, before merging — no separate
post-merge archive PR:

1. Move `conductor/tracks/<id>/` to `conductor/archive/<id>/` (`git mv`).
2. Re-link the tracks.md entry to `./archive/<id>/index.md` (keep `[x]`).
3. Set `metadata.json`: `status: "complete"`, `pr_url` to the open PR,
   `pr_state: "merged"` (becomes true at merge; the merge commit lands it).
4. Commit as `conductor(close): ...`, push, and merge the track PR. Post-merge
   on `main` nothing further is required.

## Emergency Procedures

### Critical Bug in Production

1. Create a hotfix branch from `main`.
2. Write a failing regression test (if logic-bearing).
3. Implement the minimal fix.
4. Run the full verification strategy.
5. Open a PR immediately; do not batch unrelated work.

### Data Loss

1. Stop all write operations.
2. Restore from the latest verified backup.
3. Verify data integrity.
4. Document the incident and update the recovery procedure.

### Security Breach

1. Rotate all affected secrets.
2. Review access logs.
3. Patch the vulnerability.
4. Notify affected users when required.
5. Document the incident and update the security procedure.

## Deployment

Deploys run via GitHub Actions (`deploy.yml`) → Docker Hub → Coolify webhook
when `main` is updated.

### Pre-Deployment Checklist

- [ ] All required checks pass
- [ ] Coverage gate met
- [ ] Migrations reviewed and reversible
- [ ] Environment variables configured
- [ ] Backup created
- [ ] Rollback plan documented

### Deployment Steps

1. Merge the track PR to `main` (with explicit user approval — see
   Human-Only Exceptions).
2. Tag the release.
3. Deploy (GitHub Actions → Docker Hub → Coolify).
4. Run migrations.
5. Verify the critical path.
6. Monitor errors and key metrics.

### Post-Deployment

1. Monitor analytics and Sentry error logs.
2. Gather user feedback.
3. Record follow-ups as issues or a new track.

## Continuous Improvement

- Review this workflow after each track.
- Update commands and verification layers when the tooling changes.
- Record recurring review findings as process improvements.
- Keep the process as small as the project allows.
