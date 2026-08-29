import { describe, expect, it } from "vitest";
import {
  extractDates,
  extractFactTokens,
  extractNamedEntities,
  extractNumbers,
  normalizeNumberToken,
} from "./extractors";

describe("Factual extractors", () => {
  describe("extractNumbers and normalizeNumberToken", () => {
    it("extracts integers, decimals, and comma-formatted numbers", () => {
      const text =
        "ISRO launched the 2,232 kg satellite at 10.50 AM with 1,00,000 spectators.";
      const numbers = extractNumbers(text);

      expect(numbers.has("2,232")).toBe(true);
      expect(numbers.has("2232")).toBe(true);
      expect(numbers.has("10.50")).toBe(true);
      expect(numbers.has("1,00,000")).toBe(true);
      expect(numbers.has("100000")).toBe(true);
    });

    it("extracts percentages, currencies, and unit multipliers", () => {
      const text =
        "Inflation rose by 5.4% while the budget allocation reached ₹15,000 crore and $10B.";
      const numbers = extractNumbers(text);

      expect(numbers.has("5.4%")).toBe(true);
      expect(numbers.has("5.4")).toBe(true);
      expect(numbers.has("₹15,000 crore")).toBe(true);
      expect(numbers.has("$10B")).toBe(true);
    });

    it("extracts spelled-out numbers and normalizes them", () => {
      const text =
        "Three satellites were placed in orbit during the second phase.";
      const numbers = extractNumbers(text);

      expect(numbers.has("three")).toBe(true);
      expect(numbers.has("3")).toBe(true);
      expect(numbers.has("second")).toBe(true);
      expect(numbers.has("2")).toBe(true);
    });

    it("normalizes different number formats consistently", () => {
      expect(normalizeNumberToken("1,00,000")).toBe("100000");
      expect(normalizeNumberToken("₹500")).toBe("500");
      expect(normalizeNumberToken("15.5%")).toBe("15.5");
      expect(normalizeNumberToken("five")).toBe("5");
    });
  });

  describe("extractNamedEntities", () => {
    it("extracts acronyms and multi-word capitalized phrases", () => {
      const text =
        "ISRO and NavIC teams met at the Satish Dhawan Space Centre along with the Supreme Court representatives.";
      const entities = extractNamedEntities(text);

      expect(entities.has("ISRO")).toBe(true);
      expect(entities.has("NavIC")).toBe(true);
      expect(entities.has("Satish Dhawan Space Centre")).toBe(true);
      expect(entities.has("Supreme Court")).toBe(true);
    });

    it("ignores common leading sentence-initial stop words", () => {
      const text =
        "According to officials, the Ministry of Finance announced reforms. However, SEBI cautioned investors.";
      const entities = extractNamedEntities(text);

      expect(entities.has("Ministry of Finance")).toBe(true);
      expect(entities.has("SEBI")).toBe(true);
      expect(entities.has("According to officials")).toBe(false);
    });
  });

  describe("extractDates", () => {
    it("extracts ISO dates, calendar dates, weekdays, and relative anchors", () => {
      const text =
        "The event took place on 2026-08-22 (Saturday) after the August 15 celebrations yesterday.";
      const dates = extractDates(text);

      expect(dates.has("2026-08-22")).toBe(true);
      expect(dates.has("saturday")).toBe(true);
      expect(dates.has("August 15")).toBe(true);
      expect(dates.has("yesterday")).toBe(true);
    });
  });

  describe("extractFactTokens", () => {
    it("extracts combined token arrays", () => {
      const text = "ISRO launched 2 satellites on Saturday.";
      const tokens = extractFactTokens(text);

      expect(tokens.namedEntities).toContain("ISRO");
      expect(tokens.numbers).toContain("2");
      expect(tokens.dates).toContain("saturday");
    });
  });
});
