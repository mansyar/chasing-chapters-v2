import { Rss } from "lucide-react";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t bg-muted/30">
			<div className="container mx-auto px-6 md:px-12 lg:px-24 py-8 max-w-7xl">
				<div className="flex flex-col md:flex-row justify-between items-center gap-4">
					<div className="text-center md:text-left">
						<h3 className="font-serif text-lg font-bold">Chasing Chapters</h3>
						<p className="text-sm text-muted-foreground mt-1">
							A personal space for book lovers.
						</p>
					</div>
					<div className="flex items-center gap-4 text-sm text-muted-foreground">
						<Link
							href="/feed.xml"
							className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
							aria-label="RSS feed of latest reviews"
						>
							<Rss className="h-4 w-4" aria-hidden="true" />
							RSS
						</Link>
						<span>
							&copy; {new Date().getFullYear()} Chasing Chapters. All rights
							reserved.
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
