import { describe, expect, it } from "vitest";
import type { StoryCluster } from "../clustering";
import {
  calculateCompositeScore,
  calculateCorroborationScore,
  calculateIndiaRelevanceScore,
  calculateRecencyScore,
  calculateRepetitionPenalty,
  calculateSourceTierScore,
} from "./features";

describe("Candidate feature scoring", () => {
  const refDate = new Date("2026-08-22T12:00:00.000Z");

  it("calculates recency decay accurately with half-life", () => {
    // Exact same time = 1.0
    expect(
      calculateRecencyScore("2026-08-22T12:00:00.000Z", refDate, 18),
    ).toBeCloseTo(1.0, 2);

    // 18 hours old = ~0.50
    expect(
      calculateRecencyScore("2026-08-21T18:00:00.000Z", refDate, 18),
    ).toBeCloseTo(0.5, 2);

    // 36 hours old = ~0.25
    expect(
      calculateRecencyScore("2026-08-21T00:00:00.000Z", refDate, 18),
    ).toBeCloseTo(0.25, 2);

    // > 72 hours old = 0.05
    expect(calculateRecencyScore("2026-08-10T12:00:00.000Z", refDate, 18)).toBe(
      0.05,
    );

    // null date = 0.50 safe fallback
    expect(calculateRecencyScore(null, refDate)).toBe(0.5);
  });

  it("calculates corroboration score based on distinct source count", () => {
    expect(calculateCorroborationScore(1)).toBe(0.35);
    expect(calculateCorroborationScore(2)).toBe(0.65);
    expect(calculateCorroborationScore(3)).toBe(0.85);
    expect(calculateCorroborationScore(5)).toBe(1.0);
  });

  it("calculates source tier score based on canonical source types", () => {
    const mockGetType = (id: string) => {
      if (id === "pib") return "official" as const;
      if (id === "reuters") return "primary" as const;
      if (id === "isro-research") return "research" as const;
      return "publisher" as const;
    };

    expect(calculateSourceTierScore(["pib"], mockGetType)).toBe(1.0);
    expect(calculateSourceTierScore(["reuters"], mockGetType)).toBe(1.0);
    expect(calculateSourceTierScore(["isro-research"], mockGetType)).toBe(0.9);
    expect(calculateSourceTierScore(["the-hindu"], mockGetType)).toBe(0.8);
  });

  it("calculates India relevance with entity token and multi-word matches", () => {
    const cluster: StoryCluster = {
      id: "c-1",
      primaryItem: {
        sourceId: "the-hindu",
        guid: "g-1",
        title:
          "Supreme Court passes landmark order on environmental conservation",
        description: "Judicial decision",
        url: "https://example.com/1",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "h-1",
      },
      items: [],
      sourceCount: 1,
      sources: ["the-hindu"],
      representativeTitle:
        "Supreme Court passes landmark order on environmental conservation",
      cleanedTitle:
        "Supreme Court passes landmark order on environmental conservation",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: null,
      lastPublishedAt: null,
    };

    const score = calculateIndiaRelevanceScore(cluster, () => "india");
    expect(score).toBe(1.0);
  });

  it("calculates repetition penalty against recent edition titles", () => {
    const recentTitles = [
      "ISRO launches navigation satellite NVS-02 successfully",
      "Sensex falls 800 points as tech stocks drag markets",
    ];

    // High similarity story -> strong penalty
    const penalty = calculateRepetitionPenalty(
      "ISRO launches navigation satellite NVS-02 from Sriharikota",
      recentTitles,
    );
    expect(penalty).toBeGreaterThan(0.5);

    // Unrelated new story -> zero penalty
    const zeroPenalty = calculateRepetitionPenalty(
      "Supreme Court passes landmark ruling on digital privacy",
      recentTitles,
    );
    expect(zeroPenalty).toBe(0.0);
  });

  it("calculates composite score with repetition discount", () => {
    const featureScores = {
      recency: 1.0,
      corroboration: 1.0,
      sourceTier: 1.0,
      indiaRelevance: 1.0,
      repetitionPenalty: 0.0,
      topicWeight: 1.0,
    };

    expect(calculateCompositeScore(featureScores)).toBe(1.0);

    const penalizedScores = {
      ...featureScores,
      repetitionPenalty: 1.0,
    };
    expect(calculateCompositeScore(penalizedScores, undefined, 0.5)).toBe(0.5);
  });
});
