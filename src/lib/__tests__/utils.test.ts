import { describe, it, expect } from "bun:test";
import { cn, extractTextFromRichText } from "../utils";

describe("utils", () => {
  describe("cn", () => {
    it("should merge class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("should handle conditional classes", () => {
      expect(cn("base", true && "included", false && "excluded")).toBe(
        "base included"
      );
    });

    it("should resolve Tailwind conflicts", () => {
      // tailwind-merge should resolve conflicting utilities
      expect(cn("px-2", "px-4")).toBe("px-4");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });

    it("should handle arrays", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    it("should handle objects", () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });

    it("should handle mixed inputs", () => {
      expect(cn("base", ["arr1", "arr2"], { obj: true })).toBe(
        "base arr1 arr2 obj"
      );
    });

    it("should handle empty inputs", () => {
      expect(cn()).toBe("");
      expect(cn("")).toBe("");
      expect(cn(null, undefined)).toBe("");
    });
  });

  describe("extractTextFromRichText", () => {
    it("should extract text from simple paragraph", () => {
      const content = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ text: "Hello world" }],
            },
          ],
        },
      };
      expect(extractTextFromRichText(content)).toBe("Hello world");
    });

    it("should extract text from multiple paragraphs", () => {
      const content = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ text: "First" }],
            },
            {
              type: "paragraph",
              children: [{ text: "Second" }],
            },
          ],
        },
      };
      expect(extractTextFromRichText(content)).toBe("First Second");
    });

    it("should extract text from nested children", () => {
      const content = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [
                { text: "Normal " },
                {
                  type: "bold",
                  children: [{ text: "bold" }],
                },
              ],
            },
          ],
        },
      };
      expect(extractTextFromRichText(content)).toBe("Normal bold");
    });

    it("should return empty string for null/undefined", () => {
      expect(extractTextFromRichText(null)).toBe("");
      expect(extractTextFromRichText(undefined)).toBe("");
    });

    it("should return empty string for empty structure", () => {
      expect(extractTextFromRichText({})).toBe("");
      expect(extractTextFromRichText({ root: {} })).toBe("");
    });
  });
});
