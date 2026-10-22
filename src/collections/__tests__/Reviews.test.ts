import { describe, expect, it } from "bun:test";
import { Reviews } from "../Reviews";

describe("Reviews collection", () => {
	it("allows a review without a cover image", () => {
		// Every public render site falls back to the coverless layout when a
		// review has no cover image, and the end-to-end fixture creates
		// coverless reviews, so the cover may not be a required field.
		const coverImage = Reviews.fields.find(
			(field) => "name" in field && field.name === "coverImage",
		);

		expect(coverImage).toBeDefined();
		const required =
			coverImage && "required" in coverImage ? coverImage.required : undefined;
		expect(required).toBeFalsy();
	});
});
