import configPromise from "@payload-config";
import { RichText } from "@payloadcms/richtext-lexical/react";
import { Calendar, Clock, User } from "lucide-react";
import type { Metadata } from "next";
import { draftMode, headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { ViewTracker } from "@/components/analytics/ViewTracker";
import { CommentSection } from "@/components/comments/CommentSection";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { Breadcrumbs } from "@/components/reviews/Breadcrumbs";
import { LanguageToggle } from "@/components/reviews/LanguageToggle";
import { LikeButton } from "@/components/reviews/LikeButton";
import { PreviewBanner } from "@/components/reviews/PreviewBanner";
import { QuoteShareButtons } from "@/components/reviews/QuoteShare";
import { RelatedReviews } from "@/components/reviews/RelatedReviews";
import { StarRating } from "@/components/reviews/StarRating";
import { TableOfContents } from "@/components/reviews/TableOfContents";
import { ShareButton } from "@/components/ShareButton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { normalizeLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { resolveMediaUrl } from "@/lib/media-url";
import { buildPreviewMetadata, canRenderDraft } from "@/lib/preview";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";
import { estimateReadingMinutes, formatReadingTime } from "@/lib/reading-time";
import { getAdjacentReviews } from "@/lib/review-navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
	generateBreadcrumbSchema,
	generateReviewSchema,
	SITE_URL,
} from "@/lib/seo/structured-data";
import { buildTableOfContents } from "@/lib/toc-extract";
import type { Media, Review } from "@/payload-types";
import { ReviewBody } from "./review-body";
import { SectionHeading } from "./section-heading";

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

interface PageProps {
	params: Promise<{
		locale: string;
		slug: string;
	}>;
}

/** The review this request should render, and whether it is a preview. */
interface ReviewLookup {
	review: Review | undefined;
	preview: boolean;
}

/**
 * Finds the review to render, honouring draft mode (`FR-2`).
 *
 * The order of the two reads is the whole point (`NFR-1`). `draftMode()` is a
 * per-request flavour flag, not a Dynamic API: during a static render it reports
 * `false` and Next keeps the page in the pre-rendered set, so asking for it
 * unconditionally costs nothing. The session, by contrast, is read from the
 * request headers - a Dynamic API - so it is read *only* inside the branch that
 * draft mode opens. Read at the top of the page it would turn both review detail
 * routes from `●` into `ƒ`, which is exactly the trade this phase refuses to
 * make.
 *
 * Draft mode alone is not authority: the bypass cookie survives a logout, so a
 * request without a session falls back to the public lookup - never draft
 * content. The public path is byte-identical to the one from before draft mode
 * existed: the same query, the same shared visibility gate, and the same
 * `undefined` that becomes a `404`.
 */
async function loadReview(
	slug: string,
	appLocale: Locale,
	depth: number,
): Promise<ReviewLookup> {
	const payload = await getPayload({ config: configPromise });
	const draftEnabled = (await draftMode()).isEnabled;

	const user = draftEnabled
		? (await payload.auth({ headers: await headers() })).user
		: null;
	const previewing = canRenderDraft({
		draftEnabled,
		hasSession: user !== null,
	});

	if (previewing && user) {
		// The newest version, published or not, in the requested locale. The
		// lookup runs as the signed-in user, so a writer previews only their own
		// reviews; `overrideAccess` stays off for exactly that reason.
		const { docs } = await payload.find({
			collection: "reviews",
			where: {
				slug: {
					equals: slug,
				},
			},
			limit: 1,
			depth,
			locale: appLocale,
			draft: true,
			overrideAccess: false,
			user,
		});

		return { review: docs[0], preview: true };
	}

	const { docs: reviews } = await payload.find({
		collection: "reviews",
		locale: appLocale,
		where: {
			and: [
				{
					slug: {
						equals: slug,
					},
				},
				publishedAndVisibleWhere(new Date()),
			],
		},
		limit: 1,
		depth,
	});

	return { review: reviews[0], preview: false };
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale, slug } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);
	const { review, preview } = await loadReview(slug, appLocale, 1);

	if (!review) {
		return {
			title: dictionary.metaReviewNotFound,
		};
	}

	const title = review.title ?? "";
	const description = formatMessage(dictionary.metaReviewDescription, {
		title,
		author: review.bookAuthor,
		rating: review.rating,
	});

	// A previewed page must be unshareable and unindexable (`FR-4`), so it
	// carries its own metadata object rather than a filtered public one.
	if (preview) {
		return buildPreviewMetadata({ title, description });
	}

	return buildPageMetadata({
		locale: appLocale,
		path: `/reviews/${review.slug}`,
		title,
		description,
		openGraphType: "article",
	});
}

