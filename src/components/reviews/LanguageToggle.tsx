"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Locale, localizePath, pathLocale } from "@/lib/i18n/locale";

/**
 * Switches the page to the other locale by swapping the locale segment.
 *
 * The locale lives in the path, so the rest of the URL — slug, depth and the
 * query string — is carried over untouched (`FR-3`). The remembered
 * preference and the accessible state of the control arrive with the interface
 * dictionary.
 */
export function LanguageToggle() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const currentLocale = pathLocale(pathname) ?? "en";

	const setLocale = (locale: Locale) => {
		const query = searchParams.toString();
		const target = localizePath(pathname, locale);

		router.push(query ? `${target}?${query}` : target);
	};

	return (
		<div className="inline-flex items-center rounded-md border bg-background text-sm">
			<button
				onClick={() => setLocale("en")}
				className={`px-3 py-1.5 rounded-l-md transition-colors ${
					currentLocale === "en"
						? "bg-primary text-primary-foreground font-medium"
						: "hover:bg-muted"
				}`}
			>
				EN
			</button>
			<div className="w-px h-6 bg-border" />
			<button
				onClick={() => setLocale("id")}
				className={`px-3 py-1.5 rounded-r-md transition-colors ${
					currentLocale === "id"
						? "bg-primary text-primary-foreground font-medium"
						: "hover:bg-muted"
				}`}
			>
				ID
			</button>
		</div>
	);
}
