import type { ReactNode } from "react";

import type { Dictionary } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "./copy-link-button";

interface SectionHeadingProps {
	/** Stable anchor slug; without one the heading renders with no id or copy button. */
	slug?: string;
	dictionary: Dictionary;
	className?: string;
	children: ReactNode;
}

/**
 * Fixed-section heading (`What I Loved`, quotes, …) with a stable anchor id
 * and a hover/focus copy-link button (`FR-4`).
 *
 * The id matches the TOC entry the page built from the same
 * `buildTableOfContents` call, so TOC links and headings can never disagree.
 */
export function SectionHeading({
	slug,
	dictionary,
	className,
	children,
}: SectionHeadingProps) {
	return (
		<h2
			id={slug}
			className={cn("group flex scroll-mt-28 items-center gap-1", className)}
		>
			<span>{children}</span>
			{slug === undefined ? null : (
				<CopyLinkButton slug={slug} dictionary={dictionary} />
			)}
		</h2>
	);
}
