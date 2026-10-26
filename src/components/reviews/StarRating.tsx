import { Star } from "lucide-react";

import { formatMessage } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** The three sizes the former inline star renderers used. */
export type StarRatingSize = "sm" | "md" | "lg";

/**
 * Wrapper gap and star icon classes per size, copied verbatim from the four
 * inline renderers this component replaces, so every swap is visually neutral:
 *
 * - `sm` — ReviewCard (`flex gap-1`, `h-3.5 w-3.5`)
 * - `md` — FeaturedHero and ModernBookCarousel (`flex gap-0.5`, `h-4 w-4`)
 * - `lg` — the review detail page (`gap-2`, `h-5 w-5`)
 */
const sizeClasses: Record<StarRatingSize, { wrapper: string; star: string }> = {
	sm: { wrapper: "gap-1", star: "h-3.5 w-3.5" },
	md: { wrapper: "gap-0.5", star: "h-4 w-4" },
	lg: { wrapper: "gap-2", star: "h-5 w-5" },
};

interface StarRatingProps {
	/**
	 * The rating to render, out of 5.
	 *
	 * Values outside 0–5 are clamped into that range rather than rendered as
	 * nonsense: below 0 renders no filled stars, above 5 renders five. The
	 * announced label uses the clamped value so what a screen reader says
	 * always matches what is on screen.
	 */
	rating: number;
	/**
	 * The localized `"Rated {rating} out of 5"` template, passed in from the
	 * caller's dictionary. This component never imports the dictionary itself
	 * (client components such as the hero render it too), so it accepts the
	 * template as a prop and fills the hole here.
	 */
	labelTemplate: string;
	/** Defaults to `"md"`, the hero and carousel size. */
	size?: StarRatingSize;
	className?: string;
}

/**
 * A read-only five-star rating display.
 *
 * The filled/empty logic matches the inline renderers it replaced exactly —
 * star `i` is filled when `i < rating` — so fractional ratings render the same
 * way they always did. The stars are hidden from assistive technology; the
 * rating is announced instead through a screen-reader-only label built from
 * the localized template, which the inline renderers never had.
 */
export function StarRating({
	rating,
	labelTemplate,
	size = "md",
	className,
}: StarRatingProps) {
	const clamped = Math.min(5, Math.max(0, rating));
	const { wrapper, star } = sizeClasses[size];

	return (
		<div className={cn("flex", wrapper, className)}>
			<span className="sr-only">
				{formatMessage(labelTemplate, { rating: clamped })}
			</span>
			{Array.from({ length: 5 }).map((_, i) => (
				<Star
					key={i}
					aria-hidden="true"
					className={cn(
						star,
						i < clamped
							? "fill-primary text-primary"
							: "text-muted-foreground/30",
					)}
				/>
			))}
		</div>
	);
}
