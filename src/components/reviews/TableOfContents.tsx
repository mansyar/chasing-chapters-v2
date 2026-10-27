"use client";

import { ChevronDown } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { hasTableOfContents, type TocEntry } from "@/lib/toc-extract";
import { cn } from "@/lib/utils";

/**
 * How long a TOC click owns the active link. The programmatic scroll that
 * follows a click fires scroll events as it settles; the scroll handler
 * yields for this long so the click-chosen slug survives the race.
 */
const CLICK_LOCK_MS = 800;

interface TableOfContentsProps {
	entries: TocEntry[];
	title: string;
	/**
	 * Which layout to render. The review page mounts both: the collapsible
	 * above the article on mobile and the sticky aside in the sidebar on
	 * desktop. Either instance hides itself when entries are too few for a TOC.
	 */
	variant?: "auto" | "desktop" | "mobile";
}

/**
 * Sticky desktop aside + collapsible mobile TOC (`FR-1`, `FR-3`).
 *
 * Slugs come from `buildTableOfContents`, so links always match the heading
 * ids the page renders. Links are plain `#anchor` hrefs, which keeps them
 * working with JS disabled; the click handler only upgrades the jump to a
 * smooth scroll and a history update.
 */
export function TableOfContents({
	entries,
	title,
	variant = "auto",
}: TableOfContentsProps) {
	const [activeSlug, setActiveSlug] = useState<string | null>(null);

	// Click authority: a TOC click sets the slug synchronously, but scroll
	// events fire again as the programmatic scroll settles and would
	// clobber it with the reading position mid-flight. The timestamp lock
	// gives the click `CLICK_LOCK_MS` of authority over the scroll handler
	// while the jump lands.
	const lastClickAt = useRef(0);

	// Scrollspy: the active link follows the reading position - the last
	// heading (document order) whose top edge has appeared on screen, i.e.
	// at or above the viewport bottom. An IntersectionObserver band could
	// not satisfy this rule: any bottom exclusion misses a heading landed
	// at the viewport bottom edge (the last section, with comments and the
	// footer still below the article), while no bottom exclusion
	// intersects every heading below the top margin and breaks click
	// landings. Default: the first entry (top of page, nothing on screen
	// yet).
	useEffect(() => {
		function computeActive(): void {
			// The programmatic scroll from a TOC click settles after the
			// synchronous `setActiveSlug` in `scrollToEntry`; ignore scroll
			// output while the click lock is fresh so the click-chosen slug
			// survives the race.
			if (Date.now() - lastClickAt.current < CLICK_LOCK_MS) {
				return;
			}

			let current: string | null = entries[0]?.slug ?? null;
			for (const entry of entries) {
				const heading = document.getElementById(entry.slug);
				if (
					heading !== null &&
					heading.getBoundingClientRect().top <= window.innerHeight
				) {
					current = entry.slug;
				}
			}
			setActiveSlug(current);
		}

		let frame = 0;
		function handleScroll(): void {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(computeActive);
		}

		// Initial compute so the highlight is correct without waiting for
		// the first scroll event (e.g. deep-link landings).
		computeActive();
		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
		};
	}, [entries]);

	// Direct `#anchor` URLs must land on the heading even when client-side
	// navigation skips the browser's native fragment scroll.
	useEffect(() => {
		if (window.location.hash.length > 1) {
			const target = document.getElementById(window.location.hash.slice(1));

			// Landing is always instant: it must not animate for
			// `prefers-reduced-motion` readers, and an animated jump on load
			// would fight the browser's own fragment scroll (`NFR-3`).
			if (target) {
				target.scrollIntoView({ behavior: "auto", block: "start" });
			}
		}
	}, []);

	if (!hasTableOfContents(entries)) {
		return null;
	}

	function scrollToEntry(
		event: MouseEvent<HTMLAnchorElement>,
		slug: string,
	): void {
		const target = document.getElementById(slug);

		// No enhanced scroll target: let the browser follow the plain href.
		if (!target) {
			return;
		}

		event.preventDefault();
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		target.scrollIntoView({
			behavior: reduceMotion ? "auto" : "smooth",
			block: "start",
		});
		window.history.pushState(null, "", `#${slug}`);
		lastClickAt.current = Date.now();
		setActiveSlug(slug);
	}

	const list = (
		<ul className="space-y-1">
			{entries.map((entry) => {
				const isActive = activeSlug === entry.slug;

				return (
					<li key={entry.slug}>
						<a
							href={`#${entry.slug}`}
							onClick={(event) => scrollToEntry(event, entry.slug)}
							aria-current={isActive ? "location" : undefined}
							className={cn(
								"flex min-h-[44px] items-center rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								entry.level === 3 && "pl-6",
								isActive
									? "bg-accent font-medium text-accent-foreground"
									: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
							)}
						>
							{entry.title === "" ? entry.slug : entry.title}
						</a>
					</li>
				);
			})}
		</ul>
	);

	return (
		<>
			{variant !== "desktop" && (
				<details className="group rounded-xl border bg-card text-card-foreground shadow-sm lg:hidden">
					<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
						<span>{title}</span>
						<ChevronDown
							className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<nav aria-label={title} className="border-t px-2 py-2">
						{list}
					</nav>
				</details>
			)}
			{variant !== "mobile" && (
				<aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border bg-card text-card-foreground shadow-sm lg:block">
					<p className="px-4 pt-4 font-semibold">{title}</p>
					<nav aria-label={title} className="p-2">
						{list}
					</nav>
				</aside>
			)}
		</>
	);
}
