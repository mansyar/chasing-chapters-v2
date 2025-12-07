import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ReviewCardSkeletonProps {
  className?: string;
}

export function ReviewCardSkeleton({ className }: ReviewCardSkeletonProps) {
  return (
    <div className={cn("block h-full", className)}>
      <Card className="h-full overflow-hidden border-none shadow-sm bg-card">
        {/* Cover Image Placeholder */}
        <Skeleton className="aspect-2/3 w-full rounded-md" />

        <CardHeader className="px-4 pt-4 pb-2">
          {/* Rating and Date */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-3.5 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-3 w-24" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>

          {/* Author */}
          <Skeleton className="h-4 w-1/2 mt-2" />
        </CardHeader>

        <CardFooter className="px-4 pt-0 gap-2 flex-wrap">
          {/* Genre Badges */}
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardFooter>
      </Card>
    </div>
  );
}
