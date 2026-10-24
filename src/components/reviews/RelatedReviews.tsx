import configPromise from "@payload-config";
import { getPayload, Where } from "payload";
import type { AppLocale } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";
import { Genre, MoodTag, Tag } from "@/payload-types";
import { ReviewCard } from "../ReviewCard";

interface RelatedReviewsProps {
	currentReviewId: number;
	genres?: (Genre | number)[] | null;
	tags?: (Tag | number)[] | null;
	moodTags?: (MoodTag | number)[] | null;
	/** UI language for the related cards' dates; defaults to English. */
	locale?: AppLocale;
}

export async function RelatedReviews({
	currentReviewId,
	genres = [],
	tags = [],
	moodTags = [],
	locale = "en",
}: RelatedReviewsProps) {
	// 1. Extract IDs safely
	const genreIds = (genres || [])
		.map((g) => (typeof g === "number" ? g : g.id))
		.filter(Boolean);

	const tagIds = (tags || [])
		.map((t) => (typeof t === "number" ? t : t.id))
		.filter(Boolean);

	const moodTagIds = (moodTags || [])
		.map((m) => (typeof m === "number" ? m : m.id))
		.filter(Boolean);

	// If there's nothing to match on, don't show anything
	if (genreIds.length === 0 && tagIds.length === 0 && moodTagIds.length === 0) {
		return null;
	}

	const payload = await getPayload({ config: configPromise });

	// 2. Build Query
	// We want: Status=Published AND ID!=Current AND (Genre IN [...] OR Tag IN [...] OR Mood IN [...])
	const orConditions: Where[] = [];

	if (genreIds.length > 0) {
		orConditions.push({
			genres: {
				in: genreIds,
			},
		});
	}
	if (tagIds.length > 0) {
		orConditions.push({
			tags: {
				in: tagIds,
			},
		});
	}
	if (moodTagIds.length > 0) {
		orConditions.push({
			moodTags: {
				in: moodTagIds,
			},
		});
	}

	const { docs: relatedReviews } = await payload.find({
		collection: "reviews",
		where: {
			and: [
				{
					id: {
						not_equals: currentReviewId,
					},
				},
				// A review scheduled for the future is not public, so it must not
				// surface here either: these cards are shown on a public page.
				publishedAndVisibleWhere(new Date()),
				{
					or: orConditions,
				},
			],
		},
		limit: 3,
		depth: 1,
		// The cards print the review title and the taxonomy names, so the read
		// has to happen in the locale the page is rendering (FR-11). Without
		// it every related review comes back in the default locale and the
		// Indonesian page shows English titles next to Indonesian ones.
		locale,
	});

	if (!relatedReviews || relatedReviews.length === 0) {
		return null;
	}

	const dictionary = getDictionary(locale);

	return (
		<section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
			<div className="text-center md:text-left">
				<h2 className="text-3xl font-serif font-bold text-foreground">
					{dictionary.relatedMoreLikeThis}
				</h2>
				<p className="text-muted-foreground mt-2">
					{dictionary.relatedDescription}
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{relatedReviews.map((review) => (
					<ReviewCard key={review.id} review={review} locale={locale} />
				))}
			</div>
		</section>
	);
}
