/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { Menu, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageToggle } from "@/components/reviews/LanguageToggle";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/locale";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const Sheet = dynamic(() => import("../ui/sheet").then((m) => m.Sheet), {
	ssr: false,
});
const SheetContent = dynamic(
	() => import("../ui/sheet").then((m) => m.SheetContent),
	{ ssr: false },
);
const SheetHeader = dynamic(
	() => import("../ui/sheet").then((m) => m.SheetHeader),
	{ ssr: false },
);
const SheetTitle = dynamic(
	() => import("../ui/sheet").then((m) => m.SheetTitle),
	{ ssr: false },
);
const SheetTrigger = dynamic(
	() => import("../ui/sheet").then((m) => m.SheetTrigger),
	{ ssr: false },
);

interface NavbarProps {
	/** Server-resolved interface copy. */
	dictionary: Dictionary;
	/** The locale this page is rendered in, for the control and for search. */
	locale: Locale;
}

export function Navbar({ dictionary, locale }: NavbarProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	useEffect(() => {
		setQuery(searchParams.get("q") || "");
	}, [searchParams]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		// Search from `/id/...` must stay in Indonesian, so the path is built from
		// the locale this page was rendered in rather than left for the proxy to
		// guess from a cookie the reader may not have.
		if (query.trim()) {
			router.push(`/${locale}/reviews?q=${encodeURIComponent(query)}`);
		} else {
			router.push(`/${locale}/reviews`);
		}
		setIsSearchOpen(false);
	};

	return (
		<nav className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
			<div className="container mx-auto px-6 md:px-12 lg:px-24 h-16 flex items-center justify-between max-w-7xl">
				<Link href="/" className="font-serif text-2xl font-bold tracking-tight">
					Chasing Chapters
				</Link>

				<div className="hidden md:flex items-center gap-6">
					<Link
						href="/reviews"
						className="text-sm font-medium hover:text-primary transition-colors"
					>
						{dictionary.navReviews}
					</Link>
					<Link
						href="/reading-lists"
						className="text-sm font-medium hover:text-primary transition-colors"
					>
						{dictionary.navReadingLists}
					</Link>
					<Link
						href="/about"
						className="text-sm font-medium hover:text-primary transition-colors"
					>
						{dictionary.navAbout}
					</Link>
					<Link
						href="/admin"
						className="text-sm font-medium hover:text-primary transition-colors"
					>
						{dictionary.navWriteReview}
					</Link>
				</div>

				<div className="flex items-center gap-4">
					<form onSubmit={handleSearch} className="relative hidden sm:block">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder={dictionary.navSearchPlaceholder}
							aria-label={dictionary.navSearchPlaceholder}
							className="w-[200px] pl-9"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</form>
					<LanguageToggle dictionary={dictionary} />
					<ModeToggle dictionary={dictionary} />
					<Button
						variant="ghost"
						size="icon"
						className="sm:hidden"
						onClick={() => setIsSearchOpen(!isSearchOpen)}
					>
						{isSearchOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Search className="h-5 w-5" />
						)}
						<span className="sr-only">{dictionary.navToggleSearch}</span>
					</Button>

					{/* Mobile Menu */}
					<Sheet open={isOpen} onOpenChange={setIsOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" className="md:hidden">
								<Menu className="h-5 w-5" />
								<span className="sr-only">{dictionary.navToggleMenu}</span>
							</Button>
						</SheetTrigger>
						<SheetContent side="right">
							<SheetHeader>
								<SheetTitle className="font-serif text-left">
									{dictionary.navMenuTitle}
								</SheetTitle>
							</SheetHeader>
							<div className="flex flex-col gap-4 mt-6 px-4">
								<Link
									href="/reviews"
									className="text-lg font-medium hover:text-primary transition-colors"
									onClick={() => setIsOpen(false)}
								>
									{dictionary.navReviews}
								</Link>
								<Link
									href="/reading-lists"
									className="text-lg font-medium hover:text-primary transition-colors"
									onClick={() => setIsOpen(false)}
								>
									{dictionary.navReadingLists}
								</Link>
								<Link
									href="/about"
									className="text-lg font-medium hover:text-primary transition-colors"
									onClick={() => setIsOpen(false)}
								>
									{dictionary.navAbout}
								</Link>
								<Link
									href="/admin"
									className="text-lg font-medium hover:text-primary transition-colors"
									onClick={() => setIsOpen(false)}
								>
									{dictionary.navWriteReview}
								</Link>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
			{isSearchOpen && (
				<div className="container mx-auto px-6 pb-4 sm:hidden animate-in slide-in-from-top-2 fade-in duration-200">
					<form onSubmit={handleSearch} className="relative">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder={dictionary.navSearchPlaceholder}
							aria-label={dictionary.navSearchPlaceholder}
							className="w-full pl-9"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus
						/>
					</form>
				</div>
			)}
		</nav>
	);
}
