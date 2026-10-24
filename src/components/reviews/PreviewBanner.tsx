import type { Dictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { otherLocale, reviewPath } from "@/lib/preview";

interface PreviewBannerProps {
	/** The locale the page is being previewed in. */
	locale: Locale;
	/** The review's slug, which is the same in both locales. */
	slug: string;
	dictionary: Dictionary;
}

/**
 * The draft-preview banner (`FR-3`).
 *
 * It states that this is a preview, offers the same review in the other locale,
 * and offers the exit. Following the other-language link stays in preview mode
 * because the bypass cookie is site-wide, so the switch does not interrupt the
 * author's reading of the translation.
 *
 * Two details are deliberate:
 *
 * - The locale switch is a plain anchor rather than `next/link`, so Next never
 *   prefetches and caches a preview render of the other locale.
 * - The exit is a `POST` form to the exit route, so it works before hydration
 *   and a crawler that follows links can never end an author's preview by
 *   issuing a `GET`.
 *
 * `role="status"` announces the banner when the page loads, which is how a
 * screen-reader user learns that what they are reading is not public.
 */
export function PreviewBanner({
	locale,
	slug,
	dictionary,
}: PreviewBannerProps) {
	const target = otherLocale(locale);
	const targetLanguage =
		target === "en"
			? dictionary.languageEnglish
			: dictionary.languageIndonesian;

	return (
		<aside
			role="status"
			aria-label={dictionary.previewLabel}
			className="border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
		>
			<div className="container mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm md:px-12 lg:px-24">
				<span className="inline-flex items-center rounded-full bg-amber-200 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-900 dark:text-amber-50">
					{dictionary.previewLabel}
				</span>
				<p>{dictionary.previewDescription}</p>
				<a
					href={reviewPath(slug, target)}
					className="underline underline-offset-4 hover:no-underline"
				>
					{formatMessage(dictionary.previewOtherLocale, {
						language: targetLanguage,
					})}
				</a>
				<form action="/api/preview/exit" method="post" className="ml-auto">
					<input
						type="hidden"
						name="returnTo"
						value={reviewPath(slug, locale)}
					/>
					<button
						type="submit"
						className="rounded-md border border-amber-400 px-3 py-1 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
					>
						{dictionary.previewExit}
					</button>
				</form>
			</div>
		</aside>
	);
}
