import configPromise from "@payload-config";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { ReviewCard } from "@/components/ReviewCard";
import { Breadcrumbs } from "@/components/reviews/Breadcrumbs";
import { ShareButton } from "@/components/ShareButton";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import { normalizeLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { resolveMediaUrl } from "@/lib/media-url";
import { isPubliclyVisible } from "@/lib/publish-visibility";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo/structured-data";
import type { Media, Review } from "@/payload-types";

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
	const dictionary = getDictionary(appLocale);
	const payload = await getPayload({ config: configPromise });

	const { docs: lists } = await payload.find({
		collection: "reading-lists",
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

	const list = lists[0];

	if (!list) {
		return {
			title: dictionary.metaReadingListNotFound,
		};
	}

	return buildPageMetadata({
		locale: appLocale,
		path: `/reading-lists/${list.slug}`,
		title: list.title ?? "",
		description:
			list.description ||
			formatMessage(dictionary.metaReadingListDescription, {
				title: list.title ?? "",
			}),
	});
}

export async function generateStaticParams() {
	const payload = await getPayload({ config: configPromise });
	const { docs } = await payload.find({
		collection: "reading-lists",
		where: {
			_status: {
				equals: "published",
			},
		},
		limit: 20, // Pre-build top 20 lists
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

export default async function ReadingListDetailPage({ params }: PageProps) {
	const { locale, slug } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);
	const payload = await getPayload({ config: configPromise });

	const { docs: lists } = await payload.find({
		collection: "reading-lists",
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
		locale: appLocale,
	});

	const list = lists[0];

	if (!list) {
		notFound();
	}

	const coverImage = list.coverImage as Media;
	// A reading list is a public page, so it renders only the reviews that are
	// public at this moment: a scheduled review in the relationship must not
	// appear as a card pointing at a URL that 404s (`FR-5`). Filtering before
	// the empty-state check keeps the grid, the count and the "no reviews"
	// message agreeing.
	const reviews = ((list.reviews as Review[]) || []).filter((review) =>
		isPubliclyVisible(review, new Date()),
	);

	// One trail, two renderings — the structured data and the visible crumbs are
	// built from the same list so they cannot drift apart.
	const trail = [
		{ name: dictionary.breadcrumbHome, path: `/${appLocale}` },
		{
			name: dictionary.navReadingLists,
			path: `/${appLocale}/reading-lists`,
		},
		{
			name: list.title ?? "",
			path: `/${appLocale}/reading-lists/${list.slug}`,
		},
	];

	const breadcrumbJsonLd = generateBreadcrumbSchema(
		trail.map((item) => ({ name: item.name, url: `${SITE_URL}${item.path}` })),
		appLocale,
	);

	return (
		<div className="min-h-screen pb-20">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
			/>
			{/* Hero Header */}
			<div className="relative bg-muted/30 py-20 md:py-32 overflow-hidden">
				<div className="container px-4 md:px-6 relative z-10 text-center max-w-3xl mx-auto">
					<Breadcrumbs
						items={trail.map((item, index) => ({
							label: item.name,
							href: index < trail.length - 1 ? item.path : undefined,
						}))}
						label={dictionary.breadcrumbLabel}
						className="mb-8 flex justify-center"
					/>
					<h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight mb-6">
						{list.title}
					</h1>
					<p className="text-xl text-muted-foreground leading-relaxed mb-8">
						{list.description}
					</p>
					<div className="flex justify-center">
						<ShareButton
							title={formatMessage(dictionary.readingListShareTitle, {
								title: list.title ?? "",
							})}
							dictionary={dictionary}
						/>
					</div>
				</div>

				{/* Background Blur Effect */}
				{coverImage?.url && (
					<div className="absolute inset-0 z-0 opacity-10 blur-3xl scale-110">
						<Image
							src={resolveMediaUrl(coverImage.url)}
							alt=""
							fill
							className="object-cover"
							placeholder={coverImage.blurDataURL ? "blur" : "empty"}
							blurDataURL={coverImage.blurDataURL || undefined}
						/>
					</div>
				)}
			</div>

			{/* Reviews Grid */}
			<div className="container px-4 md:px-6 py-16">
				{reviews.length > 0 ? (
					<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{reviews.map((review, index) => (
							// The first two cards sit above the fold, so their covers
							// are LCP candidates and must not stay lazy.
							<ReviewCard
								key={review.id}
								review={review}
								locale={appLocale}
								priority={index < 2}
								ratingLabel={dictionary.ratingLabel}
							/>
						))}
					</div>
				) : (
					<div className="text-center py-12 text-muted-foreground">
						<p>{dictionary.readingListNoReviews}</p>
					</div>
				)}
			</div>
		</div>
	);
}
