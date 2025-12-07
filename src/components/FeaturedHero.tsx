"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, extractTextFromRichText } from "@/lib/utils";
import type { Review, Media } from "@/payload-types";

// Lazy load the interactive carousel (reduces initial JS bundle by ~40KB)
const FeaturedHeroCarousel = dynamic(
  () =>
    import("./FeaturedHeroCarousel").then((mod) => mod.FeaturedHeroCarousel),
  {
    ssr: false,
    loading: () => null, // We show static content while loading
  }
);

interface FeaturedHeroProps {
  reviews: Review[];
}

// Static content for first slide (renders immediately)
function StaticFirstSlide({ review }: { review: Review }) {
  const coverImage = review.coverImage as Media;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-24 items-center w-full px-4 lg:px-16">
      <div className="flex flex-col justify-center space-y-6 order-2 lg:order-1 pl-6 md:pl-12 lg:pl-16 items-center text-center lg:items-start lg:text-left">
        <div className="space-y-2">
          <div className="flex items-center gap-2 justify-center lg:justify-start">
            <Badge
              variant="default"
              className="bg-primary text-primary-foreground"
            >
              Featured Review
            </Badge>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-4 w-4",
                    i < review.rating
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl xl:text-6xl/none">
            {review.title}
          </h1>
          <p className="text-xl text-muted-foreground font-medium">
            by {review.bookAuthor}
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none line-clamp-3 text-muted-foreground text-lg">
          {extractTextFromRichText(review.reviewContent)}
        </div>

        <div className="flex flex-col gap-2 min-[400px]:flex-row w-full justify-center lg:justify-start">
          <Button asChild size="lg" className="font-medium">
            <Link href={`/reviews/${review.slug}`}>
              Read Full Review <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex justify-center lg:justify-end order-1 lg:order-2 pr-6 md:pr-12 lg:pr-16">
        <div className="relative w-[280px] md:w-[350px] lg:w-[400px] aspect-2/3 shadow-2xl rounded-lg rotate-3 hover:rotate-0 transition-transform duration-500">
          {coverImage?.url && (
            <Image
              src={coverImage.url}
              alt={coverImage.alt || review.title}
              fill
              className="object-cover rounded-lg"
              priority
              fetchPriority="high"
              sizes="(max-width: 768px) 280px, (max-width: 1024px) 350px, 400px"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function FeaturedHero({ reviews }: FeaturedHeroProps) {
  const [mounted, setMounted] = useState(false);

  // Track when component is mounted on client
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Valid pattern for client-only rendering
    setMounted(true);
  }, []);

  if (reviews.length === 0) {
    return null;
  }

  const firstReview = reviews[0];
  const hasMultipleReviews = reviews.length > 1;

  return (
    <section className="relative overflow-hidden bg-muted/30 py-12 md:py-20 min-h-screen flex items-center">
      <div className="container mx-auto px-6 md:px-12 lg:px-32 max-w-[1600px]">
        {hasMultipleReviews && mounted ? (
          // Lazy-loaded carousel for multiple reviews (only after mount)
          <FeaturedHeroCarousel reviews={reviews} />
        ) : (
          // Static content for single review or initial render
          <StaticFirstSlide review={firstReview} />
        )}
      </div>
    </section>
  );
}
