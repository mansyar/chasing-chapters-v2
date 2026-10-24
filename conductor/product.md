# Chasing Chapters — Product Definition

## Vision
A beautifully crafted personal book-review platform — a boutique bookstore meets a personal literary journal.

## Target Users
- **Owner (author/admin/writer):** writes and manages reviews via Payload admin
- **Readers:** general public, English and Indonesian speakers

## Core Features
1. **Reviews** — rich structured content (What I Loved / Could Be Better / Perfect For), favorite quotes with page numbers, 5-star ratings, cover images, drafts + versions
2. **Discovery** — browse by genre/tag/mood, search by title/author/genre, curated reading lists, related reviews
3. **Engagement** — guest comments with automatic spam screening on every submission: clean comments auto-approve, spam-flagged ones are held pending with their persisted spam signals visible in admin, trusted commenters (≥3 approved comments) bypass the hold, banned users are rejected; likes, view tracking
4. **Bilingual** - the whole public site in English or Indonesian: the locale lives in the path (`/en`, `/id`) with a remembered preference, the interface is translated from typed dictionaries, metadata/hreflang/RSS follow the locale, and authors supply Indonesian genre, tag, reading-list and review-title values by hand (an empty one falls back to English). Review bodies are auto-translated (Google Cloud Translation) with per-review status tracking
5. **SEO & Distribution** — JSON-LD structured data, sitemap, OpenGraph, RSS feed
6. **Admin** — role-based access (admin/writer), analytics dashboard, comment moderation

## Quality Pillars
Performance (ISR + on-demand revalidation, caching, post-deploy boot warm-up so the first response after a restart is not seconds, server-rendered above-the-fold content so the LCP image ships in the initial HTML), Security (rate-limiting, CSP, hashed emails, spam detection), SEO, Polish (dark mode, skeletons, blur placeholders)

## Non-Goals
Multi-tenant platform, user accounts/registration for readers, e-commerce, mobile app
