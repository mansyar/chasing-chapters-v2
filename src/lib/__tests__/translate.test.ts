import { describe, it, expect } from "bun:test";
import {
  extractPlainText,
  createRichTextFromPlain,
  syncRichTextFormat,
} from "../translate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RichTextResult = { root: any };

describe("translate utilities", () => {
  describe("extractPlainText", () => {
    it("should extract text from simple paragraph", () => {
      const richText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "Hello world" }],
            },
          ],
        },
      };
      expect(extractPlainText(richText)).toBe("Hello world");
    });

    it("should extract text from multiple paragraphs", () => {
      const richText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "First paragraph" }],
            },
            {
              type: "paragraph",
              children: [{ type: "text", text: "Second paragraph" }],
            },
          ],
        },
      };
      expect(extractPlainText(richText)).toBe(
        "First paragraph\nSecond paragraph"
      );
    });

    it("should extract text from nested children", () => {
      const richText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [
                { type: "text", text: "Normal " },
                {
                  type: "bold",
                  children: [{ type: "text", text: "bold" }],
                },
                { type: "text", text: " text" },
              ],
            },
          ],
        },
      };
      expect(extractPlainText(richText)).toBe("Normal bold text");
    });

    it("should return empty string for null input", () => {
      expect(extractPlainText(null)).toBe("");
    });

    it("should return empty string for undefined input", () => {
      expect(extractPlainText(undefined)).toBe("");
    });

    it("should return empty string for empty root", () => {
      expect(extractPlainText({ root: {} })).toBe("");
    });
  });

  describe("createRichTextFromPlain", () => {
    it("should create Lexical structure for single line", () => {
      const result = createRichTextFromPlain("Hello world");
      expect(result).toEqual({
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "Hello world", version: 1 }],
              direction: "ltr",
              format: "",
              indent: 0,
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      });
    });

    it("should create multiple paragraphs for multi-line text", () => {
      const result = createRichTextFromPlain(
        "Line 1\nLine 2\nLine 3"
      ) as RichTextResult;
      expect(result.root.children).toHaveLength(3);
      expect(result.root.children[0].children[0].text).toBe("Line 1");
      expect(result.root.children[1].children[0].text).toBe("Line 2");
      expect(result.root.children[2].children[0].text).toBe("Line 3");
    });

    it("should handle empty string", () => {
      const result = createRichTextFromPlain("") as RichTextResult;
      expect(result.root.children).toHaveLength(1);
      expect(result.root.children[0].children[0].text).toBe("");
    });
  });

  describe("syncRichTextFormat", () => {
    it("should preserve translated text with source format", () => {
      const sourceRichText = {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              format: "bold",
              children: [{ type: "text", text: "Original text" }],
            },
          ],
        },
      };
      const targetRichText = {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              format: "",
              children: [{ type: "text", text: "Teks terjemahan" }],
            },
          ],
        },
      };

      const result = syncRichTextFormat(
        sourceRichText,
        targetRichText
      ) as RichTextResult;

      // Should keep source structure but target text
      expect(result.root.children[0].format).toBe("bold");
      expect(result.root.children[0].children[0].text).toBe("Teks terjemahan");
    });

    it("should handle multiple text nodes", () => {
      const sourceRichText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [
                { type: "text", text: "First" },
                { type: "text", text: "Second" },
              ],
            },
          ],
        },
      };
      const targetRichText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [
                { type: "text", text: "Pertama" },
                { type: "text", text: "Kedua" },
              ],
            },
          ],
        },
      };

      const result = syncRichTextFormat(
        sourceRichText,
        targetRichText
      ) as RichTextResult;
      expect(result.root.children[0].children[0].text).toBe("Pertama");
      expect(result.root.children[0].children[1].text).toBe("Kedua");
    });

    it("should return source if target has no root", () => {
      const sourceRichText = {
        root: {
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "Original" }],
            },
          ],
        },
      };

      const result = syncRichTextFormat(sourceRichText, null);
      expect(result).toEqual(sourceRichText);
    });

    it("should return source if source has no root", () => {
      const result = syncRichTextFormat(null, { root: {} });
      expect(result).toBeNull();
    });
  });
});
