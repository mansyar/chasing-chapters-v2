/* eslint-disable @typescript-eslint/no-explicit-any */

import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import type { AppLocale } from "@/lib/date-format";
import { formatDate } from "@/lib/date-format";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type { Media, Review } from "@/payload-types";

interface ReviewCardProps {
	review: Review;
	className?: string;
	priority?: boolean;
	/** UI language for the publish date; defaults to English. */
	locale?: AppLocale;
}

export function ReviewCard({
	review,
	className,
	priority = false,
	locale = "en",
}: ReviewCardProps) {
	const coverImage = review.coverImage as Media;

	return (
		<Link
			href={`/reviews/${review.slug}`}
			className={cn("group block h-full", className)}
		>
			<Card className="h-full overflow-hidden border-none shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card">
				<div className="aspect-2/3 relative overflow-hidden rounded-md shadow-md group-hover:shadow-none transition-all duration-300">
					{coverImage?.url && (
						<Image
							src={resolveMediaUrl(coverImage.url)}
							alt={coverImage.alt || review.title}
							fill
							className="object-cover"
							sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
							priority={priority}
							loading={priority ? "eager" : "lazy"}
							placeholder={coverImage.blurDataURL ? "blur" : "empty"}
							blurDataURL={coverImage.blurDataURL || undefined}
						/>
					)}
				</div>
				<CardHeader className="px-4 pt-4 pb-2">
					<div className="flex items-center justify-between mb-1">
						<div className="flex gap-1">
							{Array.from({ length: 5 }).map((_, i) => (
								<Star
									key={i}
									className={cn(
										"h-3.5 w-3.5",
										i < review.rating
											? "fill-primary text-primary"
											: "text-muted-foreground/30",
									)}
								/>
							))}
						</div>
						<span className="text-xs text-muted-foreground">
							{formatDate(review.publishDate || review.createdAt, locale)}
						</span>
					</div>
					<h3 className="font-serif text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
						{review.title}
					</h3>
					<p className="text-sm text-muted-foreground font-medium">
						{review.bookAuthor}
					</p>
				</CardHeader>
				<CardFooter className="px-4 pt-0 gap-2 flex-wrap">
					{review.genres &&
						Array.isArray(review.genres) &&
						review.genres.slice(0, 2).map((genre: any) => (
							<Badge key={genre.id} variant="secondary" className="font-normal">
								{genre.name}
							</Badge>
						))}
				</CardFooter>
			</Card>
		</Link>
	);
}
