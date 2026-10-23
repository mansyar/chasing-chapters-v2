import configPromise from "@payload-config";
import { RichText } from "@payloadcms/richtext-lexical/react";
import { Calendar, Star, User } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { ViewTracker } from "@/components/analytics/ViewTracker";
import { CommentSection } from "@/components/comments/CommentSection";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { LanguageToggle } from "@/components/reviews/LanguageToggle";
import { LikeButton } from "@/components/reviews/LikeButton";
import { RelatedReviews } from "@/components/reviews/RelatedReviews";
import { ShareButton } from "@/components/ShareButton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import { normalizeLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { resolveMediaUrl } from "@/lib/media-url";
import {
	generateBreadcrumbSchema,
	generateReviewSchema,
	SITE_URL,
} from "@/lib/seo/structured-data";
import type { Media } from "@/payload-types";

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

interface PageProps {
	params: Promise<{
		locale: string;
		slug: string;
	}>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale, slug } = await params;
	const appLocale = normalizeLocale(locale);
	const payload = await getPayload({ config: configPromise });

	const { docs: reviews } = await payload.find({
		collection: "reviews",
		where: {
			slug: {
				equals: slug,
			},
			_status: {
				equals: "published",
			},
		},
		limit: 1,
		depth: 1,
		locale: appLocale,
	});

	const review = reviews[0];

	if (!review) {
		return {
			title: "Review Not Found",
		};
	}

	const description = `Read our review of ${review.title} by ${review.bookAuthor}. Rating: ${review.rating}/5 stars.`;

	return {
		title: review.title,
		description,
		alternates: {
			canonical: `${SITE_URL}/${appLocale}/reviews/${review.slug}`,
			languages: {
				en: `${SITE_URL}/en/reviews/${review.slug}`,
				id: `${SITE_URL}/id/reviews/${review.slug}`,
			},
		},
		openGraph: {
			title: review.title,
			description,
			type: "article",
		},
		twitter: {
			card: "summary_large_image",
			title: review.title,
			description,
		},
	};
}

export async function generateStaticParams() {
	const payload = await getPayload({ config: configPromise });
	const { docs } = await payload.find({
		collection: "reviews",
		where: {
			_status: {
				equals: "published",
			},
		},
		limit: 50, // Pre-build top 50 reviews
		select: {
			slug: true,
		},
	});

	return SUPPORTED_LOCALES.flatMap((locale) =>
		docs.map((doc) => ({
			locale,
			slug: doc.slug,
		})),
	);
}

