"use client";

import { Inter, Playfair_Display } from "next/font/google";
import { useEffect } from "react";
import { ErrorContent } from "@/components/error-content";
import {
	reportErrorToSentry,
	resolveBrowserErrorLocale,
} from "@/lib/error-locale";

const inter = Inter({
	variable: "--font-sans",
	subsets: ["latin"],
});

const playfair = Playfair_Display({
	variable: "--font-serif",
	subsets: ["latin"],
});

interface GlobalErrorProps {
	error: Error & { digest?: string };
	reset: () => void;
}

/**
 * Root boundary: catches what the segment boundary cannot, including a
 * failing root layout — so it owns its own document shell like `not-found`
 * does, and resolves its locale without any layout help: remembered cookie
 * first (`FR-1`), then the browser's accepted languages, then English.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
	const locale = resolveBrowserErrorLocale();

	useEffect(() => {
		reportErrorToSentry(error, { route: "global", locale });
	}, [error, locale]);

	return (
		<html lang={locale} suppressHydrationWarning>
			<body className={`${inter.variable} ${playfair.variable} antialiased`}>
				<main className="flex min-h-screen flex-col items-center justify-center">
					<ErrorContent
						locale={locale}
						homeHref={`/${locale}`}
						onRetry={reset}
					/>
				</main>
			</body>
		</html>
	);
}
