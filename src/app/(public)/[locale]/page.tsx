import configPromise from "@payload-config";
import { ArrowRight, BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getPayload } from "payload";
import { FeaturedHero } from "@/components/FeaturedHero";
import { GenreMarquee } from "@/components/GenreMarquee";
import { ReadingListCard } from "@/components/ReadingListCard";
import { ReviewCard } from "@/components/ReviewCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/lib/i18n/dictionary";
import { normalizeLocale } from "@/lib/i18n/locale";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";
import { buildPageMetadata } from "@/lib/seo/metadata";

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);

	return buildPageMetadata({
		locale: appLocale,
		path: "/",
		title: dictionary.metaHomeTitle,
		description: dictionary.metaHomeDescription,
	});
}

export default async function Homepage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);
	const payload = await getPayload({ config: configPromise });
	// The visibility rule is built once per render, so every review read on the
	// page agrees on the instant it is judging the schedule against.
	const visibleNow = publishedAndVisibleWhere(new Date());

	// Fetch data in parallel for better performance
	const [
		{ docs: featuredReviews },
		{ docs: latestReviews },
		{ docs: genres },
		{ docs: readingLists },
	] = await Promise.all([
		payload.find({
			collection: "reviews",
			where: {
				and: [visibleNow, { featured: { equals: true } }],
			},
			limit: 5,
			depth: 2,
			locale: appLocale,
		}),
		payload.find({
			collection: "reviews",
			where: visibleNow,
			sort: "-publishDate",
			limit: 6,
			depth: 1,
			locale: appLocale,
		}),
		payload.find({
			collection: "genres",
			limit: 20,
			locale: appLocale,
		}),
		payload.find({
			collection: "reading-lists",
			where: {
				_status: { equals: "published" },
				featured: { equals: true },
			},
			sort: "-createdAt",
			limit: 4,
			depth: 1,
			locale: appLocale,
		}),
	]);

	return (
		<div className="flex flex-col min-h-screen">
			{featuredReviews.length > 0 && (
				<FeaturedHero
					reviews={featuredReviews}
					dictionary={dictionary}
					locale={appLocale}
				/>
			)}
			<GenreMarquee genres={genres} locale={appLocale} />

			{/* Reading Lists Showcase */}
			{readingLists.length > 0 && (
				<section className="py-16 container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
					<div className="flex items-center justify-between mb-8">
						<h2 className="font-serif text-3xl font-bold tracking-tight">
							{dictionary.homeCuratedReadingLists}
						</h2>
						<Button variant="ghost" asChild>
							<Link href={`/${appLocale}/reading-lists`}>
								{dictionary.homeViewAll} <ArrowRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
					</div>
					<div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
						{readingLists.map((list, index) => (
							<ReadingListCard
								key={list.id}
								readingList={list}
								locale={appLocale}
								priority={index < 2}
							/>
						))}
					</div>
				</section>
			)}

			<section className="py-16 container mx-auto px-6 md:px-12 lg:px-24 max-w-7xl">
				<div className="flex items-center justify-between mb-8">
					<h2 className="font-serif text-3xl font-bold tracking-tight">
						{dictionary.homeLatestReviews}
					</h2>
					<Button variant="ghost" asChild>
						<Link href={`/${appLocale}/reviews`}>
							{dictionary.homeViewAll} <ArrowRight className="ml-2 h-4 w-4" />
						</Link>
					</Button>
				</div>

				{latestReviews.length > 0 ? (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{latestReviews.map((review, index) => (
							<ReviewCard
								key={review.id}
								review={review}
								locale={appLocale}
								priority={index < 2}
							/>
						))}
					</div>
				) : (
					<EmptyState
						icon={BookOpen}
						title={dictionary.homeNoReviewsTitle}
						description={dictionary.homeNoReviewsDescription}
						className="py-12"
					/>
				)}
			</section>
		</div>
	);
}
