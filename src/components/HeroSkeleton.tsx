import { Skeleton } from "@/components/ui/skeleton";
import { GradientBackground } from "@/components/ui/gradient-background";

export function HeroSkeleton() {
  return (
    <section className="relative overflow-hidden h-[calc(100vh-4rem)] flex items-center justify-center py-12 md:py-0">
      <GradientBackground
        className="absolute inset-0 opacity-20 dark:opacity-10 from-primary/40 via-accent/30 to-primary/20"
        transition={{ duration: 20, ease: "easeInOut", repeat: Infinity }}
      />
      <div className="container mx-auto px-6 md:px-12 lg:px-32 max-w-[1600px] relative z-10 w-full">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-24 items-center w-full px-4 lg:px-16">
          {/* Content Side */}
          <div className="flex flex-col justify-center space-y-6 order-2 lg:order-1 pl-6 md:pl-12 lg:pl-16 items-center lg:items-start">
            <div className="space-y-4 w-full max-w-md">
              {/* Badge and Stars */}
              <div className="flex items-center gap-2 justify-center lg:justify-start">
                <Skeleton className="h-6 w-28 rounded-full" />
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-4 rounded-full" />
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-3/4 mx-auto lg:mx-0" />
              </div>

              {/* Author */}
              <Skeleton className="h-6 w-40 mx-auto lg:mx-0" />
            </div>

            {/* Excerpt */}
            <div className="space-y-2 w-full max-w-md">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>

            {/* Button */}
            <Skeleton className="h-12 w-48 rounded-md" />
          </div>

          {/* Book Cover Side */}
          <div className="flex justify-center lg:justify-end order-1 lg:order-2 pr-6 md:pr-12 lg:pr-16">
            <Skeleton className="w-[280px] md:w-[350px] lg:w-[400px] aspect-2/3 rounded-lg shadow-2xl rotate-3" />
          </div>
        </div>
      </div>
    </section>
  );
}
