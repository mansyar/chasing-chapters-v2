"use client";

import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Star, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, extractTextFromRichText } from "@/lib/utils";
import type { Review, Media } from "@/payload-types";

// Dynamic import for react-pageflip to reduce initial bundle size
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
  loading: () => (
    <div className="w-[480px] h-[580px] bg-primary/10 animate-pulse rounded-lg flex items-center justify-center">
      <span className="text-muted-foreground">Loading book...</span>
    </div>
  ),
});

// Define the interface for the FlipBook instance
interface FlipBook {
  pageFlip: () => {
    flipNext: () => void;
    flipPrev: () => void;
    turnToPage: (page: number) => void;
    getCurrentPageIndex: () => number;
    getPageCount: () => number;
  };
}

// Page component must be forwardRef class component or detailed function for the library
const Page = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    number?: number;
    isCover?: boolean;
    header?: string;
  }
>((props, ref) => {
  return (
    <div
      className={cn(
        "bg-[#fdfbf7] h-full w-full shadow-inner overflow-hidden relative", // Cream/paper background
        props.className
      )}
      ref={ref}
    >
      <div className="absolute inset-0 border-l border-black/5 pointer-events-none z-10" />

      {props.header && (
        <div className="absolute top-4 right-4 text-xs font-serif text-muted-foreground/40 hidden md:block">
          {props.header}
        </div>
      )}

      <div className="h-full w-full p-6 md:p-8 lg:p-12 flex flex-col justify-center">
        {props.children}
      </div>

      <div className="absolute bottom-4 right-4 text-xs font-serif text-muted-foreground/40 hidden md:block">
        {props.number}
      </div>
    </div>
  );
});

Page.displayName = "Page";

interface RealisticBookCarouselProps {
  reviews: Review[];
}

