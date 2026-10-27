# Review Reading Experience + TOC — Specification

> Requirements are stable. Once an `FR`, `NFR`, or `AC` ID is approved, do not
> renumber it. If a requirement is removed, mark it `Withdrawn` instead of
> deleting it.

## Overview

Add a navigable long-form reading experience to the review detail page: a Table of Contents with scrollspy, shareable anchor links, per-locale reading-time estimates, and quote-level copy/share. This is the natural follow-up to the content-typography tracks — typography made prose beautiful, this makes it navigable.

## Problem / Motivation

Reviews are long structured documents (body + What I Loved / Could Be Better / Perfect For + quotes) with no in-page navigation. Readers cannot jump to sections, cannot estimate commitment, cannot link to a section, and cannot share a quote without manual copy-paste. On mobile the problem is worse. If unsolved, long reviews feel heavy and engagement (scroll depth, quote shares) stays flat despite the typography polish.

## Goals & Success Metrics

- **Goal:** Readers can navigate long reviews via TOC on desktop and mobile.
- **Metric:** TOC renders EN/ID, scrollspy tracks correctly, e2e covers desktop + mobile navigation.
- **Goal:** Readers see accurate reading-time commitment.
- **Metric:** Unit tests pin 200wpm calc across body + structured sections + quotes per locale.
- **Goal:** Quotes and sections are shareable.
- **Metric:** Copy-link and quote copy/share show toast feedback; `navigator.share` used when available; e2e verifies clipboard path.

## Scope

### In Scope

- TOC component: sticky desktop aside + collapsible `<details>`/toggle on mobile, matching browse sidebar pattern
- Heading source: fixed structured sections (What I Loved / Could Be Better / Perfect For / Quotes) + H2/H3 extracted from Lexical body in document order with slugified unique IDs
- Anchor IDs on headings, hash updates on click without full reload, direct `/reviews/[slug]#anchor` deep-link works with ISR
- Copy-link affordance on hover/focus for headings
- Reading-time display ("X min read") computed per locale at ~200wpm over body + structured sections + quotes
- Quote share: copy quote + URL to clipboard with sonner toast, `navigator.share` fallback when available, consistent with existing ShareButton
- Bilingual parity: TOC labels from dictionary, headings/time recomputed per locale, EN/ID tests
- A11y, dark-mode, reduced-motion, empty-state handling

### Out of Scope

- RelatedReviews / CommentSection TOC entries or anchors
- Homepage, browse (`/reviews`), reading-lists, about, admin changes
- Search relevance changes
- New animation deps or design-system overhaul
- Newsletter, bookshelves, stats pages

## Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | TOC renders as sticky aside on desktop and collapsible block on mobile | must |
| FR-2 | TOC entries combine fixed structured sections present in the review with H2/H3 extracted from Lexical body in document order | must |
| FR-3 | TOC tracks active section on scroll via a scroll-position rule (last heading at or above the viewport bottom; adopted in R2 when no observer band geometry could satisfy both click and scroll landings) and smooth-scrolls on click (instant when prefers-reduced-motion) | must |
| FR-4 | Every TOC entry has a stable slug anchor; clicking updates the URL hash without reload; pasting a `#anchor` URL scrolls to that heading; copy-link copies the full anchor URL | must |
| FR-5 | Reading-time badge shows per-locale estimate at ~200wpm over body + structured sections + quotes | must |
| FR-6 | Each favorite quote offers copy + share: copies `"<quote>" — <book> <url>` to clipboard with toast, invokes `navigator.share` when available | must |
| FR-7 | TOC labels, reading-time strings, and share feedback are fully translated EN/ID; headings and time recompute when locale switches | must |

## Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Zero new heavy dependencies; CSS + scroll-position handler only (no IntersectionObserver: adopted in R2, see FR-3); server-renders ISR-safe with no `ssr:false` above the fold; LCP cover unaffected |
| NFR-2 | No layout shift from TOC; sticky aside does not overlap content at any breakpoint; mobile toggle meets 44px touch targets |
| NFR-3 | Accessible: `nav aria-label`, focus-visible states, keyboard-operable toggle and links, `prefers-reduced-motion` disables smooth scroll/spy animation |
| NFR-4 | Dark-mode correct via existing tokens; prose-teal headings compatible; code inline with `prose-teal` theme |
| NFR-5 | Client JS minimal; extraction is pure functions covered by unit tests; no blocking on first paint |

## Acceptance Criteria

| ID | Criterion | Verifies |
| --- | --- | --- |
| AC-1 | TOC visible as sticky aside on lg+ and as collapsed toggle on mobile that expands to the same entries | FR-1 |
| AC-2 | Review with H2/H3 + all structured sections lists them in document order; missing sections are omitted, not shown empty | FR-2 |
| AC-3 | Scrolling the article updates the TOC active link; clicking a TOC link scrolls to the heading (instant with reduced-motion) | FR-3 |
| AC-4 | Each heading has `id="<slug>"`; loading `/en/reviews/<slug>#what-i-loved` scrolls there; copy-link button copies absolute URL with hash | FR-4 |
| AC-5 | Reading-time badge reads e.g. "5 min read" / ID equivalent and changes consistently when switching EN↔ID on the same review | FR-5 |
| AC-6 | Quote copy shows sonner toast success; on share-capable browsers `navigator.share` is invoked with quote + URL | FR-6 |
| AC-7 | Switching locale translates all TOC chrome while preserving anchor targets; `bun test` covers dictionary parity | FR-7 |
| AC-8 | Review with <2 total entries hides the TOC block but still shows reading-time; no empty card is rendered | FR-1, FR-2 |
| AC-9 | `bun run typecheck && bun run lint && bun test && bun run build` pass with no new dependency in `package.json` | NFR-1, NFR-5 |
| AC-10 | Keyboard-only traversal reaches toggle, all links, copy buttons with visible focus; axe-style manual check shows no landmark violations | NFR-3 |

## Edge Cases

- No H2/H3 and only 0-1 structured sections: hide TOC, keep reading-time
- Duplicate heading text: slugs suffixed `-2`, `-3` to stay unique and stable
- Empty quotes array: Quotes entry omitted from TOC, quote-share UI absent
- ID locale missing a heading translation: falls back to EN heading text for ID generation but keeps locale prefix in URL
- JS disabled: SSR heading `id`s still render so anchor jumps work; TOC links are plain `<a href="#…">`
- Reduced motion: no smooth scroll, spy updates without animation
- Very long TOC (20+ headings): aside scrolls internally with `max-h` + overflow, never pushes article
- Special characters / emoji in headings: slugifier strips/normalizes, never emits empty id (falls back to `section-<index>`)

## Dependencies

- **Tracks:** none (builds on completed `20261026-content-typography` + `20261027-typography-residuals`, both merged)
- **External:** none (no new services, env, or credentials; uses existing translation pipeline and sonner)

## Open Questions & Assumptions

- **Assumption:** 200wpm applies equally to EN and ID for v1; revisit if ID readers report different pace — reason: keeps estimate simple and testable
- **Assumption:** Lexical JSON heading shape (`type: "heading"`, `tag: "h2"/"h3"`) is stable across Payload 3.90 — reason: observed in current reviews payload
- **Assumption:** Reusing existing `ShareButton` + `sonner` patterns is sufficient for quote-share — reason: avoids new UI paradigms

## References

- docs/PRD.md §5.2 Public Site, §9 UI & Requirements (review detail, reading progress)
- src/app/(public)/[locale]/reviews/[slug]/page.tsx — integration point
- src/components/ReadingProgressBar.tsx, src/components/ShareButton.tsx — patterns to extend
- conductor/archive/20261026-content-typography, conductor/archive/20261027-typography-residuals — typography foundation
