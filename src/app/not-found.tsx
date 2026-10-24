import { Inter, Playfair_Display } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

const inter = Inter({
	variable: "--font-sans",
	subsets: ["latin"],
});

const playfair = Playfair_Display({
	variable: "--font-serif",
	subsets: ["latin"],
});

/**
 * Root 404.
 *
 * `not-found.tsx` components receive no props (Next `not-found.md`, Reference →
 * Props), so a segment-level `[locale]/not-found.tsx` could not read the locale
 * from `params` either: only a request-time source such as the locale cookie
 * could tell this page which language to speak. Reading that cookie here made
 * every `[locale]` route render on demand instead of at build time — a root
 * `not-found` boundary is part of each route's tree — so the trade was refused:
 * the 404 stays English and the pre-rendered pages stay pre-rendered (FR-12,
 * NFR-2). The copy still comes from the dictionary, so it moves with the rest
 * of the interface the moment a locale signal can reach this boundary.
 */
export default function NotFound() {
	const dictionary = getDictionary(DEFAULT_LOCALE);

	return (
		<html lang={DEFAULT_LOCALE} suppressHydrationWarning>
			<body className={`${inter.variable} ${playfair.variable} antialiased`}>
				<div className="flex min-h-screen flex-col">
					<Suspense
						fallback={<div className="h-16 border-b bg-background/80" />}
					>
						<Navbar dictionary={dictionary} locale={DEFAULT_LOCALE} />
					</Suspense>
					<main className="flex flex-1 flex-col items-center justify-center text-center p-6">
						<h1 className="font-serif text-6xl md:text-8xl font-medium mb-4">
							404
						</h1>
						<h2 className="font-serif text-2xl md:text-3xl mb-6">
							{dictionary.notFoundChapterMissing}
						</h2>
						<p className="text-muted-foreground text-lg max-w-md mb-8">
							{dictionary.notFoundDescription}
						</p>
						<div className="flex gap-4">
							<Button asChild>
								<Link href={`/${DEFAULT_LOCALE}`}>
									{dictionary.notFoundReturnHome}
								</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link href={`/${DEFAULT_LOCALE}/reading-lists`}>
									{dictionary.notFoundBrowseReadingLists}
								</Link>
							</Button>
						</div>
					</main>
					<Footer dictionary={dictionary} locale={DEFAULT_LOCALE} />
				</div>
			</body>
		</html>
	);
}
