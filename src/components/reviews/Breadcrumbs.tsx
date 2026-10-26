import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
	/** The visible crumb text. */
	label: string;
	/**
	 * Locale-prefixed path for the crumb. Omitted on the final crumb, which is
	 * the page the reader is already on.
	 */
	href?: string;
}

interface BreadcrumbsProps {
	items: BreadcrumbItem[];
	/** Accessible name for the landmark, localized by the caller. */
	label: string;
	className?: string;
}

/**
 * The visible trail for a detail page.
 *
 * Both detail pages already emit a `BreadcrumbList` structured-data block; this
 * is the same trail for a reader. Each page builds the trail once and hands it
 * to both, so the two renderings cannot drift apart.
 *
 * A server component: no `"use client"`, no state. The last crumb is the
 * current page, so it is text with `aria-current="page"` rather than a link
 * back to where the reader already is.
 */
export function Breadcrumbs({ items, label, className }: BreadcrumbsProps) {
	if (items.length === 0) {
		return null;
	}

	return (
		<nav
			aria-label={label}
			className={cn("text-sm text-muted-foreground", className)}
		>
			<ol className="flex flex-wrap items-center gap-1.5">
				{items.map((item, index) => {
					const isLast = index === items.length - 1;

					return (
						<li
							key={`${item.label}-${index}`}
							className="flex items-center gap-1.5"
						>
							{isLast ? (
								<span aria-current="page" className="text-foreground">
									{item.label}
								</span>
							) : item.href ? (
								<Link
									href={item.href}
									className="transition-colors hover:text-foreground"
								>
									{item.label}
								</Link>
							) : (
								<span>{item.label}</span>
							)}
							{!isLast && (
								<ChevronRight
									aria-hidden="true"
									className="h-3.5 w-3.5 shrink-0"
								/>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
