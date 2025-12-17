# 📘 Product Requirements Document (PRD)

### Project Name: Chasing Chapters

A modern personal book-review platform.

---

# 1. Project Overview

Chasing Chapters is a beautifully crafted personal book review platform - a digital space that feels like a boutique bookstore website meets a personal literary journal. It allows sharing reading journeys with thoughtful, detailed reviews in an elegant and intimate yet shareable space.

The solution uses Next.js 16 (frontend) and Payload CMS 3.0 (backend) in a unified application, self-hosted, with ISR/SSG for performance. Initially for one author but scalable for multiple authors.

## Core Value Proposition

- **Personal Reading Journal**: A curated literary space that feels authentic and personal
- **Quality over Quantity**: Focus on thoughtful, detailed reviews rather than quick ratings
- **Beautiful Presentation**: Book covers and typography take center stage
- **Easy Publishing**: Streamlined workflow from draft to published review
- **Discovery Experience**: Beautiful layouts that inspire readers to explore more books
- **Bilingual Support**: Automatic translation between English and Indonesian

---

# 2. Goals & Objectives

## Primary Goals

- Enable easy writing and publishing of book reviews
- Provide an elegant, modern site for readers
- Ensure a smooth drafting and publishing workflow

## Secondary Goals

- Build a scalable multi-author foundation
- Deliver fast performance with ISR/SSG
- Maintain a clean and premium user experience
- Provide robust security and privacy protections

---

# 3. Target Users

## Primary User

**Author**

- Writes, edits, and publishes reviews
- Uploads cover images
- Organizes genres/tags
- Moderates comments

## Secondary Users

**Public Readers**

- Browse reviews
- Search by title, genre, author
- Like/react/comment
- Switch between English and Indonesian

---

# 4. User Stories

## Author

- Log in and access a private CMS
- Create a new review using intuitive templates
- Save drafts and schedule publication
- Publish a completed review instantly
- Add genres, mood tags, and cover images
- Feature selected books on the homepage
- Track reading dates (started and finished)
- Highlight favorite quotes with special formatting
- View personal reading stats (books per month, favorite genres, average rating)
- Moderate and approve comments
- See reviews automatically translated to Indonesian

## Reader

- View the homepage with featured and latest reviews
- Search for books by title, author, or genre
- Browse by genres, tags, and moods
- Discover curated reading lists
- React to reviews (likes)
- Leave comments
- Toggle between English and Indonesian translations
- Share reviews on social media

---

# 5. Feature Requirements

## 5.1 Review Features

Each review includes:

- Book title
- Book author
- Rating (1–5 stars)
- Genre(s)
- Tags
- Cover image upload (stored on Cloudflare R2)
- Review content with rich formatting:
  - "What I Loved" section
  - "What Could Be Better" section
  - "Perfect For" recommendations
- Favorite quotes with visual highlight
- Reading dates (started/finished)
- Mood tags (cozy, intense, thought-provoking, etc.)
- Featured toggle (homepage)
- Likes count (with atomic database operations)
- Views count (with atomic database operations)
- Comments with moderation and spam detection
- Draft/Published/Scheduled status
- Automatic translation to Indonesian

## 5.2 Public Site Features

- Homepage:
  - Featured books carousel
  - Latest reviews grid
  - Search bar
- Review detail pages with reading progress bar
- Genre pages
- Tag pages
- Reading list pages
- Search results
- Comments (with moderation and spam filtering)
- Like system (rate-limited)
- Language toggle (English/Indonesian)
- Social share buttons
- Related reviews recommendations
- RSS feed for new reviews

## 5.3 Admin/CMS Features (Payload CMS)

- Author login with secure authentication
- Dashboard to manage:
  - Reviews (drafts, published, scheduled)
  - Genres, tags, and mood tags
  - Media uploads (stored on Cloudflare R2)
  - Curated reading lists
  - Commenters (with ban capability)
- Comment moderation panel
- On-demand page revalidation when content is published

## 5.4 Security Features

- **Content Security Policy (CSP)**: Split strategy with restrictive CSP for public routes and relaxed CSP for admin
- **Rate Limiting**: Redis-based rate limiting on:
  - View tracking (1/min per IP per review)
  - Like toggling (5/min per IP per review)
  - Comment submission (3/min per IP)
  - Comment reporting (2/min per IP)
- **Spam Detection**: Blocklist-based spam filtering for comments
- **Email Privacy**: Commenter emails hashed with SHA-256
- **Atomic Operations**: Race-condition-free view/like tracking using PostgreSQL
- **Security Headers**: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

## 5.5 Monitoring & Observability

- **Sentry Error Tracking**: Production error monitoring with:
  - Automatic error capture
  - Performance monitoring (10% sampling)
  - Session replay on errors
  - Source map uploads for readable stack traces

---

# 6. Future Features (Not included now)

- Bookshelves (Want to Read / Reading / Finished)
- Reading progress tracking
- Goodreads API integration
- Multi-author system
- User accounts for commenters
- Newsletter integration
- Reading challenge tracker

---

# 7. Content Model (Payload CMS Collections)

## Users (Authors)

