import { HeroSkeleton } from "@/components/HeroSkeleton";
import { ReviewCardSkeleton } from "@/components/ReviewCardSkeleton";
import { ReadingListCardSkeleton } from "@/components/ReadingListCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section Skeleton */}
      <HeroSkeleton />

      {/* Genre Marquee Placeholder */}
      <div className="py-4 border-y bg-background/50">
        <div className="container mx-auto px-6">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </div>

      {/* Reading Lists Showcase Skeleton */}
      <section className="py-16 container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-9 w-64" /> {/* Section Title */}
          <Skeleton className="h-10 w-24" /> {/* View All Button */}
        </div>
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ReadingListCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Latest Reviews Skeleton */}
      <section className="py-16 container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-9 w-48" /> {/* Section Title */}
          <Skeleton className="h-10 w-24" /> {/* View All Button */}
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
