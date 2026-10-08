# Track: Bilingual Translation Reliability

**ID:** translation_reliability_20261008 · **Type:** Bug/Robustness · **Status:** new
**Branch:** `track/translation-reliability`

The EN→ID translation pipeline silently persists English fallback text into the ID locale on Google Translate API failures, with no retry, no admin visibility, and no recovery path. This track makes translation batched, retrying, observable (status field + re-translate action), and safe for manually-edited ID content (per-review auto-translate toggle).

## Documents

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)
