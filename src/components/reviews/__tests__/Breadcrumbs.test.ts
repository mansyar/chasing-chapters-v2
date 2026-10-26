import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { type BreadcrumbItem, Breadcrumbs } from "../Breadcrumbs";

const items: BreadcrumbItem[] = [
	{ label: "Home", href: "/en" },
	{ label: "Reviews", href: "/en/reviews" },
	{ label: "The Lighthouse Keeper" },
];

function render(crumbItems: BreadcrumbItem[], label = "Breadcrumb"): string {
	return renderToStaticMarkup(
		createElement(Breadcrumbs, { items: crumbItems, label }),
	);
}

describe("Breadcrumbs", () => {
	test("renders every crumb in order", () => {
		const html = render(items);

		const home = html.indexOf("Home");
		const reviews = html.indexOf("Reviews");
		const title = html.indexOf("The Lighthouse Keeper");

		expect(home).toBeGreaterThan(-1);
		expect(reviews).toBeGreaterThan(home);
		expect(title).toBeGreaterThan(reviews);
	});

	test("links the ancestors and leaves the current page as text", () => {
		const html = render(items);

		expect(html).toContain('href="/en"');
		expect(html).toContain('href="/en/reviews"');
		// The page the reader is on is not a link back to itself.
		expect(html).not.toContain('href="/en/reviews/the-lighthouse"');
	});

	test("marks the current page for assistive technology", () => {
		const html = render(items);

		expect(html).toContain('aria-current="page"');
	});

	test("names the landmark with the localized label", () => {
		expect(render(items, "Breadcrumb")).toContain('aria-label="Breadcrumb"');
		expect(render(items, "Navigasi remah")).toContain(
			'aria-label="Navigasi remah"',
		);
	});

	test("hides the separators from assistive technology", () => {
		expect(render(items)).toContain('aria-hidden="true"');
	});

	test("renders nothing for an empty trail", () => {
		expect(render([])).toBe("");
	});

	test("renders a single crumb as the current page with no link", () => {
		const html = render([{ label: "Home" }]);

		expect(html).toContain('aria-current="page"');
		expect(html).not.toContain("<a ");
	});
});
