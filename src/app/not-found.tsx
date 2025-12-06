/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { Suspense } from "react";
import { Inter, Playfair_Display } from "next/font/google";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
});

export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} antialiased`}>
        <div className="flex min-h-screen flex-col">
          <Suspense
            fallback={<div className="h-16 border-b bg-background/80" />}
          >
            <Navbar />
          </Suspense>
          <main className="flex flex-1 flex-col items-center justify-center text-center p-6">
            <h1 className="font-serif text-6xl md:text-8xl font-medium mb-4">
              404
            </h1>
            <h2 className="font-serif text-2xl md:text-3xl mb-6">
              Chapter Missing
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mb-8">
              It seems you've turned to a page that doesn't exist yet. The story
              continues elsewhere.
            </p>
            <div className="flex gap-4">
              <Button asChild>
                <Link href="/">Return Home</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/reading-lists">Browse Reading Lists</Link>
              </Button>
            </div>
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
