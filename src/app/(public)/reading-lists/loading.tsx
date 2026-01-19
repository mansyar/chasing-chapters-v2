import { ReadingListCardSkeleton } from "@/components/ReadingListCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-12">
      {/* Title and Description Skeleton */}
      <div className="space-y-4 mb-12 text-center">
        <Skeleton className="h-10 w-64 mx-auto" /> {/* Title */}
        <div className="space-y-2 max-w-[600px] mx-auto">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5 mx-auto" />
        </div>
      </div>

      {/* Reading Lists Grid Skeleton */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <ReadingListCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
