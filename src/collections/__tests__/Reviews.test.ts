import { describe, expect, it } from "bun:test";
import { Reviews } from "../Reviews";

describe("Reviews collection", () => {
	it("requires a cover image", () => {
		// A published review is a book review: it ships with its cover, and
		// the render sites fall back to an empty frame when the cover is
		// missing. The cover is therefore a required field.
		const coverImage = Reviews.fields.find(
			(field) => "name" in field && field.name === "coverImage",
		);

		expect(coverImage).toBeDefined();
		const required =
			coverImage && "required" in coverImage ? coverImage.required : undefined;
		expect(required).toBe(true);
	});
});
