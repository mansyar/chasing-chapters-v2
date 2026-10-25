# 📚 Chasing Chapters

A beautifully crafted personal book review platform — a digital space that feels like a boutique bookstore meets a personal literary journal.

## ✨ Features

### For Authors

- **Rich Review Editor** — Write detailed reviews with structured sections (What I Loved, What Could Be Better, Perfect For)
- **Favorite Quotes** — Highlight memorable passages with special formatting
- **Mood & Genre Tagging** — Organize reviews with genres, tags, and mood tags
- **Reading Dates** — Record when a book was started and finished. Dates appear on the review page.
- **Author Dashboard** — Views, likes, review count, and average rating
- **Draft, Publish & Schedule** - Save drafts, preview any review on its real public URL before it is public, and publish now or at a chosen moment (a future `Publish At` keeps the review out of every public surface until then, with no scheduler). The reviews list shows Scheduled / Live / Draft at a glance.
- **Comment Moderation** — Clean comments auto-approve. Spam-flagged comments are held with their spam signals saved; trusted commenters (3+ approved comments) bypass that hold, and banned commenters are rejected. Admins work the queue from the Comment Moderation panel on the analytics dashboard.
- **Auto-Translation** — Reviews can be translated to Indonesian with the Google Cloud Translation API. Status is tracked per review; a failure never falls back to English, and Re-translate retries it from the admin.

### For Readers

- **Browse & Discover** — Filter reviews by genre or tag, or open a curated reading list. Moods are shown on the review; they are not a browse filter.
- **Search** — Find books by title or author.
- **Language Toggle** - Switch the whole site, not just one review: the interface, review text, genre and tag names, reading lists and page metadata follow the chosen language. The choice lives in the URL (`/en/...` or `/id/...`), so a shared link keeps its language, and the site remembers your last choice.
- **Likes** — Like a review.
- **Comments** — Leave thoughts and engage with reviews
- **RSS Feed** - Subscribe to new reviews in either language (`/en/feed.xml` or `/id/feed.xml`; the old `/feed.xml` redirects to English)

## 🛠️ Tech Stack

| Category             | Technology                                        |
| -------------------- | ------------------------------------------------- |
| **Framework**        | Next.js 16 with App Router                        |
| **CMS**              | Payload CMS 3.90 (integrated)                     |
| **Database**         | PostgreSQL 16                                     |
| **Caching**          | Redis (for translation caching and rate limiting) |
| **Styling**          | Tailwind CSS 4                                    |
| **UI Components**    | Radix UI + shadcn/ui                              |
| **Animations**       | CSS (`tw-animate-css`)                            |
| **Media Storage**    | Cloudflare R2 (public covers from the bucket domain; admin uploads still go through the app) |
| **Translation**      | Google Cloud Translation API                      |
| **Error Monitoring** | Sentry                                            |
| **Language**         | TypeScript                                        |
| **Package Manager**  | Bun                                               |

## 🔒 Security Features

- **Content Security Policy (CSP)** — Protection against XSS and injection attacks
- **Rate Limiting** — Prevents abuse on comments, likes, and views
- **Spam Detection** — Automatic spam filtering for comments
- **Email Hashing** — Commenter emails are hashed for privacy (SHA-256)
- **Atomic Database Operations** — Race-condition-free view and like tracking
- **Security Headers** — HSTS, X-Frame-Options, X-Content-Type-Options, etc.

## 🚀 Getting Started

### Prerequisites

- Bun 1.3+
- Docker (for local database and Redis)

### Development

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd chasing-chapters
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the database and Redis**

   ```bash
   docker compose up -d
   ```

5. **Run the development server**

   ```bash
   bun run dev
   ```

