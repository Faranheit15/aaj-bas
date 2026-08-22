import { describe, expect, it } from "vitest";
import { classifyDuplicate, isNearDuplicate } from "./duplicate";
import { GOLDEN_DUPLICATE_DATASET } from "./golden";

describe("Golden dataset verification for duplicate detection (AB-501)", () => {
  for (const testCase of GOLDEN_DUPLICATE_DATASET) {
    it(`[${testCase.id}] ${testCase.description}`, () => {
      const match = isNearDuplicate(testCase.itemA, testCase.itemB);
      expect(match).toBe(testCase.expectedMatch);

      const classification = classifyDuplicate(testCase.itemA, testCase.itemB);
      if (testCase.expectedMatch) {
        expect(["exact", "near"]).toContain(classification.matchType);
        if (testCase.expectedType) {
          expect(classification.matchType).toBe(testCase.expectedType);
        }
      } else {
        expect(classification.matchType).toBe("distinct");
      }
    });
  }
});
