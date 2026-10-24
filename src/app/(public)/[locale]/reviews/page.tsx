import configPromise from "@payload-config";
import { BookOpen, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Where } from "payload";
import { getPayload } from "payload";

import { GenreSelect } from "@/components/GenreSelect";
import { ReviewCard } from "@/components/ReviewCard";
import { SortSelect } from "@/components/SortSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import { normalizeLocale } from "@/lib/i18n/locale";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";
import { parseSortParam, sortToPayloadSort } from "@/lib/reviews-sort";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { generateItemListSchema, SITE_URL } from "@/lib/seo/structured-data";
import type { Media } from "@/payload-types";

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);

	return buildPageMetadata({
		locale: appLocale,
		path: "/reviews",
		title: dictionary.metaBrowseTitle,
		description: dictionary.metaBrowseDescription,
	});
}

// Enable ISR with 60 second revalidation for better caching
export const revalidate = 60;

interface PageProps {
	params: Promise<{
		locale: string;
	}>;
	searchParams: Promise<{
		q?: string;
		genre?: string;
		tag?: string;
		page?: string;
		sort?: string;
	}>;
}

export default async function BrowsePage({ params, searchParams }: PageProps) {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const { q, genre, tag, page, sort } = await searchParams;
	const currentPage = Number(page) || 1;
	const currentSort = parseSortParam(sort);
	const limit = 9;
	const payload = await getPayload({ config: configPromise });
	const dictionary = getDictionary(appLocale);

	const browsePath = `/${appLocale}/reviews`;

	// Every constraint joins the shared visibility rule through `and`, so a
	// scheduled review cannot slip in through the search, genre or tag branch.
	const conditions: Where[] = [publishedAndVisibleWhere(new Date())];

	if (q) {
		conditions.push({
			or: [
				{
					title: {
						like: q,
					},
				},
				{
					bookAuthor: {
						like: q,
					},
				},
			],
		});
	}

	if (genre) {
		conditions.push({
			"genres.slug": {
				equals: genre,
			},
		});
	}

	if (tag) {
		conditions.push({
			"tags.slug": {
				equals: tag,
			},
		});
	}

	const where: Where = { and: conditions };

	const { docs: reviews, totalPages } = await payload.find({
		collection: "reviews",
		where,
		sort: sortToPayloadSort(currentSort),
		depth: 1,
		limit,
		page: currentPage,
		locale: appLocale,
	});

	const { docs: genres } = await payload.find({
		collection: "genres",
		sort: "name",
		limit: 100,
		locale: appLocale,
	});

	const { docs: tags } = await payload.find({
		collection: "tags",
		sort: "name",
		limit: 100,
		locale: appLocale,
	});

	async function searchAction(formData: FormData) {
		"use server";
		const query = formData.get("q");
		if (query) {
			redirect(`${browsePath}?q=${query}`);
		} else {
			redirect(browsePath);
		}
	}

	const itemListJsonLd = generateItemListSchema(
		reviews.map((review) => ({
			name: review.title ?? "",
			url: `${SITE_URL}/${appLocale}/reviews/${review.slug}`,
			image: (review.coverImage as Media)?.url || undefined,
		})),
		dictionary.browseItemListName,
		appLocale,
	);

	return (
		<div className="container mx-auto px-6 md:px-12 lg:px-24 py-12 max-w-7xl">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
			/>
			<div className="flex flex-col md:flex-row gap-12">
				{/* Sidebar */}
				<aside className="w-full md:w-[240px] space-y-8 shrink-0">
					<div>
						<h3 className="font-serif text-lg font-bold mb-4">
							{dictionary.browseSearch}
						</h3>
						<form action={searchAction} className="relative">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								name="q"
								type="search"
								placeholder={dictionary.browseSearchPlaceholder}
								className="pl-9"
								defaultValue={q}
							/>
						</form>
					</div>

					<div>
						<h3 className="font-serif text-lg font-bold mb-4">
							{dictionary.browseGenres}
						</h3>
						{/* Mobile Dropdown */}
						<div className="md:hidden">
							<GenreSelect
								genres={genres}
								currentGenre={genre}
								dictionary={dictionary}
								locale={appLocale}
							/>
						</div>
						{/* Desktop List */}
						<div className="hidden md:flex flex-col gap-2">
							<Link
								href={browsePath}
								className={`text-sm hover:text-primary transition-colors ${
									!genre ? "font-bold text-primary" : "text-muted-foreground"
								}`}
							>
								{dictionary.browseAllGenres}
							</Link>
							{genres.map((g) => (
								<Link
									key={g.id}
									href={`${browsePath}?genre=${g.slug}`}
									className={`text-sm hover:text-primary transition-colors ${
										genre === g.slug
											? "font-bold text-primary"
											: "text-muted-foreground"
									}`}
								>
									{g.name}
								</Link>
							))}
						</div>
					</div>

					<div>
						<h3 className="font-serif text-lg font-bold mb-4">
							{dictionary.browseTags}
						</h3>
						<div className="flex flex-wrap gap-2">
							{tags.map((t) => (
								<Link key={t.id} href={`${browsePath}?tag=${t.slug}`}>
									<Badge
										variant={tag === t.slug ? "default" : "outline"}
										className="hover:bg-primary hover:text-primary-foreground transition-colors"
									>
										{t.name}
									</Badge>
								</Link>
							))}
						</div>
					</div>
				</aside>

				{/* Main Content */}
				<div className="flex-1 space-y-6">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-4 min-w-0">
							<h1 className="font-serif text-3xl font-bold">
								{q
									? formatMessage(dictionary.browseSearchResultsFor, {
											query: q,
										})
									: genre
										? formatMessage(dictionary.browseGenreHeading, {
												genre: genres.find((g) => g.slug === genre)?.name ?? "",
											})
										: tag
											? formatMessage(dictionary.browseTagHeading, {
													tag: tags.find((t) => t.slug === tag)?.name ?? "",
												})
											: dictionary.browseAllReviews}
							</h1>
							{(q || genre || tag) && (
								<Button variant="ghost" size="sm" asChild>
									<Link href={browsePath}>
										<X className="mr-2 h-4 w-4" />
										{dictionary.browseClearFilters}
									</Link>
								</Button>
							)}
						</div>
						<SortSelect currentSort={currentSort} dictionary={dictionary} />
					</div>
					<Separator />

					{reviews.length > 0 ? (
						<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{reviews.map((review, index) => (
								// The first two cards sit above the fold, so their covers
								// are LCP candidates and must not stay lazy.
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
							title={dictionary.browseNoResultsTitle}
							description={dictionary.browseNoResultsDescription}
							action={
								<Button variant="outline" asChild>
									<Link href={browsePath}>
										{dictionary.browseClearAllFilters}
									</Link>
								</Button>
							}
						/>
					)}
				</div>
			</div>

			{totalPages > 1 && (
				<div className="mt-12">
					<Pagination label={dictionary.paginationLabel}>
						<PaginationContent>
							{currentPage > 1 && (
								<PaginationItem>
									<PaginationPrevious
										label={dictionary.paginationPreviousLabel}
										text={dictionary.paginationPrevious}
										href={`${browsePath}?${new URLSearchParams({
											...(q && { q }),
											...(genre && { genre }),
											...(tag && { tag }),
											...(currentSort !== "recent" && { sort: currentSort }),
											page: (currentPage - 1).toString(),
										}).toString()}`}
									/>
								</PaginationItem>
							)}

							{/* First Page */}
							{currentPage > 3 && (
								<>
									<PaginationItem>
										<PaginationLink
											href={`${browsePath}?${new URLSearchParams({
												...(q && { q }),
												...(genre && { genre }),
												...(tag && { tag }),
												...(currentSort !== "recent" && { sort: currentSort }),
												page: "1",
											}).toString()}`}
										>
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
								const pages = [];
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
												href={`${browsePath}?${new URLSearchParams({
													...(q && { q }),
													...(genre && { genre }),
													...(tag && { tag }),
													...(currentSort !== "recent" && {
														sort: currentSort,
													}),
													page: p.toString(),
												}).toString()}`}
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
												href={`${browsePath}?${new URLSearchParams({
													...(q && { q }),
													...(genre && { genre }),
													...(tag && { tag }),
													...(currentSort !== "recent" && {
														sort: currentSort,
													}),
													page: p.toString(),
												}).toString()}`}
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
										href={`${browsePath}?${new URLSearchParams({
											...(q && { q }),
											...(genre && { genre }),
											...(tag && { tag }),
											...(currentSort !== "recent" && { sort: currentSort }),
											page: (currentPage + 1).toString(),
										}).toString()}`}
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
