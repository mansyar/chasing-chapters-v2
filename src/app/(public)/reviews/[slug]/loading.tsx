import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function ReviewDetailLoading() {
  return (
    <article className="min-h-screen pb-20">
      {/* Hero Header Skeleton */}
      <div className="bg-muted/30 py-12 md:py-20">
        <div className="container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12 items-start">
            {/* Book Cover Skeleton */}
            <Skeleton className="mx-auto lg:mx-0 w-[240px] md:w-[300px] aspect-2/3 rounded-lg shadow-2xl rotate-2" />

            {/* Header Content Skeleton */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="space-y-4">
                {/* Stars */}
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-5 rounded-full" />
                  ))}
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full max-w-lg mx-auto lg:mx-0" />
                  <Skeleton className="h-12 w-3/4 max-w-md mx-auto lg:mx-0" />
                </div>

                {/* Author */}
                <Skeleton className="h-6 w-40 mx-auto lg:mx-0" />
              </div>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-1" />
                <Skeleton className="h-4 w-40" />
              </div>

              {/* Badges */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-md ml-2" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 grid gap-12 lg:grid-cols-[1fr_300px] max-w-7xl">
        <div className="space-y-12">
          {/* Review Content */}
          <div className="prose prose-lg max-w-3xl space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-[98%]" />
            <Skeleton className="h-5 w-[95%]" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-[92%]" />
            <Skeleton className="h-5 w-[88%]" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-[90%]" />
            <div className="h-4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-[96%]" />
            <Skeleton className="h-5 w-[93%]" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-[85%]" />
            <Skeleton className="h-5 w-[78%]" />
          </div>

          {/* Structured Sections */}
          <div className="grid gap-8 md:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>

        {/* Sidebar Skeleton */}
        <div className="space-y-8">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>

      {/* Related Reviews Skeleton */}
      <div className="container mx-auto px-6 md:px-12 lg:px-24 pb-12 max-w-7xl">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-2/3 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Comments Section Skeleton */}
      <Separator className="my-8" />
      <div className="container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </article>
  );
}
