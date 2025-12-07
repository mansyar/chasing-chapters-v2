import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ReviewCardSkeleton } from "@/components/ReviewCardSkeleton";

export default function ReviewsLoading() {
  return (
    <div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 max-w-7xl">
      <div className="flex flex-col md:flex-row gap-12">
        {/* Sidebar Skeleton */}
        <aside className="w-full md:w-[240px] space-y-8 shrink-0">
          {/* Search */}
          <div>
            <Skeleton className="h-5 w-16 mb-4" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Genres */}
          <div>
            <Skeleton className="h-5 w-16 mb-4" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-24" />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <Skeleton className="h-5 w-12 mb-4" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
          </div>
          <Separator />

          {/* Review Cards Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ReviewCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