- name
- email
- avatar
- bio
- role (admin/writer)

## Reviews

- title
- slug (auto-generated)
- bookAuthor
- rating
- genres (relation)
- tags (relation)
- moodTags (relation)
- coverImage (upload to R2)
- reviewContent (rich text, localized)
- whatILoved (rich text, localized)
- whatCouldBeBetter (rich text, localized)
- perfectFor (rich text, localized)
- favoriteQuotes (array, localized)
- readingStartDate
- readingFinishDate
- featured (boolean)
- likes (integer, atomic updates)
- views (integer, atomic updates)
- status (draft/published)
- publishDate (datetime)
- author (relation to Users)
- createdAt
- updatedAt

## Genres

- name
- slug

## Tags

- name
- slug
- description

## MoodTags

- name
- slug
- color (hex)
- icon (emoji)

## ReadingLists

- title
- slug
- description
- reviews (relation to Reviews)
- coverImage (upload)
- featured (boolean)
- createdAt

## Comments

- authorName
- content
- relatedReview (relation)
- commenter (relation)
- status (pending/approved/rejected/reported)
- reportCount
- reportedBy (array)
- createdAt

## Commenters

- emailHash (SHA-256 hashed email)
- displayName
- approvedCommentCount
- trusted (boolean)
- banned (boolean)

## Media

- file (stored on Cloudflare R2)
- alt text
- createdAt

---

# 8. Architecture Overview

**Single Next.js 16 Application with Integrated Payload CMS**

The platform is built as a unified Next.js application with Payload CMS integrated directly.

## Project Structure:

```
chasing-chapters/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (payload)/          # Payload routes
│   │   │   ├── admin/          # Admin panel (/admin)
│   │   │   └── api/            # REST API (/api/*)
│   │   ├── (public)/           # Public routes
│   │   │   ├── reviews/        # Review pages
│   │   │   ├── reading-lists/  # Reading list pages
│   │   │   └── ...
│   │   └── actions/            # Server Actions
│   ├── collections/            # Payload CMS collections
│   ├── components/             # React components
│   ├── hooks/                  # Payload hooks (translation, revalidation)
│   ├── lib/                    # Utilities
│   │   ├── blocklist.ts        # Spam detection
│   │   ├── db.ts               # Atomic database operations
│   │   ├── env.ts              # Environment validation
│   │   ├── rate-limit.ts       # Rate limiting
│   │   ├── redis.ts            # Redis client
│   │   └── translate.ts        # Translation utilities
│   └── scripts/                # Seed and utility scripts
├── sentry.*.config.ts          # Sentry configuration
├── payload.config.ts           # Payload configuration
├── next.config.ts              # Next.js configuration
├── Dockerfile                  # Docker image for VPS
└── docker-compose.yml          # Development environment
```

## Technology Stack:

**Frontend + Backend (Unified):**

- Next.js 16 with App Router
- Payload CMS 3.0 (integrated via @payloadcms/next)
- React 19 (Server & Client Components)

**Database & Caching:**

- PostgreSQL 16 with @payloadcms/db-postgres adapter
- Redis for translation caching and rate limiting

**Media Storage:**

- Cloudflare R2 via @payloadcms/storage-s3

**Translation:**

- Google Cloud Translation API with Redis caching

**Styling:**

- Tailwind CSS 4 with custom design system
- Typography: Playfair Display (headings) + Inter (body)
- Radix UI + shadcn/ui components
- Motion (Framer Motion) for animations

**Data Mutations:**

- Next.js Server Actions for reactions and comments
- Atomic PostgreSQL operations for view/like counters
- Payload Local API for direct database access (no HTTP overhead)

**Monitoring:**

- Sentry for error tracking and performance monitoring

**Deployment:**

- Docker container on VPS (via Coolify)
- GitHub Actions for CI/CD
- Standalone Next.js build for minimal image size

## How It Works:

**Admin Panel** (`/admin`):

- Payload CMS admin interface served by Next.js
- Full CMS control: create, edit, publish, moderate comments
- Changes trigger automatic page revalidation

**REST API** (`/api/*`):

- Payload REST API served through Next.js routes
- Used by frontend for data fetching
- Endpoints: `/api/reviews`, `/api/genres`, `/api/tags`, etc.

**Public Site** (`/`):

- Next.js pages fetch data from Payload
- ISR/SSG for fast page loads
- Server Actions for interactions (likes, comments)
- Automatic translation to Indonesian on publish

**Revalidation Flow:**

1. Content updated in Payload admin
2. Payload hook triggers Next.js revalidation
3. Static pages regenerate automatically
4. Users see updated content immediately

---

# 9. UI & UX Requirements

Design Style:

- **Visual Aesthetic**: Modern, classy, elegant with boutique bookstore feel
- **Typography**:
  - Headings: Elegant serif fonts (Playfair Display)
  - Body: Clean sans-serif (Inter)
  - Good line height and spacing for readability
- **Color Palette**:
  - Warm neutrals (cream, beige, soft white)
  - Accent colors derived from book covers
  - Dark mode with deep navy/charcoal backgrounds
