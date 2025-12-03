import { getPayload } from "payload";
import configPromise from "@payload-config";
import { FeaturedHero } from "@/components/FeaturedHero";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function Homepage() {
  const payload = await getPayload({ config: configPromise });

  const { docs: featuredReviews } = await payload.find({
    collection: "reviews",
    where: {
      featured: {
        equals: true,
      },
      status: {
        equals: "published",
      },
    },
    limit: 1,
    depth: 2,
  });

  const { docs: latestReviews } = await payload.find({
    collection: "reviews",
    where: {
      status: {
        equals: "published",
      },
      ...(featuredReviews[0]?.id
        ? {
            id: {
              not_equals: featuredReviews[0].id,
            },
          }
        : {}),
    },
    sort: "-publishDate",
    limit: 6,
    depth: 1,
  });

  const featuredReview = featuredReviews[0];

  return (
    <div className="flex flex-col min-h-screen">
      {featuredReview && <FeaturedHero review={featuredReview} />}

      <section className="py-16 container px-4 md:px-6">
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
            {latestReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
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
