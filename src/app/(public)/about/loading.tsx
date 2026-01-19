import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen pb-20">
      {/* Hero Section Skeleton */}
      <section className="relative py-20 md:py-32 bg-muted/30 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Skeleton className="h-10 md:h-16 w-3/4 mx-auto" /> {/* Title */}
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6 mx-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* Content Section Skeleton */}
      <section className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div className="space-y-6">
            <Skeleton className="h-9 w-48" /> {/* Subtitle */}
            <div className="space-y-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-[98%]" />
              <Skeleton className="h-5 w-[95%]" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-[92%]" />
            </div>
            <Skeleton className="h-12 w-48 rounded-md" /> {/* Button */}
          </div>

          {/* Image Placeholder Skeleton */}
          <Skeleton className="aspect-square md:aspect-4/5 lg:aspect-square rounded-2xl rotate-3" />
        </div>
      </section>

      {/* Values Section Skeleton */}
      <section className="bg-primary/5 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
            <Skeleton className="h-9 w-48 mx-auto" />
            <Skeleton className="h-5 w-64 mx-auto" />
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4"
              >
                <Skeleton className="w-12 h-12 rounded-full mx-auto" />
                <Skeleton className="h-7 w-32 mx-auto" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6 mx-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
