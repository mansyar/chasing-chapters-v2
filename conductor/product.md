# Chasing Chapters — Product Definition

## Vision
A beautifully crafted personal book-review platform — a boutique bookstore meets a personal literary journal.

## Target Users
- **Owner (author/admin/writer):** writes and manages reviews via Payload admin
- **Readers:** general public, English and Indonesian speakers

## Core Features
1. **Reviews** — rich structured content (What I Loved / Could Be Better / Perfect For), favorite quotes with page numbers, 5-star ratings, cover images, drafts + versions
2. **Discovery** — browse by genre/tag/mood, search by title/author/genre, curated reading lists, related reviews
3. **Engagement** — guest comments with moderation/spam-filtering/trust levels, likes, view tracking
4. **Bilingual** — EN/ID content with background auto-translation (Google Cloud Translation), language toggle
5. **SEO & Distribution** — JSON-LD structured data, sitemap, OpenGraph, RSS feed
6. **Admin** — role-based access (admin/writer), analytics dashboard, comment moderation

## Quality Pillars
Performance (ISR + on-demand revalidation, caching, post-deploy boot warm-up so the first response after a restart is not seconds, server-rendered above-the-fold content so the LCP image ships in the initial HTML), Security (rate-limiting, CSP, hashed emails, spam detection), SEO, Polish (dark mode, skeletons, blur placeholders)

## Non-Goals
Multi-tenant platform, user accounts/registration for readers, e-commerce, mobile app
