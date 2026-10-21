# Track: PR Validation CI

- **ID:** `20261021-pr-validation-ci`
- **Type:** chore
- **Priority:** high
- **Branch:** `chore/20261021-pr-validation-ci`
- **Depends on:** none

Automated PR validation: a GitHub Actions workflow (typecheck, strict lint, unit tests, production build with Postgres) runs on every PR to `main`, enforced by a required status check.

## Artifacts

- [Specification](./spec.md)
- [Plan](./plan.md)
- [Metadata](./metadata.json)

`verification/`, `review.md`, and `pr.md` are created during implementation and review.
