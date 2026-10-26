import configPromise from "@payload-config";
import { Library } from "lucide-react";
import type { Metadata } from "next";
import { getPayload } from "payload";
import { ReadingListCard } from "@/components/ReadingListCard";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/lib/i18n/dictionary";
import { normalizeLocale } from "@/lib/i18n/locale";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { generateItemListSchema, SITE_URL } from "@/lib/seo/structured-data";
import type { Media } from "@/payload-types";

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
		path: "/reading-lists",
		title: dictionary.readingListsTitle,
		description: dictionary.readingListsDescription,
	});
}

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

export default async function ReadingListsPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);
	const payload = await getPayload({ config: configPromise });

	const { docs: readingLists } = await payload.find({
		collection: "reading-lists",
		where: {
			_status: {
				equals: "published",
			},
		},
		sort: "-createdAt",
		locale: appLocale,
	});

	const itemListJsonLd = generateItemListSchema(
		readingLists.map((list) => ({
			name: list.title ?? "",
			url: `${SITE_URL}/${appLocale}/reading-lists/${list.slug}`,
			image: (list.coverImage as Media)?.url || undefined,
		})),
		dictionary.readingListsTitle,
		appLocale,
	);

	return (
		<div className="container mx-auto px-4 md:px-6 py-12">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
			/>
			<div className="space-y-4 mb-12 text-center">
				<h1 className="font-serif text-4xl font-bold tracking-tight">
					{dictionary.readingListsTitle}
				</h1>
				<p className="text-muted-foreground max-w-[600px] mx-auto">
					{dictionary.readingListsDescription}
				</p>
			</div>

			<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
				{readingLists.map((list, index) => (
					// The first two cards sit above the fold, so their covers are
					// LCP candidates and must not stay lazy.
					<ReadingListCard
						key={list.id}
						readingList={list}
						locale={appLocale}
						priority={index < 2}
					/>
				))}
			</div>

			{readingLists.length === 0 && (
				<EmptyState
					icon={Library}
					title={dictionary.readingListsEmptyTitle}
					description={dictionary.readingListsEmptyDescription}
				/>
			)}
		</div>
	);
}
