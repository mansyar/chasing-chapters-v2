# Track: Hero LCP & Image Delivery Optimization

- **Track ID:** `hero_lcp_image_delivery_20261009`
- **Type:** Fix (performance)
- **Branch:** `perf/hero-lcp`
- **Status:** new
- **Created:** 2026-10-09

## Documents

- [Specification](./spec.md) — the 'what' and 'how' before any code
- [Implementation Plan](./plan.md) — phased execution roadmap following the project Workflow
- [Metadata](./metadata.json)

## Summary

Follow-up to `lighthouse_prod_fixes_20261008`. That track's fixes are verified in production (Accessibility 100, Best Practices 96, CLS 0, TTFB 230ms), but Performance held at 71 because LCP (3.0s) is an unrelated bottleneck: the hero carousel is loaded with `ssr: false`, so the LCP image is absent from the initial HTML and costs 1041ms of resource load delay.

Fixes the hero by server-rendering it, stops the image optimizer from re-entering the app on constant cache misses, and records the measurements.