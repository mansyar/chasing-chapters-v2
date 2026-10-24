import { Rss } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { type Locale, localizePath } from "@/lib/i18n/locale";

interface FooterProps {
	/** Server-resolved interface copy. */
	dictionary: Dictionary;
	/** The locale the surrounding document is being rendered in. */
	locale: Locale;
}

export function Footer({ dictionary, locale }: FooterProps) {
	return (
		<footer className="border-t bg-muted/30">
			<div className="container mx-auto px-6 md:px-12 lg:px-24 py-8 max-w-7xl">
				<div className="flex flex-col md:flex-row justify-between items-center gap-4">
					<div className="text-center md:text-left">
						<h3 className="font-serif text-lg font-bold">Chasing Chapters</h3>
						<p className="text-sm text-muted-foreground mt-1">
							{dictionary.footerTagline}
						</p>
					</div>
					<div className="flex items-center gap-4 text-sm text-muted-foreground">
						<Link
							href={localizePath("/feed.xml", locale)}
							className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
							aria-label={dictionary.footerRssLabel}
						>
							<Rss className="h-4 w-4" aria-hidden="true" />
							RSS
						</Link>
						<span>
							&copy; {new Date().getFullYear()} Chasing Chapters.{" "}
							{dictionary.footerRights}
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
