# Track: R2-Direct Image Delivery

- **Track ID:** `r2_image_delivery_20261009`
- **Type:** Fix (performance)
- **Branch:** `perf/r2-images`
- **Status:** new
- **Created:** 2026-10-09

**Documents:**
- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)

## Summary

Follow-up to `hero_lcp_image_delivery_20261009`. Post-deploy Lighthouse confirmed the hero is discoverable (`requestDiscoverable: true`) but LCP remains 2.8–3.0s because every cover request double-hops: `/_next/image` → the app's `/api/media/file/` route → streams out of R2 → sharp optimizes. This track maps media URLs to the bucket's public custom domain (`storage.chasing-chapters.com`) at the application layer — the `@payloadcms/storage-s3` plugin can only emit the private S3 endpoint — so the optimizer fetches covers straight from R2 and the app leaves the image path entirely.
