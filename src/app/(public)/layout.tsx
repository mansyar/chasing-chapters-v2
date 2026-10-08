import { Inter, Playfair_Display } from "next/font/google";
import { Suspense } from "react";
import { UmamiScript } from "@/components/analytics/UmamiScript";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/theme-provider";
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

const umamiOrigin = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL
	? new URL(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL).origin
	: null;

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const websiteJsonLd = generateWebSiteSchema();

	return (
		<html lang="en" suppressHydrationWarning>
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
						Skip to content
					</a>
					<div className="flex min-h-screen flex-col">
						<Suspense
							fallback={<div className="h-16 border-b bg-background/80" />}
						>
							<Navbar />
						</Suspense>
						<main id="main-content" tabIndex={-1} className="flex-1">
							{children}
						</main>
						<Footer />
					</div>
				</ThemeProvider>
				<UmamiScript />
			</body>
		</html>
	);
}
