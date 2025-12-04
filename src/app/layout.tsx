import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chasing Chapters",
    template: "%s | Chasing Chapters",
  },
  description:
    "A digital sanctuary for book lovers, dedicated to the art of storytelling and the joy of getting lost in a good book.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://chasing-chapters.com",
    siteName: "Chasing Chapters",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Chasing Chapters - Book Reviews",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@chasingchapters",
    creator: "@chasingchapters",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
