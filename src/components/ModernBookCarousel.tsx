"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, extractTextFromRichText } from "@/lib/utils";
import type { Media, Review } from "@/payload-types";

interface ModernBookCarouselProps {
	reviews: Review[];
}

export default function ModernBookCarousel({
	reviews,
}: ModernBookCarouselProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [activeSlide, setActiveSlide] = useState(0);

	// Handle scroll to track active slide
	const handleScroll = () => {
		if (!scrollRef.current) return;
		const { scrollLeft, clientWidth } = scrollRef.current;
		const index = Math.round(scrollLeft / clientWidth);
		if (index !== activeSlide) {
			setActiveSlide(index);
		}
	};

	const scrollTo = (index: number) => {
		if (!scrollRef.current) return;
		scrollRef.current.scrollTo({
			left: index * scrollRef.current.clientWidth,
			behavior: "smooth",
		});
	};

	const next = React.useCallback(() => {
		const nextIndex = (activeSlide + 1) % reviews.length;
		scrollTo(nextIndex);
	}, [activeSlide, reviews.length]);

	const prev = () => {
		const prevIndex = (activeSlide - 1 + reviews.length) % reviews.length;
		scrollTo(prevIndex);
	};

	// Auto-play
	useEffect(() => {
		const timer = setInterval(next, 5000);
		return () => clearInterval(timer);
	}, [next]);

	return (
		<div className="relative group w-full max-w-5xl mx-auto">
			{/* Main Snap Container */}
			<div
				ref={scrollRef}
				onScroll={handleScroll}
				className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-0 scroll-smooth"
				style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
			>
				{reviews.map((review, index) => {
					const coverImage = review.coverImage as Media;
					return (
						<div
							key={review.id}
							className="min-w-full snap-center grid gap-8 lg:grid-cols-2 lg:gap-16 items-center px-4 md:px-12 py-8"
						>
							{/* Content Side */}
							<div
								className="flex flex-col justify-center space-y-6 order-2 lg:order-1 text-center lg:text-left transition-all duration-700 opacity-0 translate-y-4 data-[active=true]:opacity-100 data-[active=true]:translate-y-0"
								data-active={activeSlide === index}
							>
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
															: "text-muted-foreground/30",
													)}
												/>
											))}
										</div>
									</div>
									<h2 className="font-serif text-3xl md:text-5xl font-bold tracking-tight">
										{review.title}
									</h2>
									<p className="text-xl text-muted-foreground font-medium">
										by {review.bookAuthor}
									</p>
								</div>

								<div className="prose prose-gray dark:prose-invert max-w-none line-clamp-3 text-muted-foreground text-lg italic">
									&quot;{extractTextFromRichText(review.reviewContent)}&quot;
								</div>

								<div className="flex flex-col gap-2 min-[400px]:flex-row w-full justify-center lg:justify-start">
									<Button
										asChild
										size="lg"
										className="font-medium group/btn shadow-lg"
									>
										<Link href={`/reviews/${review.slug}`}>
											Read Full Review{" "}
											<ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
										</Link>
									</Button>
								</div>
							</div>

							{/* Book Cover Side */}
							<div
								className="flex justify-center lg:justify-end order-1 lg:order-2 transition-all duration-1000 scale-95 opacity-50 data-[active=true]:scale-100 data-[active=true]:opacity-100"
								data-active={activeSlide === index}
							>
								<div className="relative w-[240px] md:w-[320px] lg:w-[380px] aspect-2/3 shadow-2xl rounded-lg transform perspective-1000 rotate-y-n12 group-hover:rotate-y-0 transition-transform duration-700">
									{coverImage?.url && (
										<Image
											src={coverImage.url}
											alt={coverImage.alt || review.title}
											fill
											className="object-cover rounded-lg shadow-2xl"
											priority={index === 0}
											fetchPriority={index === 0 ? "high" : "low"}
											sizes="(max-width: 768px) 240px, (max-width: 1024px) 320px, 380px"
											placeholder={coverImage.blurDataURL ? "blur" : "empty"}
											blurDataURL={coverImage.blurDataURL || undefined}
										/>
									)}
									{/* Book spine effect */}
									<div className="absolute inset-y-0 left-0 w-4 bg-linear-to-r from-black/20 to-transparent rounded-l-lg pointer-events-none" />
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Navigation Buttons */}
			<div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
				<Button
					variant="outline"
					size="icon"
					onClick={prev}
					className="rounded-full bg-background/80 backdrop-blur-sm pointer-events-auto h-12 w-12 border-none shadow-xl hover:bg-primary hover:text-white transition-all transform -translate-x-4 group-hover:translate-x-0"
				>
					<ChevronLeft className="h-6 w-6" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={next}
					className="rounded-full bg-background/80 backdrop-blur-sm pointer-events-auto h-12 w-12 border-none shadow-xl hover:bg-primary hover:text-white transition-all transform translate-x-4 group-hover:translate-x-0"
				>
					<ChevronRight className="h-6 w-6" />
				</Button>
			</div>

			{/* Indicators */}
			<div className="flex justify-center gap-2 mt-4">
				{reviews.map((_, i) => (
					<button
						key={i}
						onClick={() => scrollTo(i)}
						className={cn(
							"h-1.5 transition-all duration-300 rounded-full",
							activeSlide === i
								? "w-8 bg-primary"
								: "w-2 bg-primary/20 hover:bg-primary/40",
						)}
						aria-label={`Go to slide ${i + 1}`}
					/>
				))}
			</div>

			<style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .rotate-y-n12 {
          transform: rotateY(-12deg);
        }
      `}</style>
		</div>
	);
}
