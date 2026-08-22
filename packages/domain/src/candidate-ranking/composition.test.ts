import { describe, expect, it } from "vitest";
import type { TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { composeEditionCandidates } from "./composition";
import type { RankedStoryCandidate } from "./types";

describe("Edition candidate composition", () => {
  function makeCandidate(
    id: string,
    topic: TopicSlug,
    primarySourceId: string,
    score: number,
  ): RankedStoryCandidate {
    const cluster: StoryCluster = {
      id,
      primaryItem: {
        sourceId: primarySourceId,
        guid: `guid-${id}`,
        title: `Story ${id}`,
        description: "Desc",
        url: `https://example.com/${id}`,
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: `hash-${id}`,
      },
      items: [],
      sourceCount: 1,
      sources: [primarySourceId],
      representativeTitle: `Story ${id}`,
      cleanedTitle: `Story ${id}`,
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: null,
      lastPublishedAt: null,
    };

    return {
      cluster,
      topic,
      compositeScore: score,
      featureScores: {
        recency: 1.0,
        corroboration: 1.0,
        sourceTier: 1.0,
        indiaRelevance: 1.0,
        repetitionPenalty: 0.0,
        topicWeight: 1.0,
      },
      primarySourceId,
      decision: "rejected",
      decisionReason: {
        code: "below_score_threshold",
        details: "pending",
      },
    };
  }

  it("enforces max stories per topic cap in Core", () => {
    // 5 stories with topic "business-economy"
    const candidates: RankedStoryCandidate[] = [
      makeCandidate("c-1", "business-economy", "src-1", 0.95),
      makeCandidate("c-2", "business-economy", "src-2", 0.94),
      makeCandidate("c-3", "business-economy", "src-3", 0.93),
      makeCandidate("c-4", "business-economy", "src-4", 0.92), // Should be capped from core
      makeCandidate("c-5", "business-economy", "src-5", 0.91), // Should be capped from core
      makeCandidate("c-6", "india", "src-6", 0.85),
      makeCandidate("c-7", "sports", "src-7", 0.84),
      makeCandidate("c-8", "technology-ai", "src-8", 0.83),
      makeCandidate("c-9", "science-health-climate", "src-9", 0.82),
      makeCandidate("c-10", "policy-geopolitics", "src-10", 0.81),
    ];

    const result = composeEditionCandidates(candidates, {
      coreStoryCount: 8,
      maxCoreStoriesPerTopic: 3,
    });

    expect(result.coreCandidates.length).toBe(8);
    const businessCore = result.coreCandidates.filter(
      (c) => c.topic === "business-economy",
    );
    expect(businessCore.length).toBe(3);

    // c-4 and c-5 should be in business-economy topic pool
    const businessPool = result.topicPools["business-economy"];
    expect(businessPool?.length).toBe(2);
    expect(businessPool?.[0]?.cluster.id).toBe("c-4");
    expect(businessPool?.[1]?.cluster.id).toBe("c-5");
  });

  it("enforces publisher cap in Core", () => {
    // 4 stories from same publisher "the-hindu"
    const candidates: RankedStoryCandidate[] = [
      makeCandidate("c-1", "india", "the-hindu", 0.95),
      makeCandidate("c-2", "business-economy", "the-hindu", 0.94),
      makeCandidate("c-3", "sports", "the-hindu", 0.93), // Should be capped from core
      makeCandidate("c-4", "technology-ai", "the-hindu", 0.92), // Should be capped from core
      makeCandidate("c-5", "india", "ndtv", 0.85),
      makeCandidate("c-6", "business-economy", "mint", 0.84),
      makeCandidate("c-7", "sports", "indian-express", 0.83),
      makeCandidate("c-8", "technology-ai", "pti", 0.82),
      makeCandidate("c-9", "science-health-climate", "ani", 0.81),
      makeCandidate("c-10", "policy-geopolitics", "pib", 0.8),
    ];

    const result = composeEditionCandidates(candidates, {
      coreStoryCount: 8,
      maxCoreStoriesPerPrimaryPublisher: 2,
    });

    expect(result.coreCandidates.length).toBe(8);
    const hinduCore = result.coreCandidates.filter(
      (c) => c.primarySourceId === "the-hindu",
    );
    expect(hinduCore.length).toBe(2);
  });
});
