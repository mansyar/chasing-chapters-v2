import { describe, it, expect } from "vitest";
import formatSlug from "../formatSlug";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlugHookFn = (args: any) => string | undefined;

// Helper to create mock field hook context
const createContext = (
  value: string | undefined | null,
  data?: Record<string, unknown>,
  originalDoc?: Record<string, unknown>
) => ({
  value,
  data: data || {},
  originalDoc: originalDoc || {},
});

describe("formatSlug", () => {
  describe("format helper (via formatSlug hook)", () => {
    const slugHook = formatSlug("title") as SlugHookFn;

    it("should convert spaces to hyphens", () => {
      const context = createContext("Hello World");
      expect(slugHook(context)).toBe("hello-world");
    });

    it("should remove special characters", () => {
      const context = createContext("Hello! World? 2024");
      expect(slugHook(context)).toBe("hello-world-2024");
    });

    it("should convert to lowercase", () => {
      const context = createContext("HELLO WORLD");
      expect(slugHook(context)).toBe("hello-world");
    });

    it("should handle multiple spaces", () => {
      const context = createContext("Hello   World");
      expect(slugHook(context)).toBe("hello---world");
    });

    it("should preserve hyphens", () => {
      const context = createContext("hello-world");
      expect(slugHook(context)).toBe("hello-world");
    });

    it("should preserve underscores", () => {
      const context = createContext("hello_world");
      expect(slugHook(context)).toBe("hello_world");
    });
  });

  describe("fallback behavior", () => {
    const slugHook = formatSlug("title") as SlugHookFn;

    it("should use value if provided", () => {
      const context = createContext("my-custom-slug", {
        title: "Different Title",
      });
      expect(slugHook(context)).toBe("my-custom-slug");
    });

    it("should fall back to data field when value is empty", () => {
      const context = createContext("", { title: "My Book Title" });
      expect(slugHook(context)).toBe("my-book-title");
    });

    it("should fall back to data field when value is undefined", () => {
      const context = createContext(undefined, { title: "My Book Title" });
      expect(slugHook(context)).toBe("my-book-title");
    });

    it("should fall back to originalDoc when data field is empty", () => {
      const context = createContext(undefined, {}, { title: "Original Title" });
      expect(slugHook(context)).toBe("original-title");
    });

    it("should return undefined when no fallback available", () => {
      const context = createContext(undefined, {}, {});
      expect(slugHook(context)).toBe(undefined);
    });

    it("should prioritize data over originalDoc", () => {
      const context = createContext(
        undefined,
        { title: "New Title" },
        { title: "Old Title" }
      );
      expect(slugHook(context)).toBe("new-title");
    });
  });

  describe("different fallback fields", () => {
    it("should use specified fallback field", () => {
      const slugHook = formatSlug("bookName") as SlugHookFn;
      const context = createContext(undefined, {
        bookName: "The Great Gatsby",
      });
      expect(slugHook(context)).toBe("the-great-gatsby");
    });

    it("should work with different fallback fields", () => {
      const slugHook = formatSlug("name") as SlugHookFn;
      const context = createContext(undefined, { name: "Genre Name" });
      expect(slugHook(context)).toBe("genre-name");
    });
  });
});
