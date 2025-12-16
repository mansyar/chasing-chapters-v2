import { describe, it, expect } from "vitest";
import {
  commentSchema,
  reportCommentSchema,
  likeReviewSchema,
  trackViewSchema,
  formatZodError,
} from "../schemas";

describe("commentSchema", () => {
  it("validates correct input", () => {
    const result = commentSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      content: "This is a great review!",
      reviewId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects short names", () => {
    const result = commentSchema.safeParse({
      name: "J",
      email: "john@example.com",
      content: "Valid content",
      reviewId: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toBe(
        "Name must be at least 2 characters"
      );
    }
  });

  it("rejects invalid emails", () => {
    const result = commentSchema.safeParse({
      name: "John Doe",
      email: "invalid-email",
      content: "Valid content",
      reviewId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects short content", () => {
    const result = commentSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      content: "Hi",
      reviewId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects content over 2000 characters", () => {
    const result = commentSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      content: "x".repeat(2001),
      reviewId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from name and content", () => {
    const result = commentSchema.safeParse({
      name: "  John Doe  ",
      email: "john@example.com",
      content: "  Trimmed content  ",
      reviewId: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("John Doe");
      expect(result.data.content).toBe("Trimmed content");
    }
  });

  it("rejects non-integer review IDs", () => {
    const result = commentSchema.safeParse({
      name: "John Doe",
      email: "john@example.com",
      content: "Valid content",
      reviewId: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("reportCommentSchema", () => {
  it("validates correct input", () => {
    const result = reportCommentSchema.safeParse({
      commentId: 123,
      reporterEmail: "reporter@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = reportCommentSchema.safeParse({
      commentId: 123,
      reporterEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative comment IDs", () => {
    const result = reportCommentSchema.safeParse({
      commentId: -1,
      reporterEmail: "reporter@example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("likeReviewSchema", () => {
  it("validates correct input", () => {
    const result = likeReviewSchema.safeParse({
      reviewId: "123",
      shouldIncrement: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric review IDs", () => {
    const result = likeReviewSchema.safeParse({
      reviewId: "abc",
      shouldIncrement: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodError(result.error)).toBe("Invalid review ID");
    }
  });

  it("rejects non-boolean shouldIncrement", () => {
    const result = likeReviewSchema.safeParse({
      reviewId: "123",
      shouldIncrement: "yes",
    });
    expect(result.success).toBe(false);
  });
});

describe("trackViewSchema", () => {
  it("validates correct input", () => {
    const result = trackViewSchema.safeParse({
      reviewId: "456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric review IDs", () => {
    const result = trackViewSchema.safeParse({
      reviewId: "not-a-number",
    });
    expect(result.success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("returns first error message", () => {
    const result = commentSchema.safeParse({
      name: "J",
      email: "invalid",
      content: "x",
      reviewId: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should return the first error
      const message = formatZodError(result.error);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
