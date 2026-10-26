import { BookOpen } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardLink } from "@/components/ui/card";
import type { AppLocale } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { resolveMediaUrl } from "@/lib/media-url";
import { isPubliclyVisible } from "@/lib/publish-visibility";
import type { Media, ReadingList } from "@/payload-types";

interface ReadingListCardProps {
	readingList: ReadingList;
	className?: string;
	priority?: boolean;
	/** The locale segment of the link; defaults to English. */
	locale?: AppLocale;
	/**
	 * The `sizes` attribute for the cover. It has to describe the grid the card
	 * is rendered into, which differs per surface: the home page lays out two
	 * columns below `lg` and four above it, the index one below `sm`, two to
	 * `lg` and three above. The default describes the home page grid.
	 */
	sizes?: string;
}

export function ReadingListCard({
	readingList,
	className,
	priority = false,
	locale = "en",
	sizes = "(max-width: 1023px) 50vw, 25vw",
}: ReadingListCardProps) {
	const coverImage = readingList.coverImage as Media;
	const dictionary = getDictionary(locale);
	// The badge has to report the same list the detail page renders, so a
	// scheduled review is not counted (`FR-5`). The reads that render this card
	// populate `reviews`, so each entry is a document the rule can judge; an id
	// is kept rather than dropped, because an unpopulated relationship says
	// nothing about visibility and must not advertise "0 books".
	const now = new Date();
	const bookCount = (
		Array.isArray(readingList.reviews) ? readingList.reviews : []
	).filter(
		(review) => typeof review === "number" || isPubliclyVisible(review, now),
	).length;

	return (
		<CardLink
			href={`/${locale}/reading-lists/${readingList.slug}`}
			className={className}
		>
			<div className="aspect-video relative overflow-hidden rounded-t-lg">
				{coverImage?.url ? (
					<Image
						src={resolveMediaUrl(coverImage.url)}
						alt={coverImage.alt || readingList.title || ""}
						fill
						className="object-cover transition-transform duration-500 group-hover:scale-105"
						sizes={sizes}
						priority={priority}
						loading={priority ? "eager" : "lazy"}
						placeholder={coverImage.blurDataURL ? "blur" : "empty"}
						blurDataURL={coverImage.blurDataURL || undefined}
					/>
				) : (
					<div className="w-full h-full bg-linear-to-br from-primary/20 to-accent/20 flex items-center justify-center">
						<BookOpen className="h-12 w-12 text-muted-foreground/50" />
					</div>
				)}
				<div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
				<Badge
					variant="secondary"
					className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-sm"
				>
					<BookOpen className="h-3 w-3 mr-1" />
					{bookCount}{" "}
					{bookCount === 1
						? dictionary.readingListBookSingular
						: dictionary.readingListBookPlural}
				</Badge>
			</div>
			<CardContent className="pt-4 pb-5">
				<h3 className="font-serif text-lg font-bold leading-tight group-hover:text-primary transition-colors line-clamp-1">
					{readingList.title}
				</h3>
				{readingList.description && (
					<p className="text-sm text-muted-foreground line-clamp-2 mt-1">
						{readingList.description}
					</p>
				)}
			</CardContent>
		</CardLink>
	);
}