export async function generateStaticParams() {
	const payload = await getPayload({ config: configPromise });
	const { docs } = await payload.find({
		collection: "reviews",
		// A review scheduled for the future is not a page yet: pre-building it
		// would cache the public view of a document nobody may read.
		where: publishedAndVisibleWhere(new Date()),
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
	const { review, preview } = await loadReview(slug, appLocale, 2);

	if (!review) {
		notFound();
	}

	const coverImage = review.coverImage as Media;
	const dictionary = getDictionary(appLocale);
	const jsonLd = generateReviewSchema(review, appLocale, coverImage);
	// One trail, two renderings: the structured data a crawler reads and the
	// breadcrumbs a reader sees are built from the same list, so the two cannot
	// drift apart.
	const trail = [
		{ name: dictionary.breadcrumbHome, path: `/${appLocale}` },
		{ name: dictionary.navReviews, path: `/${appLocale}/reviews` },
		{ name: review.title ?? "", path: `/${appLocale}/reviews/${review.slug}` },
	];
	const breadcrumbJsonLd = generateBreadcrumbSchema(
		trail.map((item) => ({ name: item.name, url: `${SITE_URL}${item.path}` })),
		appLocale,
	);
	// A draft preview has no neighbours and no trail: both describe a published
	// catalogue this version of the review is not part of yet.
	const adjacent = preview
		? { newer: null, older: null }
		: await getAdjacentReviews(
				await getPayload({ config: configPromise }),
				review,
				{ locale: appLocale },
			);

	// One TOC build feeds both the navigation and the heading ids, so the two
	// can never disagree on slugs (`FR-2`, `FR-4`).
	const tocEntries = buildTableOfContents({
		body: review.reviewContent,
		whatILoved: review.whatILoved,
		whatCouldBeBetter: review.whatCouldBeBetter,
		perfectFor: review.perfectFor,
		favoriteQuotes: review.favoriteQuotes,
		labels: {
			whatILoved: dictionary.reviewWhatILoved,
			whatCouldBeBetter: dictionary.reviewWhatCouldBeBetter,
			perfectFor: dictionary.reviewPerfectFor,
			favoriteQuotes: dictionary.reviewFavoriteQuotes,
		},
	});
	const bodyHeadingSlugs = tocEntries
		.filter((entry) => entry.source === "body")
		.map((entry) => entry.slug);
	const sectionSlugFor = (title: string): string | undefined =>
		tocEntries.find(
			(entry) => entry.source === "section" && entry.title === title,
		)?.slug;
	// The badge always renders, even when the TOC hides on short reviews (`AC-8`).
	const readingTimeLabel = formatReadingTime(
		estimateReadingMinutes({
			body: review.reviewContent,
			whatILoved: review.whatILoved,
			whatCouldBeBetter: review.whatCouldBeBetter,
			perfectFor: review.perfectFor,
			favoriteQuotes: review.favoriteQuotes,
		}),
		dictionary.reviewReadingTime,
	);

	return (
		<article className="min-h-screen pb-20">
			{preview ? (
				<PreviewBanner locale={appLocale} slug={slug} dictionary={dictionary} />
			) : null}
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
					{!preview && (
						<Breadcrumbs
							items={trail.map((item, index) => ({
								label: item.name,
								// The last crumb is the page the reader is on, so it is
								// text rather than a link back to itself.
								href: index < trail.length - 1 ? item.path : undefined,
							}))}
							label={dictionary.breadcrumbLabel}
							className="mb-8"
						/>
					)}
					<div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12 items-start">
						{/* Book Cover */}
						<div className="mx-auto lg:mx-0 w-[240px] md:w-[300px] aspect-2/3 relative shadow-2xl rounded-lg rotate-2 hover:rotate-0 transition-transform duration-500 bg-background">
							{coverImage?.url && (
								<Image
									src={resolveMediaUrl(coverImage.url)}
									alt={coverImage.alt || review.title || ""}
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
								<div className="flex items-center justify-center lg:justify-start">
									<StarRating
										rating={review.rating}
										labelTemplate={dictionary.ratingLabel}
										size="lg"
									/>
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
								<Separator orientation="vertical" className="h-4" />
								<span className="inline-flex items-center gap-1">
									<Clock className="h-4 w-4" aria-hidden="true" />
									<span>{readingTimeLabel}</span>
								</span>
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
										title: review.title ?? "",
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
					{/* Two TOC instances share the slug list but keep independent
					    active state: the mobile disclosure above and the desktop
					    aside below are never visible together (one is always
					    `display:none`), so the active link converges on the next
					    scroll after a viewport change. */}
					<TableOfContents
						entries={tocEntries}
						title={dictionary.reviewOnThisPage}
						variant="mobile"
					/>
					{/* Review Content */}
					<div className="prose prose-lg prose-teal dark:prose-invert max-w-3xl font-serif">
						{review.reviewContent ? (
							<ReviewBody
								data={review.reviewContent}
								headingSlugs={bodyHeadingSlugs}
								dictionary={dictionary}
							/>
						) : null}
					</div>

					{/* Structured Sections */}
					<div className="grid gap-8 md:grid-cols-2">
						{review.whatILoved && (
							<div className="bg-positive/10 p-6 rounded-xl border border-positive/30">
								<SectionHeading
									slug={sectionSlugFor(dictionary.reviewWhatILoved)}
									dictionary={dictionary}
									className="font-serif text-xl font-bold mb-4 gap-2 text-positive"
								>
									{dictionary.reviewWhatILoved}
								</SectionHeading>
								<div className="prose prose-sm prose-teal dark:prose-invert">
									<RichText data={review.whatILoved} />
								</div>
							</div>
						)}

						{review.whatCouldBeBetter && (
							<div className="bg-warning/10 p-6 rounded-xl border border-warning/30">
								<SectionHeading
									slug={sectionSlugFor(dictionary.reviewWhatCouldBeBetter)}
									dictionary={dictionary}
									className="font-serif text-xl font-bold mb-4 gap-2 text-warning"
								>
									{dictionary.reviewWhatCouldBeBetter}
								</SectionHeading>
								<div className="prose prose-sm prose-teal dark:prose-invert">
									<RichText data={review.whatCouldBeBetter} />
								</div>
							</div>
						)}

						{review.perfectFor && (
							<div className="bg-info/10 p-6 rounded-xl border border-info/30 md:col-span-2">
								<SectionHeading
									slug={sectionSlugFor(dictionary.reviewPerfectFor)}
									dictionary={dictionary}
									className="font-serif text-xl font-bold mb-4 gap-2 text-info"
								>
									{dictionary.reviewPerfectFor}
								</SectionHeading>
								<div className="prose prose-sm prose-teal dark:prose-invert">
									<RichText data={review.perfectFor} />
								</div>
							</div>
						)}
					</div>

					{/* Favorite Quotes */}
					{review.favoriteQuotes && review.favoriteQuotes.length > 0 && (
						<div className="space-y-6">
							<SectionHeading
								slug={sectionSlugFor(dictionary.reviewFavoriteQuotes)}
								dictionary={dictionary}
								className="font-serif text-2xl font-bold border-b pb-2"
							>
								{dictionary.reviewFavoriteQuotes}
							</SectionHeading>
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
										<div className="mt-3 not-italic">
											<QuoteShareButtons
												quote={item.quote}
												bookTitle={review.title ?? ""}
												dictionary={dictionary}
											/>
										</div>
									</blockquote>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Sidebar */}
				<div className="space-y-8">
					<TableOfContents
						entries={tocEntries}
						title={dictionary.reviewOnThisPage}
						variant="desktop"
					/>
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
													// `color-mix` keeps the badge correct for any
													// colour format the mood colour may arrive in;
													// the old hex-append trick only worked for
													// 6-digit hex. Alpha weights match the old
													// suffixes: 0x20/255 ≈ 12.5%, 0x40/255 ≈ 25%.
													backgroundColor: `color-mix(in srgb, ${mood.color} 12.5%, transparent)`,
													color: mood.color,
													borderColor: `color-mix(in srgb, ${mood.color} 25%, transparent)`,
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

			{/* Adjacent reviews: the same order as the index, no wrap-around. */}
			{!preview && (adjacent.newer || adjacent.older) && (
				<nav
					aria-label={dictionary.reviewNavLabel}
					className="container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl [content-visibility:auto] [contain-intrinsic-size:auto_120px]"
				>
					<div className="grid gap-4 border-t pt-8 pb-12 sm:grid-cols-2">
						{adjacent.older ? (
							<Link
								href={`/${appLocale}/reviews/${adjacent.older.slug}`}
								className="group rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
							>
								<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
									{dictionary.reviewNavPrevious}
								</span>
								<span className="font-serif font-semibold group-hover:text-primary">
									{adjacent.older.title}
								</span>
							</Link>
						) : (
							<span aria-hidden="true" />
						)}
						{adjacent.newer ? (
							<Link
								href={`/${appLocale}/reviews/${adjacent.newer.slug}`}
								className="group rounded-xl border p-4 text-right transition-colors hover:border-primary/40 hover:bg-muted/30 sm:col-start-2"
							>
								<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
									{dictionary.reviewNavNext}
								</span>
								<span className="font-serif font-semibold group-hover:text-primary">
									{adjacent.newer.title}
								</span>
							</Link>
						) : null}
					</div>
				</nav>
			)}

			{/* Related Reviews */}
			<div className="container mx-auto px-6 md:px-12 lg:px-24 pb-12 max-w-7xl [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
				<RelatedReviews
					currentReviewId={review.id}
					genres={review.genres}
					tags={review.tags}
					moodTags={review.moodTags}
					relatedReviews={review.relatedReviews}
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
