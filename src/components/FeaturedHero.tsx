"use client";

import { useState, useEffect } from "react";
import Autoplay from "embla-carousel-autoplay";
import Link from "next/link";
import Image from "next/image";
import { Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn, extractTextFromRichText } from "@/lib/utils";
import type { Review, Media } from "@/payload-types";

interface FeaturedHeroProps {
  reviews: Review[];
}

export function FeaturedHero({ reviews }: FeaturedHeroProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  // Return null after hooks if no reviews (hooks must be called unconditionally)
  if (reviews.length === 0) {
    return null;
  }

  const showNavigation = reviews.length > 1;

  return (
    <section className="relative overflow-hidden bg-muted/30 py-12 md:py-20 min-h-screen flex items-center">
      <div className="container mx-auto px-6 md:px-12 lg:px-32 max-w-[1600px]">
        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: true,
          }}
          plugins={[
            Autoplay({
              delay: 5000,
              stopOnInteraction: true,
            }),
          ]}
          className="w-full px-4 lg:px-16"
        >
          <CarouselContent>
            {reviews.map((review) => {
              const coverImage = review.coverImage as Media;

              return (
                <CarouselItem key={review.id}>
                  <div className="grid gap-8 lg:grid-cols-2 lg:gap-24 items-center">
                    <div className="flex flex-col justify-center space-y-6 order-2 lg:order-1 pl-6 md:pl-12 lg:pl-16 items-center text-center lg:items-start lg:text-left">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 justify-center lg:justify-start">
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
                        {extractTextFromRichText(review.reviewContent)}
                      </div>

                      <div className="flex flex-col gap-2 min-[400px]:flex-row w-full justify-center lg:justify-start">
                        <Button asChild size="lg" className="font-medium">
                          <Link href={`/reviews/${review.slug}`}>
                            Read Full Review{" "}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-center lg:justify-end order-1 lg:order-2 pr-6 md:pr-12 lg:pr-16">
                      <div className="relative w-[280px] md:w-[350px] lg:w-[400px] aspect-2/3 shadow-2xl rounded-lg rotate-3 hover:rotate-0 transition-transform duration-500">
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
                </CarouselItem>
              );
            })}
          </CarouselContent>

          {showNavigation && (
            <>
              <CarouselPrevious className="hidden lg:flex" />
              <CarouselNext className="hidden lg:flex" />
            </>
          )}

          {showNavigation && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: count }).map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    index + 1 === current
                      ? "w-8 bg-primary"
                      : "w-2 bg-muted-foreground/30"
                  )}
                  onClick={() => api?.scrollTo(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}

          {showNavigation && (
            <div className="flex lg:hidden justify-center gap-4 mt-4">
              <CarouselPrevious className="relative left-0 translate-y-0" />
              <CarouselNext className="relative right-0 translate-y-0" />
            </div>
          )}
        </Carousel>
      </div>
    </section>
  );
}