export default async function ReviewPage({ params }: PageProps) {
	const { locale, slug } = await params;
	const appLocale = normalizeLocale(locale);
	const payload = await getPayload({ config: configPromise });

	const { docs: reviews } = await payload.find({
		collection: "reviews",
		locale: appLocale,
		where: {
			slug: {
				equals: slug,
			},
			_status: {
				equals: "published",
			},
		},
		limit: 1,
		depth: 2,
	});

	const review = reviews[0];

	if (!review) {
		notFound();
	}

	const coverImage = review.coverImage as Media;
	const dictionary = getDictionary(appLocale);
	const jsonLd = generateReviewSchema(review, coverImage);
	const breadcrumbJsonLd = generateBreadcrumbSchema([
		{ name: "Home", url: `${SITE_URL}/${appLocale}` },
		{ name: "Reviews", url: `${SITE_URL}/${appLocale}/reviews` },
		{
			name: review.title,
			url: `${SITE_URL}/${appLocale}/reviews/${review.slug}`,
		},
	]);

	return (
		<article className="min-h-screen pb-20">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
			/>
			<ReadingProgressBar />
			<ViewTracker reviewId={String(review.id)} />
			{/* Hero Header */}
			<div className="bg-muted/30 py-12 md:py-20">
				<div className="container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
					<div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12 items-start">
						{/* Book Cover */}
						<div className="mx-auto lg:mx-0 w-[240px] md:w-[300px] aspect-2/3 relative shadow-2xl rounded-lg rotate-2 hover:rotate-0 transition-transform duration-500 bg-background">
							{coverImage?.url && (
								<Image
									src={resolveMediaUrl(coverImage.url)}
									alt={coverImage.alt || review.title}
									fill
									className="object-cover rounded-lg"
									priority
									sizes="(max-width: 768px) 100vw, 300px"
									placeholder={coverImage.blurDataURL ? "blur" : "empty"}
									blurDataURL={coverImage.blurDataURL || undefined}
								/>
							)}
						</div>

						{/* Header Content */}
						<div className="space-y-6 text-center lg:text-left">
							<div className="space-y-2">
								<div className="flex items-center justify-center lg:justify-start gap-2 text-primary">
									{Array.from({ length: 5 }).map((_, i) => (
										<Star
											key={i}
											className={`h-5 w-5 ${
												i < review.rating
													? "fill-current"
													: "text-muted-foreground/30"
											}`}
										/>
									))}
								</div>
								<h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight text-foreground">
									{review.title}
								</h1>
								<p className="text-xl text-muted-foreground font-medium">
									{formatMessage(dictionary.cardByAuthor, {
										author: review.bookAuthor,
									})}
								</p>
							</div>
							<div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-muted-foreground">
								<div className="flex items-center gap-1">
									<User className="h-4 w-4" />
									<span>
										{typeof review.author === "object" && review.author
											? review.author.name
											: null}
									</span>
								</div>
								<Separator orientation="vertical" className="h-4" />
								<div className="flex items-center gap-1">
									<Calendar className="h-4 w-4" />
									<span>
										{formatDate(
											review.publishDate || review.createdAt,
											appLocale,
										)}
									</span>
								</div>
							</div>

							<div className="flex flex-wrap justify-center lg:justify-start gap-2">
								{review.genres &&
									Array.isArray(review.genres) &&
									review.genres.map((genre) =>
										typeof genre === "number" ? null : (
											<Badge key={genre.id} variant="secondary">
												{genre.name}
											</Badge>
										),
									)}

								<LanguageToggle dictionary={dictionary} />
								<ShareButton
									title={formatMessage(dictionary.reviewShareTitle, {
										title: review.title,
									})}
									className="ml-2"
									dictionary={dictionary}
								/>
								<LikeButton
									reviewId={String(review.id)}
									initialLikes={review.likes || 0}
									className="ml-2"
									dictionary={dictionary}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 grid gap-12 lg:grid-cols-[1fr_300px] max-w-7xl">
				<div className="space-y-12">
					{/* Review Content */}
					<div className="prose prose-lg prose-gray dark:prose-invert max-w-3xl font-serif">
						<RichText data={review.reviewContent} />
					</div>

					{/* Structured Sections */}
					<div className="grid gap-8 md:grid-cols-2">
						{review.whatILoved && (
							<div className="bg-green-50 dark:bg-green-950/20 p-6 rounded-xl border border-green-100 dark:border-green-900">
								<h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-green-800 dark:text-green-300">
									{dictionary.reviewWhatILoved}
								</h3>
								<div className="prose prose-sm dark:prose-invert">
									<RichText data={review.whatILoved} />
								</div>
							</div>
						)}

						{review.whatCouldBeBetter && (
							<div className="bg-orange-50 dark:bg-orange-950/20 p-6 rounded-xl border border-orange-100 dark:border-orange-900">
								<h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-orange-800 dark:text-orange-300">
									{dictionary.reviewWhatCouldBeBetter}
								</h3>
								<div className="prose prose-sm dark:prose-invert">
									<RichText data={review.whatCouldBeBetter} />
								</div>
							</div>
						)}

						{review.perfectFor && (
							<div className="bg-blue-50 dark:bg-blue-950/20 p-6 rounded-xl border border-blue-100 dark:border-blue-900 md:col-span-2">
								<h3 className="font-serif text-xl font-bold mb-4 flex items-center gap-2 text-blue-800 dark:text-blue-300">
									{dictionary.reviewPerfectFor}
								</h3>
								<div className="prose prose-sm dark:prose-invert">
									<RichText data={review.perfectFor} />
								</div>
							</div>
						)}
					</div>

					{/* Favorite Quotes */}
					{review.favoriteQuotes && review.favoriteQuotes.length > 0 && (
						<div className="space-y-6">
							<h3 className="font-serif text-2xl font-bold border-b pb-2">
								{dictionary.reviewFavoriteQuotes}
							</h3>
							<div className="grid gap-6">
								{review.favoriteQuotes.map((item, i) => (
									<blockquote
										key={i}
										className="relative pl-8 italic text-xl text-muted-foreground border-l-4 border-primary/30"
									>
										"{item.quote}"
										{item.page && (
											<footer className="text-sm not-italic mt-2 text-muted-foreground/60">
												—{" "}
												{formatMessage(dictionary.reviewPage, {
													page: item.page,
												})}
											</footer>
										)}
									</blockquote>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Sidebar */}
				<div className="space-y-8">
					{/* Tags */}
					{review.tags &&
						Array.isArray(review.tags) &&
						review.tags.length > 0 && (
							<div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
								<h3 className="font-semibold mb-4">{dictionary.reviewTags}</h3>
								<div className="flex flex-wrap gap-2">
									{review.tags.map((tag) =>
										typeof tag === "number" ? null : (
											<Badge key={tag.id} variant="outline">
												{tag.name}
											</Badge>
										),
									)}
								</div>
							</div>
						)}

					{/* Moods */}
					{review.moodTags &&
						Array.isArray(review.moodTags) &&
						review.moodTags.length > 0 && (
							<div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
								<h3 className="font-semibold mb-4">{dictionary.reviewMood}</h3>
								<div className="flex flex-wrap gap-2">
									{review.moodTags.map((mood) =>
										typeof mood === "number" ? null : (
											<div
												key={mood.id}
												className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
												style={{
													backgroundColor: mood.color + "20",
													color: mood.color,
													borderColor: mood.color + "40",
												}}
											>
												{mood.icon && <span className="mr-1">{mood.icon}</span>}
												{mood.name}
											</div>
										),
									)}
								</div>
							</div>
						)}

					{/* Reading Log */}
					{(review.readingStartDate || review.readingFinishDate) && (
						<div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
							<h3 className="font-semibold mb-4">
								{dictionary.reviewReadingLog}
							</h3>
							<div className="space-y-3 text-sm">
								{review.readingStartDate && (
									<div className="flex justify-between items-center">
										<span className="text-muted-foreground">
											{dictionary.reviewStarted}
										</span>
										<span className="font-medium">
											{formatDate(review.readingStartDate, appLocale, {
												month: "short",
											})}
										</span>
									</div>
								)}
								{review.readingFinishDate && (
									<div className="flex justify-between items-center">
										<span className="text-muted-foreground">
											{dictionary.reviewFinished}
										</span>
										<span className="font-medium">
											{formatDate(review.readingFinishDate, appLocale, {
												month: "short",
											})}
										</span>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Related Reviews */}
			<div className="container mx-auto px-6 md:px-12 lg:px-24 pb-12 max-w-7xl [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
				<RelatedReviews
					currentReviewId={review.id}
					genres={review.genres}
					tags={review.tags}
					moodTags={review.moodTags}
					locale={appLocale}
				/>
			</div>

			{/* Comments Section */}
			<Separator className="my-8" />
			<div className="[content-visibility:auto] [contain-intrinsic-size:auto_600px]">
				<CommentSection
					reviewId={review.id}
					locale={appLocale}
					dictionary={dictionary}
				/>
			</div>
		</article>
	);
}
