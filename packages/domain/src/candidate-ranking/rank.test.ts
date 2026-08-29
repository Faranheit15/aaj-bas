import { describe, expect, it } from "vitest";
import type { StoryCluster } from "../clustering";
import { rankAndComposeCandidates } from "./rank";

describe("rankAndComposeCandidates", () => {
  function makeMockCluster(
    id: string,
    title: string,
    sourceId: string,
    sourceCount = 1,
    publishedAt = "2026-08-22T10:00:00.000Z",
  ): StoryCluster {
    return {
      id,
      primaryItem: {
        sourceId,
        guid: `g-${id}`,
        title,
        description: `Description of ${title}`,
        url: `https://example.com/${id}`,
        publishedAt,
        updatedAt: null,
        contentHash: `hash-${id}`,
      },
      items: [
        {
          sourceId,
          guid: `g-${id}`,
          title,
          description: `Description of ${title}`,
          url: `https://example.com/${id}`,
          publishedAt,
          updatedAt: null,
          contentHash: `hash-${id}`,
        },
      ],
      sourceCount,
      sources: [sourceId],
      representativeTitle: title,
      cleanedTitle: title,
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: publishedAt,
      lastPublishedAt: publishedAt,
    };
  }

  it("handles empty input safely", () => {
    const result = rankAndComposeCandidates([]);
    expect(result.coreCandidates).toEqual([]);
    expect(result.allRanked).toEqual([]);
    expect(result.diagnostics.coreCount).toBe(0);
  });

  it("ranks multi-source and fresh Indian stories higher and forms Core edition", () => {
    const clusters: StoryCluster[] = [
      makeMockCluster(
        "c-isro",
        "ISRO launches navigation satellite NVS-02 successfully into orbit",
        "pti",
        3, // 3 sources = high corroboration
      ),
      makeMockCluster(
        "c-rbi",
        "RBI keeps repo rate unchanged at 6.5% as inflation cools",
        "the-hindu",
        2,
      ),
      makeMockCluster(
        "c-market",
        "Sensex drops 800 points as tech stocks drag markets",
        "mint",
        2,
      ),
      makeMockCluster(
        "c-cricket",
        "India defeats Australia in cricket test match",
        "indian-express",
        2,
      ),
      makeMockCluster(
        "c-ai",
        "OpenAI and Google release new semiconductor AI chip models",
        "reuters",
        2,
      ),
      makeMockCluster(
        "c-policy",
        "Global leaders sign bilateral treaty at BRICS summit",
        "pib",
        2,
      ),
      makeMockCluster(
        "c-sc",
        "Supreme Court passes landmark order on environmental conservation",
        "ani",
        2,
      ),
      makeMockCluster(
        "c-health",
        "Scientists discover new vaccine against viral infection",
        "the-hindu",
        2,
      ),
      makeMockCluster(
        "c-old-foreign",
        "Small local festival concluded in foreign town",
        "blog",
        1,
        "2026-08-10T10:00:00.000Z", // 12 days old
      ),
    ];

    const result = rankAndComposeCandidates(clusters, {
      referenceDate: "2026-08-22T12:00:00.000Z",
      coreStoryCount: 8,
    });

    expect(result.coreCandidates.length).toBe(8);
    expect(result.coreCandidates[0]?.cluster.id).toBe("c-isro");
    expect(
      result.coreCandidates.every((c) => c.decision === "selected_core"),
    ).toBe(true);

    // Diagnostics verify distinct publishers and core count
    expect(result.diagnostics.coreCount).toBe(8);
    expect(result.diagnostics.distinctPublishersInCore).toBeGreaterThanOrEqual(
      5,
    );
  });

  it("is deterministic and produces identical rankings for shuffled inputs", () => {
    const clusters: StoryCluster[] = [
      makeMockCluster("c-1", "RBI repo rate update", "the-hindu", 2),
      makeMockCluster("c-2", "ISRO satellite launch", "pti", 3),
      makeMockCluster("c-3", "Sensex plunges 500 pts", "mint", 1),
    ];

    const fixedRef = "2026-08-22T12:00:00.000Z";
    const res1 = rankAndComposeCandidates(clusters, {
      referenceDate: fixedRef,
    });
    const res2 = rankAndComposeCandidates([...clusters].reverse(), {
      referenceDate: fixedRef,
    });

    expect(res1.coreCandidates.map((c) => c.cluster.id)).toEqual(
      res2.coreCandidates.map((c) => c.cluster.id),
    );
    expect(res1.allRanked.map((c) => c.compositeScore)).toEqual(
      res2.allRanked.map((c) => c.compositeScore),
    );
  });
});
