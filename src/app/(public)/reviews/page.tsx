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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { GenreSelect } from "@/components/GenreSelect";

export const metadata: Metadata = {
  title: "Browse Reviews",
  description:
    "Explore our collection of book reviews. Filter by genre, tag, or search for specific titles and authors.",
};

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    genre?: string;
    tag?: string;
    page?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const { q, genre, tag, page } = await searchParams;
  const currentPage = Number(page) || 1;
  const limit = 9;
  const payload = await getPayload({ config: configPromise });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const { docs: reviews, totalPages } = await payload.find({
    collection: "reviews",
    where,
    sort: "-publishDate",
    depth: 1,
    limit,
    page: currentPage,
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
            {/* Mobile Dropdown */}
            <div className="md:hidden">
              <GenreSelect genres={genres} currentGenre={genre} />
            </div>
            {/* Desktop List */}
            <div className="hidden md:flex flex-col gap-2">
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

      {totalPages > 1 && (
        <div className="mt-12">
          <Pagination>
            <PaginationContent>
              {currentPage > 1 && (
                <PaginationItem>
                  <PaginationPrevious
                    href={`/reviews?${new URLSearchParams({
                      ...(q && { q }),
                      ...(genre && { genre }),
                      ...(tag && { tag }),
                      page: (currentPage - 1).toString(),
                    }).toString()}`}
                  />
                </PaginationItem>
              )}

              {/* First Page */}
              {currentPage > 3 && (
                <>
                  <PaginationItem>
                    <PaginationLink
                      href={`/reviews?${new URLSearchParams({
                        ...(q && { q }),
                        ...(genre && { genre }),
                        ...(tag && { tag }),
                        page: "1",
                      }).toString()}`}
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                </>
              )}

              {/* Page Numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    (p >= currentPage - 1 && p <= currentPage + 1)
                )
                .map((p) => {
                  // Skip if previously handled by first/last page logic to avoid duplicates
                  // specifically if we are showing 1 ... [current] ... last
                  // logic above handles the ellipsis, here we just want the range around current
                  // but simplifying: just show range around current, and first/last if far away.

                  // Let's refine the logic to be simpler standard pagination
                  // Show: 1 ... prev current next ... last

                  // If page is 1 or last, we handled/will handle it or it's in the loop?
                  // Let's just do a simple logic:
                  // if page is within distance 1 of current, show it.
                  if (p < currentPage - 1 && p !== 1) return null;
                  if (p > currentPage + 1 && p !== totalPages) return null;

                  // If it's 1 and we are far, we showed it above with ellipsis? No let's do it all here.
                  return null;
                })}

              {/* Re-implementing logic clearly */}
              {(() => {
                const pages = [];
                const showFirst = currentPage > 2;
                const showLast = currentPage < totalPages - 1;

                if (showFirst) {
                  pages.push(1);
                  if (currentPage > 3) pages.push("...");
                }

                const start = Math.max(1, currentPage - 1);
                const end = Math.min(totalPages, currentPage + 1);

                for (let i = start; i <= end; i++) {
                  if (showFirst && i === 1) continue; // already pushed
                  if (showLast && i === totalPages) continue; // will push later
                  pages.push(i);
                }

                if (showLast) {
                  if (currentPage < totalPages - 2) pages.push("...");
                  pages.push(totalPages);
                }

                // Simplified approach if total pages is small
                if (totalPages <= 5) {
                  return Array.from(
                    { length: totalPages },
                    (_, i) => i + 1
                  ).map((p) => (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === currentPage}
                        href={`/reviews?${new URLSearchParams({
                          ...(q && { q }),
                          ...(genre && { genre }),
                          ...(tag && { tag }),
                          page: p.toString(),
                        }).toString()}`}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ));
                }

                return pages.map((p, i) => (
                  <PaginationItem key={i}>
                    {p === "..." ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        isActive={p === currentPage}
                        href={`/reviews?${new URLSearchParams({
                          ...(q && { q }),
                          ...(genre && { genre }),
                          ...(tag && { tag }),
                          page: p.toString(),
                        }).toString()}`}
                      >
                        {p}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ));
              })()}

              {currentPage < totalPages && (
                <PaginationItem>
                  <PaginationNext
                    href={`/reviews?${new URLSearchParams({
                      ...(q && { q }),
                      ...(genre && { genre }),
                      ...(tag && { tag }),
                      page: (currentPage + 1).toString(),
                    }).toString()}`}
                  />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
