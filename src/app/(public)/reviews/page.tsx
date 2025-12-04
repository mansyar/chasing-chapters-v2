import { getPayload } from "payload";
import configPromise from "@payload-config";
import { ReviewCard } from "@/components/ReviewCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Reviews",
  description:
    "Explore our collection of book reviews. Filter by genre, tag, or search for specific titles and authors.",
};

// Render at request time since we need database access
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    genre?: string;
    tag?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const { q, genre, tag } = await searchParams;
  const payload = await getPayload({ config: configPromise });

  const where: any = {
    _status: {
      equals: "published",
    },
  };

  if (q) {
    where.or = [
      {
        title: {
          like: q,
        },
      },
      {
        bookAuthor: {
          like: q,
        },
      },
    ];
  }

  if (genre) {
    where["genres.slug"] = {
      equals: genre,
    };
  }

  if (tag) {
    where["tags.slug"] = {
      equals: tag,
    };
  }

  const { docs: reviews } = await payload.find({
    collection: "reviews",
    where,
    sort: "-publishDate",
    depth: 1,
  });

  const { docs: genres } = await payload.find({
    collection: "genres",
    sort: "name",
    limit: 100,
  });

  const { docs: tags } = await payload.find({
    collection: "tags",
    sort: "name",
    limit: 100,
  });

  async function searchAction(formData: FormData) {
    "use server";
    const query = formData.get("q");
    if (query) {
      redirect(`/reviews?q=${query}`);
    } else {
      redirect("/reviews");
    }
  }

  return (
    <div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 max-w-7xl">
      <div className="flex flex-col md:flex-row gap-12">
        {/* Sidebar */}
        <aside className="w-full md:w-[240px] space-y-8 shrink-0">
          <div>
            <h3 className="font-serif text-lg font-bold mb-4">Search</h3>
            <form action={searchAction} className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                placeholder="Search..."
                className="pl-9"
                defaultValue={q}
              />
            </form>
          </div>

          <div>
            <h3 className="font-serif text-lg font-bold mb-4">Genres</h3>
            <div className="flex flex-col gap-2">
              <Link
                href="/reviews"
                className={`text-sm hover:text-primary transition-colors ${
                  !genre ? "font-bold text-primary" : "text-muted-foreground"
                }`}
              >
                All Genres
              </Link>
              {genres.map((g) => (
                <Link
                  key={g.id}
                  href={`/reviews?genre=${g.slug}`}
                  className={`text-sm hover:text-primary transition-colors ${
                    genre === g.slug
                      ? "font-bold text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {g.name}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-bold mb-4">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link key={t.id} href={`/reviews?tag=${t.slug}`}>
                  <Badge
                    variant={tag === t.slug ? "default" : "outline"}
                    className="hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {t.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl font-bold">
              {q
                ? `Search Results for "${q}"`
                : genre
                ? `Genre: ${genres.find((g) => g.slug === genre)?.name}`
                : tag
                ? `Tag: ${tags.find((t) => t.slug === tag)?.name}`
                : "All Reviews"}
            </h1>
            {(q || genre || tag) && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/reviews">
                  <X className="mr-2 h-4 w-4" />
                  Clear Filters
                </Link>
              </Button>
            )}
          </div>
          <Separator />

          {reviews.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                No reviews found matching your criteria.
              </p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/reviews">Clear all filters</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
