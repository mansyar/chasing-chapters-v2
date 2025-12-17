# 📚 Chasing Chapters

A beautifully crafted personal book review platform — a digital space that feels like a boutique bookstore meets a personal literary journal.

## ✨ Features

### For Authors

- **Rich Review Editor** — Write detailed reviews with structured sections (What I Loved, What Could Be Better, Perfect For)
- **Favorite Quotes** — Highlight memorable passages with special formatting
- **Mood & Genre Tagging** — Organize reviews with genres, tags, and mood tags
- **Reading Stats** — Track reading dates, books per month, and favorite genres
- **Draft & Schedule** — Save drafts and schedule publications
- **Comment Moderation** — Approve and manage reader comments
- **Auto-Translation** — Reviews are automatically translated to Indonesian using Google Cloud Translation API

### For Readers

- **Browse & Discover** — Explore reviews by genre, mood, or curated reading lists
- **Search** — Find books by title, author, or genre
- **Language Toggle** — Switch between English and Indonesian translations
- **Reactions** — Like and react to reviews
- **Comments** — Leave thoughts and engage with reviews
- **RSS Feed** — Subscribe to new review updates

## 🛠️ Tech Stack

| Category             | Technology                                        |
| -------------------- | ------------------------------------------------- |
| **Framework**        | Next.js 16 with App Router                        |
| **CMS**              | Payload CMS 3.0 (integrated)                      |
| **Database**         | PostgreSQL 16                                     |
| **Caching**          | Redis (for translation caching and rate limiting) |
| **Styling**          | Tailwind CSS 4                                    |
| **UI Components**    | Radix UI + shadcn/ui                              |
| **Animations**       | Motion (Framer Motion)                            |
| **Media Storage**    | Cloudflare R2                                     |
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
bun run test:vitest   # Watch mode
bun run test:vitest:run # Single run
bun test              # Bun's native test runner
```

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

1. **Build** — Docker image is built with all environment variables
2. **Push** — Image is pushed to Docker Hub
3. **Deploy** — Coolify webhook triggers deployment

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

## 📝 License

This project is private and for personal use.
