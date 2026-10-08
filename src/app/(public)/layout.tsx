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

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const websiteJsonLd = generateWebSiteSchema();

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
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
					<div className="flex min-h-screen flex-col">
						<Suspense
							fallback={<div className="h-16 border-b bg-background/80" />}
						>
							<Navbar />
						</Suspense>
						<main className="flex-1">{children}</main>
						<Footer />
					</div>
				</ThemeProvider>
				<UmamiScript />
			</body>
		</html>
	);
}
