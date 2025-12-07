import { getPayload } from "payload";
import configPromise from "@payload-config";
import { FeaturedHero } from "@/components/FeaturedHero";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

export default async function Homepage() {
  const payload = await getPayload({ config: configPromise });

  // Fetch data in parallel for better performance
  const [{ docs: featuredReviews }, { docs: latestReviews }] =
    await Promise.all([
      payload.find({
        collection: "reviews",
        where: {
          featured: { equals: true },
          _status: { equals: "published" },
        },
        limit: 5,
        depth: 2,
      }),
      payload.find({
        collection: "reviews",
        where: {
          _status: { equals: "published" },
        },
        sort: "-publishDate",
        limit: 6,
        depth: 1,
      }),
    ]);

  return (
    <div className="flex flex-col min-h-screen">
      {featuredReviews.length > 0 && <FeaturedHero reviews={featuredReviews} />}

      <section className="py-16 container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-3xl font-bold tracking-tight">
            Latest Reviews
          </h2>
          <Button variant="ghost" asChild>
            <Link href="/reviews">
              View All <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {latestReviews.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {latestReviews.map((review, index) => (
              <ReviewCard
                key={review.id}
                review={review}
                priority={index < 2}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-12">
            No reviews published yet. Check back soon!
          </p>
        )}
      </section>
    </div>
  );
}
