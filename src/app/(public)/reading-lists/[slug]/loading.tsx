import { ReviewCardSkeleton } from "@/components/ReviewCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen pb-20">
      {/* Hero Header Skeleton */}
      <div className="relative bg-muted/30 py-20 md:py-32 overflow-hidden">
        <div className="container px-4 md:px-6 relative z-10 text-center max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 md:h-16 w-3/4 mx-auto" /> {/* Title */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6 mx-auto" />
            <Skeleton className="h-6 w-2/3 mx-auto" />
          </div>
          <div className="flex justify-center pt-4">
            <Skeleton className="h-10 w-32 rounded-md" /> {/* Share Button */}
          </div>
        </div>
      </div>

      {/* Reviews Grid Skeleton */}
      <div className="container px-4 md:px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
