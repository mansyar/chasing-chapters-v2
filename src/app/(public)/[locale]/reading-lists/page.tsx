import configPromise from "@payload-config";
import { Library } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPayload } from "payload";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/lib/i18n/dictionary";
import { normalizeLocale } from "@/lib/i18n/locale";
import { resolveMediaUrl } from "@/lib/media-url";
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
				{readingLists.map((list) => {
					const coverImage = list.coverImage as Media;

					return (
						<Link
							key={list.id}
							href={`/${appLocale}/reading-lists/${list.slug}`}
							className="group block h-full"
						>
							<Card className="h-full overflow-hidden border-none shadow-none bg-transparent hover:bg-muted/30 transition-colors">
								<div className="aspect-video relative overflow-hidden rounded-xl shadow-md group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
									{coverImage?.url ? (
										<Image
											src={resolveMediaUrl(coverImage.url)}
											alt={coverImage.alt || list.title || ""}
											fill
											className="object-cover transition-transform duration-500 group-hover:scale-105"
											sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
										/>
									) : (
										<div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
											{dictionary.readingListsNoImage}
										</div>
									)}
									<div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
								</div>
								<CardContent className="pt-6 px-2">
									<h3 className="font-serif text-2xl font-bold mb-2 group-hover:text-primary transition-colors">
										{list.title}
									</h3>
									<p className="text-muted-foreground line-clamp-2">
										{list.description}
									</p>
								</CardContent>
							</Card>
						</Link>
					);
				})}
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
