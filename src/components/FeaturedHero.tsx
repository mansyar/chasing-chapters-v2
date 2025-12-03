import Link from "next/link";
import Image from "next/image";
import { Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Review, Media } from "@/payload-types";

interface FeaturedHeroProps {
  review: Review;
}

export function FeaturedHero({ review }: FeaturedHeroProps) {
  const coverImage = review.coverImage as Media;

  return (
    <section className="relative overflow-hidden bg-muted/30 py-12 md:py-20">
      <div className="container px-4 md:px-6">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16 items-center">
          <div className="flex flex-col justify-center space-y-6 order-2 lg:order-1">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
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
              {/* Note: We'd typically extract a snippet from rich text here, 
                   but for now we'll just show a placeholder or need a helper function */}
              A captivating journey that explores the depths of human emotion...
            </div>

            <div className="flex flex-col gap-2 min-[400px]:flex-row">
              <Button asChild size="lg" className="font-medium">
                <Link href={`/reviews/${review.slug}`}>
                  Read Full Review <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end order-1 lg:order-2">
            <div className="relative w-[280px] md:w-[350px] aspect-[2/3] shadow-2xl rounded-lg rotate-3 hover:rotate-0 transition-transform duration-500">
              {coverImage?.url && (
                <Image
                  src={coverImage.url}
                  alt={coverImage.alt || review.title}
                  fill
                  className="object-cover rounded-lg"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
