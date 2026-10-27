import {
	type JSXConvertersFunction,
	RichText,
} from "@payloadcms/richtext-lexical/react";

import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Review } from "@/payload-types";
import { CopyLinkButton } from "./copy-link-button";

interface ReviewBodyProps {
	data: Review["reviewContent"];
	/**
	 * Slugs for the body's H2/H3 headings in document order. The page takes
	 * them from the same `buildTableOfContents` call that feeds the TOC, so
	 * heading ids and TOC links can never disagree.
	 */
	headingSlugs: string[];
	dictionary: Dictionary;
}

/**
 * The review body with stable anchor ids on H2/H3 headings (`FR-4`).
 *
 * Only H2/H3 are navigable sections — the same predicate the extractor uses —
 * so only they consume slugs, in document order. Anything else renders exactly
 * like the default converter. Ids are server-rendered, so `#anchor` jumps work
 * with JS disabled.
 */
export function ReviewBody({
	data,
	headingSlugs,
	dictionary,
}: ReviewBodyProps) {
	if (!data) {
		return null;
	}

	let headingIndex = 0;

	const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
		...defaultConverters,
		heading: ({ node, nodesToJSX }) => {
			const children = nodesToJSX({ nodes: node.children });

			if (node.tag !== "h2" && node.tag !== "h3") {
				const Tag = node.tag;
				return <Tag>{children}</Tag>;
			}

			const slug = headingSlugs[headingIndex];
			headingIndex += 1;
			const Tag = node.tag;

			// Defensive: more H2/H3 than slugs still renders, just unlinked.
			if (slug === undefined) {
				return <Tag>{children}</Tag>;
			}

			return (
				<Tag id={slug} className="group scroll-mt-28">
					{children} <CopyLinkButton slug={slug} dictionary={dictionary} />
				</Tag>
			);
		},
	});

	return <RichText data={data} converters={converters} />;
}
