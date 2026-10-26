import configPromise from "@payload-config";
import { Library } from "lucide-react";
import type { Metadata } from "next";
import { getPayload } from "payload";
import { ReadingListCard } from "@/components/ReadingListCard";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
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
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ page?: string }>;
}) {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const { page } = await searchParams;
	const currentPage = Number(page) || 1;
	const limit = 9;
	const dictionary = getDictionary(appLocale);
	const payload = await getPayload({ config: configPromise });

	const listPath = `/${appLocale}/reading-lists`;

	const { docs: readingLists, totalPages } = await payload.find({
		collection: "reading-lists",
		where: {
			_status: {
				equals: "published",
			},
		},
		sort: "-createdAt",
		limit,
		page: currentPage,
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
						// One column below `sm`, two to `lg`, three above: the card
						// covers the viewport width at the narrowest breakpoint.
						sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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

			{totalPages > 1 && (
				<div className="mt-12">
					<Pagination label={dictionary.paginationLabel}>
						<PaginationContent>
							{currentPage > 1 && (
								<PaginationItem>
									<PaginationPrevious
										label={dictionary.paginationPreviousLabel}
										text={dictionary.paginationPrevious}
										href={`${listPath}?page=${currentPage - 1}`}
									/>
								</PaginationItem>
							)}

							{/* First Page */}
							{currentPage > 3 && (
								<>
									<PaginationItem>
										<PaginationLink href={`${listPath}?page=1`}>
											1
										</PaginationLink>
									</PaginationItem>
									<PaginationItem>
										<PaginationEllipsis
											label={dictionary.paginationMorePages}
										/>
									</PaginationItem>
								</>
							)}

							{/* Page Numbers */}
							{(() => {
								const pages: Array<number | "..."> = [];
								const showFirst = currentPage > 2;
								const showLast = currentPage < totalPages - 1;

								if (showFirst) {
									pages.push(1);
									if (currentPage > 3) pages.push("...");
								}

								const start = Math.max(1, currentPage - 1);
								const end = Math.min(totalPages, currentPage + 1);

								for (let i = start; i <= end; i++) {
									if (showFirst && i === 1) continue; // already pushed
									if (showLast && i === totalPages) continue; // will push later
									pages.push(i);
								}

								if (showLast) {
									if (currentPage < totalPages - 2) pages.push("...");
									pages.push(totalPages);
								}

								// Simplified approach if total pages is small
								if (totalPages <= 5) {
									return Array.from(
										{ length: totalPages },
										(_, i) => i + 1,
									).map((p) => (
										<PaginationItem key={p}>
											<PaginationLink
												isActive={p === currentPage}
												href={`${listPath}?page=${p}`}
											>
												{p}
											</PaginationLink>
										</PaginationItem>
									));
								}

								return pages.map((p, i) => (
									<PaginationItem key={i}>
										{p === "..." ? (
											<PaginationEllipsis
												label={dictionary.paginationMorePages}
											/>
										) : (
											<PaginationLink
												isActive={p === currentPage}
												href={`${listPath}?page=${p}`}
											>
												{p}
											</PaginationLink>
										)}
									</PaginationItem>
								));
							})()}

							{currentPage < totalPages && (
								<PaginationItem>
									<PaginationNext
										label={dictionary.paginationNextLabel}
										text={dictionary.paginationNext}
										href={`${listPath}?page=${currentPage + 1}`}
									/>
								</PaginationItem>
							)}
						</PaginationContent>
					</Pagination>
				</div>
			)}
		</div>
	);
}
