import Image from "next/image";
import Link from "next/link";
import type { AppLocale } from "@/lib/date-format";
import { formatDate } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { resolveMediaUrl } from "@/lib/media-url";
import { isPubliclyVisible } from "@/lib/publish-visibility";
import type { AffinityCandidate, RelatedPick } from "@/lib/related-scoring";
import type { Media, Review } from "@/payload-types";
import { StarRating } from "./StarRating";

/**
 * The ids of a relationship field that holds populated docs, raw ids, or a
 * mix of both. Non-numeric entries contribute nothing, so a corrupt row can
 * neither match nor crash the overlap count.
 */
function idsOf(
	values: Array<number | { id: number } | null> | null | undefined,
): number[] {
	const ids: number[] = [];

	for (const value of values ?? []) {
		const id = typeof value === "number" ? value : value?.id;
		if (typeof id === "number" && Number.isFinite(id)) {
			ids.push(id);
		}
	}

	return ids;
}

function sharedCount(docIds: number[], currentIds: number[]): number {
	if (docIds.length === 0 || currentIds.length === 0) {
		return 0;
	}

	const current = new Set(currentIds);
	let shared = 0;

	for (const id of docIds) {
		if (current.has(id)) {
			shared += 1;
		}
	}

	return shared;
}

/**
 * Builds the pick flag for one populated author pick.
 *
 * Eligibility mirrors `publishedAndVisibleWhere` through its in-memory shape
 * (`isPubliclyVisible`), plus the runtime self guard the CMS filter cannot
 * cover for already-saved rows, plus a slug guard: a pick without a slug has
 * no destination and must never win a rail slot.
 */
export function toRelatedPick(
	doc: Review,
	currentReviewId: number,
	now: Date,
): RelatedPick {
	const slug = typeof doc.slug === "string" ? doc.slug : "";

	return {
		slug,
		eligible:
			doc.id !== currentReviewId &&
			slug.length > 0 &&
			isPubliclyVisible(doc, now),
	};
}

/**
 * Builds the affinity candidate for one review read, counting its taxonomy
 * overlap with the current review. Eligibility uses the same guards as picks,
 * so the scorer (`rankAffinityCandidates`) only ever orders linkable, public
 * reviews that are not the current one.
 */
export function toAffinityCandidate(
	doc: Review,
	genreIds: number[],
	tagIds: number[],
	moodTagIds: number[],
	currentReviewId: number,
	now: Date,
): AffinityCandidate {
	const slug = typeof doc.slug === "string" ? doc.slug : "";

	return {
		slug,
		sharedGenres: sharedCount(idsOf(doc.genres), genreIds),
		sharedTags: sharedCount(idsOf(doc.tags), tagIds),
		sharedMoods: sharedCount(idsOf(doc.moodTags), moodTagIds),
		publishDate: doc.publishDate ?? null,
		eligible:
			doc.id !== currentReviewId &&
			slug.length > 0 &&
			isPubliclyVisible(doc, now),
	};
}

interface RelatedReviewsListProps {
	/** Already-ordered rail docs: picks first, affinity backfill after. */
	reviews: Review[];
	/** UI language for the heading and the cards' dates; defaults to English. */
	locale?: AppLocale;
}

/**
 * The RelatedReviews rail body: compact rows, one link per row.
 *
 * The h2 heading and description are unchanged (the dictionary owns the copy,
 * so no new strings are introduced). Titles arrive in the rendering locale
 * with English fallback handled by Payload (`fallback: true` in
 * `payload.config.ts`), so an untranslated pick still shows its English
 * title instead of a blank row. Each row is a native link (`min-h-[44px]`)
 * with list semantics, so keyboard and touch behavior need no custom code.
 */
export function RelatedReviewsList({
	reviews,
	locale = "en",
}: RelatedReviewsListProps) {
	const dictionary = getDictionary(locale);

	if (reviews.length === 0) {
		return null;
	}

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

			<ul className="grid gap-4">
				{reviews.map((review) => {
					const coverImage = review.coverImage as Media;
					const coverUrl =
						typeof coverImage === "object" && coverImage !== null
							? resolveMediaUrl(coverImage.url)
							: null;

					return (
						<li key={review.id}>
							<Link
								href={`/${locale}/reviews/${review.slug}`}
								className="group flex min-h-[44px] items-center gap-4 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
							>
								<div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
									{coverUrl ? (
										<Image
											src={coverUrl}
											alt={coverImage.alt || review.title || ""}
											fill
											className="object-cover"
											sizes="64px"
											loading="lazy"
											placeholder={coverImage.blurDataURL ? "blur" : "empty"}
											blurDataURL={coverImage.blurDataURL || undefined}
										/>
									) : null}
								</div>
								<div className="min-w-0 flex-1">
									<h3 className="font-serif text-lg font-bold leading-tight transition-colors group-hover:text-primary line-clamp-2">
										{review.title}
									</h3>
									<div className="mt-1 flex items-center gap-3">
										<StarRating
											rating={review.rating}
											labelTemplate={dictionary.ratingLabel}
											size="sm"
										/>
										<span className="text-xs text-muted-foreground">
											{formatDate(
												review.publishDate || review.createdAt,
												locale,
											)}
										</span>
									</div>
								</div>
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
