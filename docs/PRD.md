# 📘 Product Requirements Document (PRD)

### Project Name: Chasing Chapters

A modern personal book-review platform for your wife.

---

# 1. Project Overview

Chasing Chapters is a beautifully crafted personal book review platform - a digital space that feels like a boutique bookstore website meets a personal literary journal. It allows your wife to share her reading journey with thoughtful, detailed reviews in an elegant and intimate yet shareable space.

The solution uses Next.js 15 (frontend) and Payload CMS (backend) in a monorepo, self-hosted, with ISR/SSG for performance. Initially for one author but scalable for multiple authors.

## Core Value Proposition

- **Personal Reading Journal**: A curated literary space that feels authentic and personal
- **Quality over Quantity**: Focus on thoughtful, detailed reviews rather than quick ratings
- **Beautiful Presentation**: Book covers and typography take center stage
- **Easy Publishing**: Streamlined workflow from draft to published review
- **Discovery Experience**: Beautiful layouts that inspire readers to explore more books

---

# 2. Goals & Objectives

## Primary Goals

- Enable your wife to easily write and publish book reviews.
- Provide an elegant, modern site for readers.
- Ensure a smooth drafting and publishing workflow.

## Secondary Goals

- Build a scalable multi-author foundation.
- Deliver fast performance with ISR/SSG.
- Maintain a clean and premium user experience.

---

# 3. Target Users

## Primary User

**Author (your wife)**

- Writes, edits, and publishes reviews
- Uploads cover images
- Organizes genres/tags

## Secondary Users

**Public Readers**

- Browse reviews
- Search by title, genre, author
- Like/react/comment

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

## Reader

- View the homepage with featured and latest reviews
- Search for books by title, author, or genre
- Browse by genres, tags, and moods
- Discover curated reading lists
- React to reviews (likes, emojis)
- Leave comments

---

# 5. Feature Requirements

## 5.1 Review Features

Each review includes:

- Book title
- Book author
- Rating (1–5 stars)
- Genre(s)
- Tags
- Cover image upload
- Review content with rich formatting:
  - "What I Loved" section
  - "What Could Be Better" section
  - "Perfect For" recommendations
- Favorite quotes with visual highlight
- Reading dates (started/finished)
- Mood tags (cozy, intense, thought-provoking, etc.)
- Featured toggle (homepage)
- Likes count
- Reactions (heart, fire, thumbs up)
- Comments with moderation
- Draft/Published/Scheduled status

## 5.2 Public Site Features

- Homepage:
  - Featured books
  - Latest reviews
  - Search bar
- Review detail pages
- Genre pages
- Tag pages
- Search results
- Comments (with moderation)
- Reactions/likes (client-side)
- RSS feed for new reviews
- Social share cards (auto-generated)

## 5.3 Admin/CMS Features

- Author login with secure authentication
- Dashboard to manage:
  - Reviews (drafts, published, scheduled)
  - Genres, tags, and mood tags
  - Media uploads and organization
  - Curated reading lists
- Comment moderation panel
- Personal reading stats and insights
- Review templates for different genres

## 5.4 Engagement Features

- **Share Cards**: Auto-generated beautiful social media images for each review
- **RSS Feed**: Allow readers to subscribe to new reviews
- **Reading Challenge**: Annual reading goals tracker (e.g., "Read 24 books in 2025")
- **Contextual Recommendations**: "If you liked this review, check out..." based on genres/tags
- **Newsletter Integration**: Optional email updates for new reviews (future)

---

# 6. Future Features (Not included now)

- Bookshelves (Want to Read / Reading / Finished)
- Reading progress tracking
- Goodreads API integration
- Multi-author system
- User accounts for commenters
- Analytics dashboard

---

# 7. Content Model (Payload CMS Collections)

## Authors

- name
- avatar
- bio
- role (admin/writer)

## Reviews

- title
- bookAuthor
- rating
- genres (relation)
- tags (relation)
- moodTags (relation)
- coverImage (upload)
- reviewContent (rich text)
- whatILoved (rich text)
- whatCouldBeBetter (rich text)
- perfectFor (rich text)
- favoriteQuotes (array of rich text)
- readingStartDate
- readingFinishDate
- featured (boolean)
- likes (integer)
- reactions (object: heart, fire, thumbsUp)
- status (draft/published/scheduled)
- publishDate (datetime)
- author (relation to Authors)
- relatedReviews (relation to Reviews)
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
- icon (optional)

## ReadingLists