6. **Open your browser**
   - Public site: [http://localhost:3000](http://localhost:3000)
   - Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

### Seeding Data

```bash
bun run seed
```

### Running Tests

```bash
bun test              # Unit tests
bun run test:e2e      # Playwright end-to-end tests
```

#### End-to-End Tests

`bun run test:e2e` runs the Playwright suite against a **production build**, not a dev server.
The command runs the whole pipeline: it creates the e2e database, applies the schema to it,
seeds the fixture, builds the app with `next build`, and serves it with the standalone server
(`.next/standalone/server.js` - the same artifact the production deployment runs) on port 3100
while the suite drives a Chromium browser against it.

**Prerequisites**

- PostgreSQL and Redis are running (`docker compose up -d`) and `.env` points at them.
- Chromium is installed (`bunx playwright install chromium`).

The run checks that Redis is reachable before it starts and stops with a message that names
`REDIS_URL` when it is not - the app would otherwise degrade to no cache and the suite would
run on in a silently degraded state.

**The e2e database**

The suite never touches the database you work in. It derives its own database from the
`DATABASE_URI` in your environment - the same host, the same credentials, the same database
name with a `_e2e` suffix (`chasing-chapters` becomes `chasing-chapters_e2e`) - and creates it
when it does not exist yet. The schema is applied to that database, the fixture is seeded into
it, and the production build is rendered against it, so the suite never competes with your own
rows.

The e2e database is dedicated to the run. The migration step answers Payload's drift prompt
automatically, so the run never stops on it, and the migrations are applied only when the
database is new - once they are recorded, drizzle skips them, so an existing e2e database keeps
its rows. The schema the run uses is the one Payload syncs when the seed connects in development
mode. Nothing outside the e2e database is read or written, apart from the fixture's own cover
image, which lands in the gitignored `media/` directory. The fixture is an upsert: it only ever
writes its own rows and never deletes anything.

**Storage**

The e2e run stores its media on the local disk instead of in object storage, so the suite needs
no bucket and no object storage credentials. `STORAGE_ADAPTER` selects the adapter (`s3` is the
default, `local` uses Payload's own disk storage); the e2e run sets it to `local`.

**Worker cap**

The suite never occupies the machine's full CPU: it runs with **3 workers** by default, which
leaves headroom for Postgres, Redis and the app server.

```bash
PLAYWRIGHT_WORKERS=5 bun run test:e2e   # override the cap
```

In CI the cap is pinned to **1 worker** (GitHub Actions sets `CI=true`), and the suite runs in
its own job next to the required `Typecheck, Lint, Test, Build` check.

**The fixture**

Every run seeds a fixed dataset through the Payload local API, so the specs assert against known
rows instead of whatever the database happens to hold:

- a throwaway test admin (`e2e-admin@example.test`, password `e2e-fixture-password`),
- four published reviews with a cover image, content and structured sections, two of them
  featured, covering the `translated`, `failed` and `stale` translation states,
- a reading list.

The seed is an upsert keyed on the fixture's own identifiers, so it only ever writes its own
rows and never touches your own reviews. The translation provider is replaced by an offline stub
while the suite runs, so no external API is called and no provider credentials are needed.

## 📁 Project Structure

```
chasing-chapters/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── (payload)/    # Payload admin routes
│   │   ├── (public)/     # Public site routes
│   │   └── actions/      # Server actions
│   ├── collections/      # Payload CMS collections
│   ├── components/       # React components
│   ├── hooks/            # Payload CMS hooks
│   ├── lib/              # Utility functions
│   │   ├── blocklist.ts  # Spam detection
│   │   ├── db.ts         # Atomic database operations
│   │   ├── rate-limit.ts # Rate limiting
│   │   ├── redis.ts      # Redis client
│   │   └── translate.ts  # Translation utilities
│   └── scripts/          # Seed and utility scripts
├── public/               # Static assets
├── docs/                 # Documentation
├── sentry.*.config.ts    # Sentry configuration
└── docker-compose.yml    # Docker configuration
```

## 🐳 Docker

### Development

```bash
docker compose up -d
```

### Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

## 🚢 Deployment

The project uses GitHub Actions for CI/CD:

1. **Migrate** — Database migrations run against production first, because `next build` prerenders against the live schema
2. **Build and Push** — Docker image is built with all environment variables and pushed to Docker Hub
3. **Deploy** — Coolify webhook triggers deployment
4. **Verify** — The live site is polled after the webhook, and the run fails if it stops answering

Deploys are serialised, and a destructive migration has to declare itself. If a deploy goes wrong, read the [deployment runbook](./docs/DEPLOYMENT.md) before reverting anything.

### Required GitHub Secrets

| Secret              | Description                       |
| ------------------- | --------------------------------- |
| `DATABASE_URI`      | PostgreSQL connection string      |
| `PAYLOAD_SECRET`    | Payload CMS secret (min 32 chars) |
| `R2_*`              | Cloudflare R2 storage credentials |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps |
| `COOLIFY_WEBHOOK_*` | Coolify deployment webhook        |

## 📖 Documentation

- [Product Requirements Document](./docs/PRD.md) — Full project specification
- [Deployment Runbook](./docs/DEPLOYMENT.md) — Deploy order, migrations, and what a revert cannot restore

## 📝 License

This project is private and for personal use.
