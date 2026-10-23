import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UmamiScript } from "@/components/analytics/UmamiScript";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { getDictionary } from "@/lib/i18n/dictionary";
import {
	hasLocale,
	normalizeLocale,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";
import { buildLocaleShellMetadata } from "@/lib/seo/metadata";
import { generateWebSiteSchema } from "@/lib/seo/structured-data";

const inter = Inter({
	variable: "--font-sans",
	subsets: ["latin"],
	display: "swap",
	adjustFontFallback: true,
});

const playfair = Playfair_Display({
	variable: "--font-serif",
	subsets: ["latin"],
	display: "swap",
	adjustFontFallback: true,
});

function getUmamiOrigin(): string | null {
	const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
	if (!scriptUrl) return null;
	try {
		return new URL(scriptUrl).origin;
	} catch {
		// Malformed env value — skip the resource hints rather than crash.
		return null;
	}
}

const umamiOrigin = getUmamiOrigin();

/** Pre-renders the shell once per locale. */
export function generateStaticParams() {
	return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * The shell's own metadata: which locale it advertises, and which feed.
 *
 * A page's metadata replaces the Open Graph block wholesale, so the locale
 * values here only survive on pages that set none (the 404s). The feed link
 * is per locale and every page repeats it for the same reason.
 */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;

	if (!hasLocale(locale)) {
		return {};
	}

	return buildLocaleShellMetadata(normalizeLocale(locale));
}

/**
 * The public document shell.
 *
 * It lives under the locale segment so `<html lang>` can follow the route; the
 * route group above it and the root layout stay pass-throughs. An unsupported
 * locale segment 404s here rather than falling back to English, so `/fr/...`
 * never renders an English page under a French URL (`FR-11`).
 */
export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;

	if (!hasLocale(locale)) {
		notFound();
	}

	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);
	const websiteJsonLd = generateWebSiteSchema(appLocale);

	return (
		<html lang={appLocale} suppressHydrationWarning>
			<head>
				{umamiOrigin && (
					<>
						<link rel="preconnect" href={umamiOrigin} crossOrigin="anonymous" />
						<link rel="dns-prefetch" href={umamiOrigin} />
					</>
				)}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
				/>
			</head>
			<body className={`${inter.variable} ${playfair.variable} antialiased`}>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<a
						href="#main-content"
						className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-1 focus:ring-border"
					>
						{dictionary.skipToContent}
					</a>
					<div className="flex min-h-screen flex-col">
						<Suspense
							fallback={<div className="h-16 border-b bg-background/80" />}
						>
							<Navbar dictionary={dictionary} locale={appLocale} />
						</Suspense>
						<main id="main-content" tabIndex={-1} className="flex-1">
							{children}
						</main>
						<Footer dictionary={dictionary} locale={appLocale} />
					</div>
					<Toaster />
				</ThemeProvider>
				<UmamiScript />
			</body>
		</html>
	);
}