export function RealisticBookCarousel({ reviews }: RealisticBookCarouselProps) {
  const bookRef = useRef<FlipBook>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const autoFlipIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Legitimate mount detection pattern
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-flip logic
  useEffect(() => {
    if (!mounted || isPaused) return;

    const startAutoFlip = () => {
      autoFlipIntervalRef.current = setInterval(() => {
        if (!bookRef.current) return;

        const book = bookRef.current.pageFlip();
        // Check if we can safely check page stats
        try {
          const currentIndex = book.getCurrentPageIndex();
          const totalPages = book.getPageCount();

          // If we are at the end (or near it, considering spreads), loop back
          if (currentIndex >= totalPages - 1) {
            book.turnToPage(0);
          } else {
            book.flipNext();
          }
        } catch {
          // Safety catch if book not fully ready
        }
      }, 5000);
    };

    startAutoFlip();

    return () => {
      if (autoFlipIntervalRef.current) {
        clearInterval(autoFlipIntervalRef.current);
      }
    };
  }, [mounted, isPaused, reviews.length]);

  const goToNext = useCallback(() => {
    bookRef.current?.pageFlip().flipNext();
  }, []);

  const goToPrev = useCallback(() => {
    bookRef.current?.pageFlip().flipPrev();
  }, []);

  if (!mounted) return null;

  // Configuration for the book - reduced dimensions for mobile to prevent cut-off
  const bookWidth = isMobile ? 280 : 480;
  const bookHeight = isMobile ? 420 : 580;

  return (
    <div
      className="w-full flex justify-center items-center py-20 relative overflow-hidden"
      onMouseOver={() => setIsPaused(true)}
      onMouseOut={() => setIsPaused(false)}
    >
      {/* Background accent for book placement */}
      <div className="absolute inset-0 pointer-events-none flex justify-center items-center opacity-30">
        <div className="w-[95%] h-[90%] bg-white/5 blur-3xl rounded-full" />
      </div>

      {/* @ts-expect-error - Library types might be slightly mismatched with React 19 */}
      <HTMLFlipBook
        key={`flipbook-${isMobile ? "mobile" : "desktop"}`}
        width={bookWidth}
        height={bookHeight}
        size="stretch"
        minWidth={240}
        maxWidth={600}
        minHeight={320}
        maxHeight={620}
        maxShadowOpacity={isMobile ? 0 : 0.5} // No heavy shadows on mobile for performance
        showCover={true}
        mobileScrollSupport={true}
        className="shadow-2xl mx-auto max-w-full"
        ref={bookRef}
        usePortrait={isMobile} // Single page view on mobile
        startZIndex={30}
        autoSize={true}
        clickEventForward={true}
        useMouseEvents={true}
        swipeDistance={30}
        showPageCorners={!isMobile}
        disableFlipByClick={false}
      >
        {/* Cover Page (Hard) */}
        <Page
          className="bg-primary/95 text-primary-foreground items-center justify-center text-center border-none"
          isCover
          number={0}
        >
          <div className="border-4 border-double border-white/30 p-8 w-full h-full flex flex-col justify-center items-center">
            <h1 className="font-serif text-4xl font-bold mb-4">
              Featured Reviews
            </h1>
            <p className="font-serif italic text-xl opacity-80 mb-8">
              Chasing Chapters Collection
            </p>
            <div className="w-24 h-[1px] bg-white/50 mb-8" />
            <p className="text-sm uppercase tracking-widest opacity-60">
              Tap to Open
            </p>
          </div>
        </Page>

        {/* Content Pages */}
        {reviews.flatMap((review, index) => {
          const coverImage = review.coverImage as Media;

          // On mobile: single combined page with cover on top, review below
          if (isMobile) {
            return [
              <Page
                key={`combined-${review.id}`}
                number={index + 1}
                className="bg-[#fdfbf7]"
              >
                <div className="h-full flex flex-col gap-4 overflow-y-auto py-2">
                  {/* Cover Image on Top */}
                  <div className="relative w-full flex-shrink-0 flex justify-center">
                    <div className="relative w-[50%] aspect-[2/3] shadow-lg z-20">
                      {coverImage?.url ? (
                        <Image
                          src={coverImage.url}
                          alt={coverImage.alt || review.title}
                          fill
                          className="object-cover rounded-sm shadow-md"
                          sizes="200px"
                          placeholder={
                            coverImage.blurDataURL ? "blur" : "empty"
                          }
                          blurDataURL={coverImage.blurDataURL || undefined}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 rounded-sm">
                          No Cover
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review Content Below */}
                  <div className="flex-1 flex flex-col justify-center space-y-3 text-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 justify-center">
                        <Badge
                          variant="outline"
                          className="opacity-70 border-primary/20 bg-primary/5 text-primary text-xs"
                        >
                          Featured
                        </Badge>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "h-3 w-3",
                                i < review.rating
                                  ? "fill-orange-400 text-orange-400"
                                  : "text-gray-300"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <h2 className="font-serif text-xl font-bold tracking-tight text-gray-900 leading-tight">
                        {review.title}
                      </h2>
                      <p className="text-sm text-gray-500 font-medium italic">
                        by {review.bookAuthor}
                      </p>
                    </div>

                    <div className="prose prose-sm prose-gray max-w-none text-gray-600 line-clamp-4 leading-relaxed font-serif text-sm px-2">
                      {extractTextFromRichText(review.reviewContent)}
                      <span className="text-primary font-bold ml-1">...</span>
                    </div>

                    <div className="pt-2 flex justify-center">
                      <Button
                        asChild
                        size="sm"
                        className="font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow-sm hover:shadow-md transition-all"
                      >
                        <Link href={`/reviews/${review.slug}`}>
                          Read Review <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </Page>,
            ];
          }

          // On desktop: two-page spread (review left, cover right)
          return [
            // Left Page: Text content
            <Page
              key={`text-${review.id}`}
              number={index * 2 + 1}
              // header="Review"
            >
              <div className="space-y-6 h-full flex flex-col justify-center">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Badge
                      variant="outline"
                      className="opacity-70 border-primary/20 bg-primary/5 text-primary"
                    >
                      Featured Selection
                    </Badge>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-3 w-3",
                            i < review.rating
                              ? "fill-orange-400 text-orange-400"
                              : "text-gray-300"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 leading-tight">
                    {review.title}
                  </h2>
                  <p className="text-lg text-gray-500 font-medium italic">
                    by {review.bookAuthor}
                  </p>
                </div>

                <div className="prose prose-sm prose-gray max-w-none text-gray-600 line-clamp-6 md:line-clamp-8 leading-relaxed font-serif">
                  {extractTextFromRichText(review.reviewContent)}
                  <span className="text-primary font-bold ml-1">...</span>
                </div>

                <div className="pt-4 flex justify-center md:justify-start">
                  <Button
                    asChild
                    className="font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow-sm hover:shadow-md transition-all"
                  >
                    <Link href={`/reviews/${review.slug}`}>
                      Read Review <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Page>,

            // Right Page: Book Cover
            <Page
              key={`img-${review.id}`}
              number={index * 2 + 2}
              className="bg-gray-100 flex items-center justify-center p-0"
            >
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gray-100/50">
                {/* Subtle pattern or texture could go here */}
                <div className="absolute inset-0 bg-white/40 z-10" />

                {/* The visible cover */}
                <div className="relative w-[80%] aspect-[2/3] shadow-lg rotate-1 z-20 transition-all duration-300 hover:rotate-0 hover:scale-[1.02]">
                  {coverImage?.url ? (
                    <Image
                      src={coverImage.url}
                      alt={coverImage.alt || review.title}
                      fill
                      className="object-cover rounded-sm shadow-md"
                      sizes="(max-width: 768px) 300px, 400px"
                      placeholder={coverImage.blurDataURL ? "blur" : "empty"}
                      blurDataURL={coverImage.blurDataURL || undefined}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
                      No Cover
                    </div>
                  )}
                  {/* Spine effect */}
                  <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-r from-black/20 to-transparent z-30" />
                </div>
              </div>
            </Page>,
          ];
        })}

        {/* Back Cover (Hard) */}
        <Page
          className="bg-primary/95 text-primary-foreground items-center justify-center"
          isCover
          number={reviews.length * 2 + 1}
        >
          <div className="border-4 border-double border-white/30 p-8 w-full h-full flex flex-col justify-center items-center opacity-80">
            <p className="font-serif text-2xl font-bold mb-4">The End</p>
            <Button
              variant="outline"
              className="bg-transparent text-white border-white/40 hover:bg-white hover:text-primary mt-4"
              onClick={() => bookRef.current?.pageFlip().turnToPage(0)}
            >
              Flip to Start
            </Button>
          </div>
        </Page>
      </HTMLFlipBook>

      {/* External Controls (Optional but helpful) */}
      <div className="absolute -bottom-10 flex gap-4 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <Button
          size="icon"
          variant="outline"
          onClick={goToPrev}
          className="rounded-full shadow-md bg-white hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={goToNext}
          className="rounded-full shadow-md bg-white hover:bg-gray-50"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
