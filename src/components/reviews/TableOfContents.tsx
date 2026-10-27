"use client";

import { ChevronDown } from "lucide-react";
import { type MouseEvent, useEffect, useState } from "react";

import { hasTableOfContents, type TocEntry } from "@/lib/toc-extract";
import { cn } from "@/lib/utils";

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

	// Scrollspy: the heading nearest the top of the viewport owns the active link.
	useEffect(() => {
		const targets = entries
			.map((entry) => document.getElementById(entry.slug))
			.filter((element): element is HTMLElement => element !== null);

		if (targets.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(observed) => {
				for (const item of observed) {
					if (item.isIntersecting) {
						setActiveSlug(item.target.id);
					}
				}
			},
			{ rootMargin: "-6rem 0px -70% 0px", threshold: 0 },
		);

		for (const heading of targets) {
			observer.observe(heading);
		}

		return () => observer.disconnect();
	}, [entries]);

	// Direct `#anchor` URLs must land on the heading even when client-side
	// navigation skips the browser's native fragment scroll.
	useEffect(() => {
		if (window.location.hash.length > 1) {
			const target = document.getElementById(window.location.hash.slice(1));

			if (target) {
				target.scrollIntoView({ block: "start" });
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
