import { describe, expect, it } from "bun:test";
import { resolveCommentStatus } from "../comment-moderation";

describe("comment-moderation", () => {
	describe("resolveCommentStatus", () => {
		it("should approve clean content from a regular commenter", () => {
			const decision = resolveCommentStatus({
				content: "I really loved this book review!",
				banned: false,
				trusted: false,
			});
			expect(decision.status).toBe("approved");
			expect(decision.spamSignals).toEqual([]);
		});

		it("should hold flagged content from a non-trusted commenter as pending", () => {
			const decision = resolveCommentStatus({
				content: "Buy viagra at https://spam.com",
				banned: false,
				trusted: false,
			});
			expect(decision.status).toBe("pending");
			expect(decision.spamSignals.length).toBeGreaterThanOrEqual(2);
			expect(decision.spamSignals).toContain(
				'Contains blocked keyword: "viagra"',
			);
			expect(decision.spamSignals).toContain("Contains URL");
		});

		it("should auto-approve flagged content from a trusted commenter while recording the signals", () => {
			const decision = resolveCommentStatus({
				content: "Check https://example.com for my review blog",
				banned: false,
				trusted: true,
			});
			expect(decision.status).toBe("approved");
			expect(decision.spamSignals).toContain("Contains URL");
		});

		it("should reject banned commenters regardless of content", () => {
			const decision = resolveCommentStatus({
				content: "I really loved this book review!",
				banned: true,
				trusted: false,
			});
			expect(decision.status).toBe("rejected");
		});

		it("should reject banned commenters even when trusted and content is clean", () => {
			const decision = resolveCommentStatus({
				content: "Great insights on the character development",
				banned: true,
				trusted: true,
			});
			expect(decision.status).toBe("rejected");
		});

		it("should handle empty content as clean and approved", () => {
			const decision = resolveCommentStatus({
				content: "",
				banned: false,
				trusted: false,
			});
			expect(decision.status).toBe("approved");
			expect(decision.spamSignals).toEqual([]);
		});
	});
});
