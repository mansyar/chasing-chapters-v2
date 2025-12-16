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

### For Readers

- **Browse & Discover** — Explore reviews by genre, mood, or curated reading lists
- **Search** — Find books by title, author, or genre
- **Reactions** — Like and react to reviews
- **Comments** — Leave thoughts and engage with reviews
- **RSS Feed** — Subscribe to new review updates

## 🛠️ Tech Stack

- **Framework**: Next.js 16 with App Router
- **CMS**: Payload CMS 3.0 (integrated)
- **Database**: PostgreSQL 16
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI + shadcn/ui
- **Animations**: Motion (Framer Motion)
- **Language**: TypeScript
- **Package Manager**: pnpm

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for local database)

### Development

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd chasing-chapters
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the database**

   ```bash
   docker compose up -d
   ```

5. **Run the development server**

   ```bash
   pnpm dev
   ```

6. **Open your browser**
   - Public site: [http://localhost:3000](http://localhost:3000)
   - Admin panel: [http://localhost:3000/admin](http://localhost:3000/admin)

### Seeding Data

```bash
pnpm seed
```

## 📁 Project Structure

```
chasing-chapters/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── (payload)/    # Payload admin routes
│   │   └── (public)/     # Public site routes
│   ├── collections/      # Payload CMS collections
│   ├── components/       # React components
│   ├── lib/              # Utility functions
│   └── scripts/          # Seed and utility scripts
├── public/               # Static assets
├── docs/                 # Documentation
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

## 📖 Documentation

- [Product Requirements Document](./docs/PRD.md) — Full project specification

## 📝 License

This project is private and for personal use.
