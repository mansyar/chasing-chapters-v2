import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ReadingListCardSkeletonProps {
  className?: string;
}

export function ReadingListCardSkeleton({
  className,
}: ReadingListCardSkeletonProps) {
  return (
    <div className={cn("block h-full", className)}>
      <Card className="h-full overflow-hidden border-none shadow-sm bg-card">
        {/* Aspect-video cover placeholder */}
        <Skeleton className="aspect-video w-full rounded-t-lg" />

        <CardContent className="pt-4 pb-5">
          {/* Title skeleton */}
          <Skeleton className="h-6 w-3/4 mb-2" />

          {/* Description skeleton - 2 lines */}
          <div className="space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