- **Layout**:
  - Magazine-style with generous white space
  - Large, prominent book covers with subtle shadows
  - Card-based grid layouts for browsing
  - Smooth transitions and hover effects
- **Responsive**: Fully responsive across desktop, tablet, and mobile
- **Micro-interactions**:
  - Smooth page transitions
  - Hover effects on cards
  - Loading states
  - Reading progress bar on review pages

Design Inspiration:

- **Goodreads**: Structure and organization
- **Pinterest**: Card layouts and visual discovery
- **Medium**: Reading experience and typography
- **Boutique Bookstores**: Curated, intimate feel

### Key Pages Design:

**Homepage:**

- Hero section with featured review carousel
- Grid of latest reviews
- Search bar prominently placed

**Review Detail:**

- Large book cover
- Title, author, rating
- Language toggle (EN/ID)
- Structured review sections
- Quote callouts with special styling
- Like and share buttons
- Related reviews at bottom
- Comments section

**Browse Pages:**

- Grid view with book covers
- Sort options (recent, rating, title)

---

# 10. SEO & Performance Requirements

## SEO Best Practices

Automatically implemented on every page:

- **Title Tags**: Descriptive, unique titles for each page
- **Meta Descriptions**: Compelling summaries that accurately describe content
- **Heading Structure**: Single `<h1>` per page with proper heading hierarchy
- **Semantic HTML**: Use HTML5 semantic elements
- **OpenGraph Tags**: Rich social media previews with images
- **Structured Data**: Schema.org markup for book reviews
- **Alt Text**: Descriptive alt text for all images
- **Sitemap**: Auto-generated XML sitemap
- **metadataBase**: Configured for proper OG/Twitter image resolution

## Performance Optimization

- **Image Optimization**:
  - Next.js Image component with automatic optimization
  - WebP and AVIF formats
  - Lazy loading for below-fold images
  - Images served from Cloudflare R2 CDN
- **Code Splitting**: Automatic route-based code splitting
- **ISR/SSG**: Static generation with on-demand revalidation
- **Caching Strategy**:
  - Static pages cached
  - Translation results cached in Redis (24h TTL)
  - Rate limit counters in Redis
- **Bundle Optimization**:
  - Tree-shaking for unused code
  - Optimized package imports (lucide-react, embla-carousel, date-fns)

---

# 11. Security Implementation

## Content Security Policy

Split CSP strategy:

- **Public routes**: Restrictive CSP blocking inline scripts
- **Admin routes**: Relaxed CSP allowing Payload CMS functionality
- **Sentry integration**: CSP allows reporting to sentry.io

## Rate Limiting

Redis-based rate limiting with configurable windows:

- View tracking: 1 request/minute per IP per review
- Like toggling: 5 requests/minute per IP per review
- Comment submission: 3 requests/minute per IP
- Comment reporting: 2 requests/minute per IP

## Data Privacy

- Commenter emails hashed with SHA-256 before storage
- No plain-text email storage
- Trusted commenter system based on approved comment count

## Database Integrity

- Atomic increment/decrement operations for view/like counts
- Prevents race conditions under concurrent load

---

# 12. Monitoring & Observability

## Sentry Integration

- **Error Tracking**: Automatic capture of unhandled errors
- **Performance Monitoring**: 10% sampling of transactions
- **Session Replay**: 1% of sessions, 100% on errors
- **Source Maps**: Uploaded during CI/CD build
- **Production Only**: Disabled in development

---

# 13. Development & Deployment

## Development Workflow

```bash
# Install dependencies
bun install

# Start database and Redis
docker compose up -d

# Run development server
bun run dev

# Run tests
bun run test:vitest

# Type check
bun run typecheck

# Lint
bun run lint
```

## CI/CD Pipeline (GitHub Actions)

1. **Build**: Docker image built with all environment variables
2. **Push**: Image pushed to Docker Hub
3. **Deploy**: Coolify webhook triggers deployment

## Required Environment Variables

| Variable            | Description                        |
| ------------------- | ---------------------------------- |
| `DATABASE_URI`      | PostgreSQL connection string       |
| `PAYLOAD_SECRET`    | Payload CMS secret (min 32 chars)  |
| `R2_*`              | Cloudflare R2 storage credentials  |
| `GOOGLE_CLOUD_*`    | Google Translation API credentials |
| `REDIS_URL`         | Redis connection string            |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps  |

---

# 14. Success Metrics

Primary KPIs:

- Number of reviews published
- Time required to publish a new review
- Error rate in production (via Sentry)
- Page load performance

Secondary KPIs:

- Engagement (likes, comments)
- Translation accuracy
- Cache hit rates

---

# 15. Risks & Mitigations

| Risk                        | Mitigation                                |
| --------------------------- | ----------------------------------------- |
| Payload admin UI complexity | Simplified fields, hidden advanced config |
| Reaction/comment scaling    | Rate limiting and atomic operations       |
| Translation API costs       | Redis caching with 24h TTL                |
| Error visibility            | Sentry integration with alerting          |
| Security vulnerabilities    | CSP, rate limiting, input validation      |
| Race conditions             | Atomic PostgreSQL operations              |

---
