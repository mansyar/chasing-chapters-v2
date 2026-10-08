/**
 * Sort options for the /reviews browse page.
 *
 * Pure helpers so the param parsing and Payload sort-string mapping are
 * unit-testable; the page handler consumes both and stays SSR-only.
 */

export const SORT_OPTIONS = ["recent", "rating", "title"] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOption = "recent";

/**
 * Parse a `?sort=` search param into a validated sort option.
 * Any unknown, case-mismatched or missing value falls back to the default.
 */
export function parseSortParam(value: string | null | undefined): SortOption {
	return SORT_OPTIONS.includes(value as SortOption)
		? (value as SortOption)
		: DEFAULT_SORT;
}

/**
 * Map a sort option to a Payload sort string.
 * - recent: newest first
 * - rating: highest rating first, newest first on ties
 * - title: alphabetical ascending (ordering follows the database collation)
 */
export function sortToPayloadSort(sort: SortOption): string {
	switch (sort) {
		case "rating":
			return "-rating,-publishDate";
		case "title":
			return "title";
		default:
			return "-publishDate";
	}
}
