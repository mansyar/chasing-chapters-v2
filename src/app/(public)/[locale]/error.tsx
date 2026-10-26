"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect } from "react";
import { ErrorContent } from "@/components/error-content";
import {
	reportErrorToSentry,
	resolveBrowserErrorLocale,
} from "@/lib/error-locale";
import { hasLocale } from "@/lib/i18n/locale";

interface LocaleErrorProps {
	error: Error & { digest?: string };
	reset: () => void;
}

/**
 * Segment boundary: catches render/action failures below `[locale]`.
 *
 * The failing page is gone but the locale layout above still stands, so the
 * locale in the URL wins when it is usable. Otherwise this falls back the
 * request-time way the middleware resolves it — remembered cookie first
 * (`FR-3`), then the browser's accepted languages, then English — and always
 * offers a retry plus a way home.
 */
export default function LocaleError({ error, reset }: LocaleErrorProps) {
	const params = useParams();
	const pathname = usePathname();
	const segmentLocale = params?.locale;
	const locale = hasLocale(segmentLocale)
		? segmentLocale
		: resolveBrowserErrorLocale();

	useEffect(() => {
		reportErrorToSentry(error, { route: pathname ?? "unknown", locale });
	}, [error, pathname, locale]);

	return (
		<main className="flex flex-1 flex-col items-center justify-center">
			<ErrorContent locale={locale} homeHref={`/${locale}`} onRetry={reset} />
		</main>
	);
}
