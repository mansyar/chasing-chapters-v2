import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { renderStatic } from "@/components/__tests__/helpers/render-static";
import { getDictionary } from "@/lib/i18n/dictionary";
import { QuoteShareButtons } from "../QuoteShare";

describe("QuoteShareButtons", () => {
	test("renders localized copy and share buttons in the initial state", () => {
		const dictionary = getDictionary("en");
		const html = renderStatic(
			createElement(QuoteShareButtons, {
				quote: "A memorable line",
				bookTitle: "Example Book",
				dictionary,
			}),
		);
		expect(html).toContain(dictionary.reviewCopyQuote);
		expect(html).toContain(dictionary.reviewShareQuote);
		expect(html).not.toContain(dictionary.shareCopied);
	});
});
