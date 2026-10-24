"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/dictionary";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	type Locale,
	localeSwitchHref,
	pathLocale,
} from "@/lib/i18n/locale";

/** One year, in seconds — the lifetime the preference cookie is given. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const LOCALE_LABELS: Record<Locale, string> = {
	en: "EN",
	id: "ID",
};

interface LanguageToggleProps {
	/** Server-resolved interface copy. */
	dictionary: Dictionary;
}

/**
 * The language control (`FR-3`, `NFR-1`).
 *
 * It reports the current locale and switches to the other one, keeping the
 * slug, the path depth and the query string. The choice is written to the
 * preference cookie *here and only here* (`FR-2`): rendering a page never
 * writes it, so following a shared `/id/...` link leaves the reader's stored
 * preference alone.
 */
export function LanguageToggle({ dictionary }: LanguageToggleProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const currentLocale = pathLocale(pathname) ?? DEFAULT_LOCALE;

	const selectLocale = (locale: Locale) => {
		document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;

		if (locale !== currentLocale) {
			router.push(localeSwitchHref(pathname, locale, searchParams.toString()));
		}
	};

	return (
		<div
			role="group"
			aria-label={dictionary.languageGroup}
			className="inline-flex items-center rounded-md border bg-background text-sm"
		>
			{(Object.keys(LOCALE_LABELS) as Locale[]).map((locale, index) => {
				const isActive = locale === currentLocale;

				// The active pill keeps the brand fill, but takes the label colour
				// that actually contrasts with it (`NFR-1`, WCAG 2.2 AA at 4.5:1 for
				// this size): white on the light theme's `--primary` measures 3.66:1,
				// while the near-black `--foreground` on it measures 4.95:1. The dark
				// theme's `--foreground` would be too light on its teal (2.3:1), so
				// it keeps `--primary-foreground`, which measures 7.77:1 there.
				return (
					<span key={locale} className="inline-flex items-center">
						{index > 0 && <span className="w-px h-6 bg-border" />}
						<button
							type="button"
							lang={locale}
							title={
								locale === "en"
									? dictionary.languageEnglish
									: dictionary.languageIndonesian
							}
							aria-pressed={isActive}
							onClick={() => selectLocale(locale)}
							className={
								isActive
									? "px-3 py-1.5 rounded-sm bg-primary text-foreground dark:text-primary-foreground font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
									: "px-3 py-1.5 rounded-sm hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							}
						>
							{LOCALE_LABELS[locale]}
						</button>
					</span>
				);
			})}
		</div>
	);
}
