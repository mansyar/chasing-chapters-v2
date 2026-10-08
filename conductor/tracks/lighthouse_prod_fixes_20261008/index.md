# Track: lighthouse_prod_fixes_20261008

**Lighthouse Production Fixes** — fix the four defects surfaced by the 2026-10-08 production Lighthouse run (Perf 71 / BP 92 / A11y 94):

- Carousel prev/next accessible names (axe `button-name`)
- `static.cloudflareinsights.com` in the production CSP
- Hero-carousel CLS shift (0.116 → < 0.1)
- Cold root-document TTFB (3.5s) investigation + smallest proven mitigation

- **Spec:** [spec.md](./spec.md)
- **Plan:** [plan.md](./plan.md)
- **Metadata:** [metadata.json](./metadata.json)
- **Branch:** `fix/lighthouse-prod-scores`
- **Type:** fix/chore-hybrid
- **Status:** new