- title
- description
- reviews (relation to Reviews)
- coverImage (upload)
- slug
- featured (boolean)
- createdAt

## Comments

- authorName
- content
- relatedReview
- createdAt
- approved (boolean)

## Media

- cover images and uploads

---

# 8. Architecture Overview

**Single Next.js 15 Application with Integrated Payload CMS**

The platform is built as a unified Next.js application with Payload CMS integrated directly, eliminating the complexity of a monorepo while maintaining all functionality.

## Project Structure:

```
chasing-chapters/
├── app/                    # Next.js 15 App Router
│   ├── (payload)/         # Payload routes
│   │   ├── admin/         # Admin panel (/admin)
│   │   └── api/           # REST API (/api/*)
│   ├── (public)/          # Public routes
│   │   ├── reviews/       # Review pages
│   │   ├── genres/        # Genre pages
│   │   ├── tags/          # Tag pages
│   │   └── search/        # Search
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Homepage
│   └── globals.css        # Global styles
├── collections/           # Payload CMS collections
│   ├── Authors.ts
│   ├── Reviews.ts
│   ├── Genres.ts
│   ├── Tags.ts
│   ├── MoodTags.ts
│   ├── ReadingLists.ts
│   ├── Comments.ts
│   └── Media.ts
├── actions/               # Next.js Server Actions
│   ├── reactions.ts       # Like/reaction mutations
│   └── comments.ts        # Comment submissions
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── reviews/          # Review components
│   └── layout/           # Header, Footer, Nav
├── access/               # Payload access control
├── hooks/                # Payload hooks
├── lib/                  # Utilities
├── public/               # Static assets
├── payload.config.ts     # Payload configuration
├── next.config.js        # Next.js configuration
├── Dockerfile            # Docker image for VPS
└── docker-compose.yml    # Development environment
```

## Technology Stack:

**Frontend + Backend (Unified):**

- Next.js 15 with App Router
- Payload CMS 3.0 (integrated via @payloadcms/next)
- React 19 (Server & Client Components)

**Database:**

- PostgreSQL 16 with @payloadcms/db-postgres adapter

**Styling:**

- Tailwind CSS with custom design system
- Typography: Playfair Display (headings) + Inter (body)

**Data Mutations:**

- Next.js Server Actions for reactions and comments
- Payload Local API for direct database access (no HTTP overhead)

**Deployment:**

- Docker container on VPS
- Standalone Next.js build for minimal image size

## How It Works:

**Admin Panel** (`/admin`):

- Payload CMS admin interface served by Next.js
- Your wife logs in and manages reviews, genres, tags, etc.
- Full CMS control: create, edit, publish, moderate comments

**REST API** (`/api/*`):

- Payload REST API served through Next.js routes
- Used by frontend for data fetching
- Endpoints: `/api/reviews`, `/api/genres`, `/api/tags`, etc.

**Public Site** (`/`):

- Next.js pages fetch data from Payload
- ISR/SSG for fast page loads
- Server Actions for interactions (likes, comments)

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
  - Headings: Elegant serif fonts (e.g., Playfair Display, Lora)
  - Body: Clean sans-serif (e.g., Inter, Open Sans)
  - Good line height and spacing for readability
