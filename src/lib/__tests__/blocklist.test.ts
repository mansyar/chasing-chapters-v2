import { describe, it, expect } from "bun:test";
import { isSpamContent, getSpamReasons } from "../blocklist";

describe("blocklist", () => {
  describe("isSpamContent", () => {
    describe("blocked keywords", () => {
      it("should detect pharmaceutical spam", () => {
        expect(isSpamContent("Buy viagra now!")).toBe(true);
        expect(isSpamContent("Get your CIALIS pills")).toBe(true);
        expect(isSpamContent("Cheap pharmacy online")).toBe(true);
      });

      it("should detect gambling spam", () => {
        expect(isSpamContent("Win at casino today")).toBe(true);
        expect(isSpamContent("Best poker site")).toBe(true);
        expect(isSpamContent("Betting tips for slots")).toBe(true);
      });

      it("should detect crypto/finance scams", () => {
        expect(isSpamContent("Invest in crypto now")).toBe(true);
        expect(isSpamContent("Bitcoin investment opportunity")).toBe(true);
        expect(isSpamContent("Make money fast with forex")).toBe(true);
        expect(isSpamContent("Get rich quick scheme")).toBe(true);
      });

      it("should detect adult content", () => {
        expect(isSpamContent("Check this xxx site")).toBe(true);
        expect(isSpamContent("Adult content 18+")).toBe(true);
      });

      it("should detect common spam phrases", () => {
        expect(isSpamContent("Click here for free trial")).toBe(true);
        expect(isSpamContent("Act now limited time offer")).toBe(true);
        expect(isSpamContent("Congratulations you have been selected")).toBe(
          true
        );
        expect(isSpamContent("Work from home opportunity")).toBe(true);
      });

      it("should detect SEO spam", () => {
        expect(isSpamContent("Get backlinks for your site")).toBe(true);
        expect(isSpamContent("Improve your google ranking")).toBe(true);
      });
    });

    describe("blocked patterns", () => {
      it("should detect URLs", () => {
        expect(isSpamContent("Visit https://spam-site.com")).toBe(true);
        expect(isSpamContent("Go to http://example.com")).toBe(true);
      });

      it("should detect email addresses", () => {
        expect(isSpamContent("Contact spam@example.com for details")).toBe(
          true
        );
      });

      it("should detect phone numbers", () => {
        expect(isSpamContent("Call 123-456-7890 now")).toBe(true);
        expect(isSpamContent("Phone: 123.456.7890")).toBe(true);
      });

      it("should detect repeated characters", () => {
        expect(isSpamContent("This is freeeeeeee!")).toBe(true);
        expect(isSpamContent("Besttttttt offer ever")).toBe(true);
      });

      it("should detect crypto wallet addresses", () => {
        expect(
          isSpamContent("Send to 0x1234567890abcdef1234567890abcdef12345678")
        ).toBe(true);
      });
    });

    describe("clean content", () => {
      it("should allow genuine book review comments", () => {
        expect(isSpamContent("I really loved this book review!")).toBe(false);
        expect(
          isSpamContent("Great insights on the character development")
        ).toBe(false);
        expect(isSpamContent("This made me want to read the book")).toBe(false);
      });

      it("should allow legitimate feedback", () => {
        expect(isSpamContent("Could you review more fantasy books?")).toBe(
          false
        );
        expect(
          isSpamContent("I disagree with the rating, the ending was perfect")
        ).toBe(false);
      });

      it("should handle empty content", () => {
        expect(isSpamContent("")).toBe(false);
      });
    });
  });

  describe("getSpamReasons", () => {
    it("should return empty array for clean content", () => {
      expect(getSpamReasons("Great book review!")).toEqual([]);
    });

    it("should return keyword match reasons", () => {
      const reasons = getSpamReasons("Buy viagra and casino chips");
      expect(reasons).toContain('Contains blocked keyword: "viagra"');
      expect(reasons).toContain('Contains blocked keyword: "casino"');
    });

    it("should return URL detection reason", () => {
      const reasons = getSpamReasons("Check https://example.com");
      expect(reasons).toContain("Contains URL");
    });

    it("should return email detection reason", () => {
      const reasons = getSpamReasons("Email me at test@example.com");
      expect(reasons).toContain("Contains email address");
    });

    it("should return repeated characters reason", () => {
      const reasons = getSpamReasons("Sooooooo amazing!");
      expect(reasons).toContain("Contains repeated characters");
    });

    it("should return multiple reasons for complex spam", () => {
      const reasons = getSpamReasons(
        "Buy viagra at https://spam.com contact spam@test.com"
      );
      expect(reasons.length).toBeGreaterThanOrEqual(3);
    });
  });
});
