import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { Locale } from "./i18n/locale";

/**
 * Locales the app supports for user-facing date rendering.
 *
 * The same set the site is served in; the name stays for the components that
 * take it as a prop.
 */
export type AppLocale = Locale;

function toDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date as a localized date ("January 15, 2026" / "15 Januari 2026").
 * `opts.month` selects long ("January") or short ("Jan") month rendering.
 * Returns an empty string for invalid or missing dates.
 */
export function formatDate(
	date: string | Date | null | undefined,
	locale: AppLocale = "en",
	opts?: { month?: "long" | "short" },
): string {
	const parsed = toDate(date);
	if (!parsed) return "";
	return parsed.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
		year: "numeric",
		month: opts?.month ?? "long",
		day: "numeric",
	});
}

/**
 * Format a date as a relative time ("about 2 hours ago" / "sekitar 2 jam yang lalu").
 * Returns an empty string for invalid or missing dates.
 */
export function formatRelativeTime(
	date: string | Date | null | undefined,
	locale: AppLocale = "en",
): string {
	const parsed = toDate(date);
	if (!parsed) return "";
	return formatDistanceToNow(parsed, {
		addSuffix: true,
		locale: locale === "id" ? idLocale : undefined,
	});
}
