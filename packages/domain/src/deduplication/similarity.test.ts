import { describe, expect, it } from "vitest";
import {
  calculateDiceCoefficient,
  calculateTitleSimilarity,
  hasNumericConflict,
} from "./similarity";
import { tokenizeTitle } from "./tokens";

describe("calculateTitleSimilarity", () => {
  it("computes exact match as 1.0", () => {
    const tokensA = tokenizeTitle("ISRO launches navigation satellite NVS-02");
    const tokensB = tokenizeTitle("ISRO launches navigation satellite NVS-02");
    const score = calculateTitleSimilarity(tokensA, tokensB);
    expect(score).toBeCloseTo(1.0, 2);
  });

  it("computes disjoint sets as 0.0", () => {
    const tokensA = tokenizeTitle("ISRO launches navigation satellite");
    const tokensB = tokenizeTitle("Sensex crashes amid inflation fears");
    const score = calculateTitleSimilarity(tokensA, tokensB);
    expect(score).toBe(0.0);
  });

  it("gives high similarity for light rewrites", () => {
    const tokensA = tokenizeTitle(
      "Sensex plunges 800 points as tech stocks drag markets - Mint",
    );
    const tokensB = tokenizeTitle(
      "LIVE: Sensex drops 800 pts dragged by IT, tech shares - NDTV",
    );
    const score = calculateTitleSimilarity(tokensA, tokensB);
    expect(score).toBeGreaterThan(0.48);
  });

  it("penalizes conflicting numbers", () => {
    const tokensA = tokenizeTitle("5 killed in bus accident on highway");
    const tokensB = tokenizeTitle("12 killed in bus accident on highway");
    expect(hasNumericConflict(tokensA, tokensB)).toBe(true);

    const scoreWithPenalty = calculateTitleSimilarity(tokensA, tokensB, {
      penalizeNumericMismatch: true,
      numericMismatchPenalty: 0.3,
    });
    const scoreWithoutPenalty = calculateTitleSimilarity(tokensA, tokensB, {
      penalizeNumericMismatch: false,
    });

    expect(scoreWithPenalty).toBeLessThan(scoreWithoutPenalty);
    expect(scoreWithPenalty).toBeLessThan(0.6);
  });

  it("handles empty token sets safely", () => {
    expect(calculateDiceCoefficient(new Set(), new Set())).toBe(1.0);
    expect(calculateDiceCoefficient(new Set(["a"]), new Set())).toBe(0.0);
  });
});