- **Color Palette**:
  - Warm neutrals (cream #F5F5DC, beige #F5F5DC, soft white #FAFAFA)
  - Accent colors derived from book covers
  - Dark mode option with deep navy/charcoal backgrounds
- **Layout**:
  - Magazine-style with generous white space
  - Large, prominent book covers with subtle shadows
  - Card-based grid layouts for browsing
  - Smooth transitions and hover effects
- **Responsive**: Fully responsive across desktop, tablet, and mobile
- **Micro-interactions**:
  - Animated bookmarks
  - Smooth page transitions
  - Hover effects on cards
  - Loading states with book-themed animations

Design Inspiration:

- **Goodreads**: Structure and organization
- **Pinterest**: Card layouts and visual discovery
- **Medium**: Reading experience and typography
- **Boutique Bookstores**: Curated, intimate feel

### Key Pages Design:

**Homepage:**

- Hero section with featured review
- Grid of latest reviews (3-4 columns)
- Curated reading lists section
- Search bar prominently placed

**Review Detail:**

- Large book cover on left
- Title, author, rating on right
- Structured review sections below
- Quote callouts with special styling
- Related books at bottom

**Browse Pages:**

- Filter sidebar (genres, moods, ratings)
- Grid view with book covers
- Sort options (recent, rating, title)

---

# 10. SEO & Performance Requirements

## SEO Best Practices

Automatically implement on every page:

- **Title Tags**: Descriptive, unique titles for each page (max 60 characters)
- **Meta Descriptions**: Compelling summaries that accurately describe content (150-160 characters)
- **Heading Structure**: Single `<h1>` per page with proper heading hierarchy (h1 → h2 → h3)
- **Semantic HTML**: Use HTML5 semantic elements (`<article>`, `<section>`, `<nav>`, etc.)
- **Unique IDs**: All interactive elements have unique, descriptive IDs
- **OpenGraph Tags**: Rich social media previews with images
- **Structured Data**: Schema.org markup for book reviews (Review schema)
- **Alt Text**: Descriptive alt text for all images
- **Sitemap**: Auto-generated XML sitemap
- **Robots.txt**: Properly configured for search engines

## Performance Optimization

- **Image Optimization**:
  - Next.js Image component with automatic optimization
  - WebP format with fallbacks
  - Blur placeholders for book covers
  - Lazy loading for below-fold images
- **Code Splitting**: Automatic route-based code splitting
- **ISR/SSG**: Static generation with revalidation for fast load times
- **Caching Strategy**:
  - Static pages cached at CDN edge
  - API responses cached appropriately
  - Service worker for offline support (future)
- **Lighthouse Targets**:
  - Performance: 95+
  - Accessibility: 100
  - Best Practices: 100
  - SEO: 100

---

# 11. Success Metrics

Primary KPIs:

- Number of reviews published
- Time required to publish a new review
- Lighthouse performance scores
- Engagement (likes, reactions)

Secondary KPIs:

- Returning visitors
- Search usage
- Time spent on pages

---

# 12. Development Milestones

## Milestone 1 — Project Setup (1–2 days)

- Initialize monorepo with pnpm/yarn workspaces
- Set up Next.js 15 with App Router
- Install and configure Payload CMS
- Set up TypeScript and shared types package
- Configure ESLint and Prettier
- Set up deployment pipeline (Vercel/Railway)
- Initialize Git repository and documentation

## Milestone 2 — CMS Collections & Data Models (2–3 days)

- Create core collections:
  - Reviews with all fields
  - Genres and Tags
  - MoodTags with color/icon support
  - ReadingLists
  - Comments with moderation
  - Authors
- Configure media uploads with image optimization
- Set up access control (admin only for writes)
- Create collection hooks for:
  - Auto-generating slugs
  - Handling reactions/likes
  - Comment approval workflow
- Configure rich text editor with custom blocks

## Milestone 3 — Public Frontend (5–7 days)

- Build homepage:
  - Featured review hero section
  - Latest reviews grid
  - Reading lists showcase
  - Search bar integration
- Create review detail page:
  - Rich layout with structured sections
  - Quote highlights
  - Related reviews
  - Reactions and comments UI
- Build browse pages:
  - Genre pages with filtering
  - Tag and mood tag pages
  - Reading lists pages
- Implement search functionality
- Add reaction/like system (client-side)
- Implement comment submission and display
- Set up ISR/SSG for all pages

## Milestone 4 — Design Polish & Features (3–4 days)

- Implement design system:
  - Typography (Playfair Display + Inter)
  - Color palette and theming
  - Reusable UI components
- Add micro-interactions and animations
- Create share card generator (OG images)
- Implement RSS feed
- Add reading challenge tracker
- Build contextual recommendations
- Responsive design across all breakpoints
- Dark mode implementation

## Milestone 5 — SEO & Performance (1–2 days)

- Implement SEO best practices:
  - Meta tags and OpenGraph
  - Structured data (Schema.org)
  - Sitemap generation
- Optimize images and assets
- Configure caching strategies
- Run Lighthouse audits and optimize
- Set up analytics (Google Analytics/Plausible)

## Milestone 6 — Launch Preparation (1 day)

- Final testing across devices
- Deploy to production (Vercel + managed DB)
- Configure custom domain and SSL
- Set up monitoring and error tracking
- Create admin documentation
- Populate initial content (5-10 reviews)
- Launch! 🚀

**Total Estimated Time**: 14-21 days

---

# 13. Risks & Mitigations

Risk: Payload admin UI complexity  
Mitigation: Simplify fields, hide advanced config

Risk: Reaction/comment scaling  
Mitigation: Rate limit and throttle API

Risk: Search performance  
Mitigation: Use Payload queries + caching

Risk: Design inconsistency  
Mitigation: Use shadcn/ui + Tailwind components

---
