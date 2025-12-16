import { describe, it, expect } from "vitest";
import { getTranslationCacheKey } from "../redis";

describe("redis cache utilities", () => {
  describe("getTranslationCacheKey", () => {
    it("should return consistent hash for the same input", () => {
      const text = "Hello, world!";
      const lang = "id";

      const key1 = getTranslationCacheKey(text, lang);
      const key2 = getTranslationCacheKey(text, lang);

      expect(key1).toBe(key2);
    });

    it("should return different hashes for different inputs", () => {
      const lang = "id";

      const key1 = getTranslationCacheKey("Hello", lang);
      const key2 = getTranslationCacheKey("World", lang);

      expect(key1).not.toBe(key2);
    });

    it("should return different hashes for different languages", () => {
      const text = "Hello, world!";

      const key1 = getTranslationCacheKey(text, "id");
      const key2 = getTranslationCacheKey(text, "es");

      expect(key1).not.toBe(key2);
    });

    it("should have constant key length regardless of input text length", () => {
      const shortText = "Hi";
      const longText = "A".repeat(10000); // 10,000 characters

      const shortKey = getTranslationCacheKey(shortText, "id");
      const longKey = getTranslationCacheKey(longText, "id");

      // Both keys should have the same length (prefix + lang + : + 16 char hash)
      expect(shortKey.length).toBe(longKey.length);

      // Key format: "translate:id:XXXXXXXXXXXXXXXX" = 29 chars (13 prefix + 16 hash)
      expect(shortKey.length).toBe(29);
    });

    it("should handle special characters correctly", () => {
      const specialTexts = [
        "Unicode: 你好世界 🌍",
        "Newlines:\n\nMultiple\nLines",
        "Quotes: \"double\" and 'single'",
        "Colons: key:value:nested",
        "Emoji: 📚📖✨",
      ];

      const keys = specialTexts.map((text) =>
        getTranslationCacheKey(text, "id")
      );

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);

      // All keys should have consistent length
      keys.forEach((key) => {
        expect(key.length).toBe(29);
      });
    });

    it("should produce valid Redis key format", () => {
      const key = getTranslationCacheKey("test", "id");

      // Should start with prefix
      expect(key.startsWith("translate:")).toBe(true);

      // Should contain language code
      expect(key).toContain(":id:");

      // Should only contain valid characters (alphanumeric and colon)
      expect(key).toMatch(/^[a-z0-9:]+$/);
    });
  });
});
