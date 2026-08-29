import { describe, expect, it } from "vitest";
import type { NormalizedFeedItem } from "../feed-normalization";
import { clusterFeedItemsAsync } from "./cluster";
import { NoopSemanticClusteringProvider } from "./providers/noop-provider";
import type { SemanticClusteringProvider, StoryCluster } from "./types";

describe("SemanticClusteringProvider & clusterFeedItemsAsync", () => {
  const itemA: NormalizedFeedItem = {
    sourceId: "the-hindu",
    guid: "th-1",
    title: "Government unveils new solar subsidy scheme",
    description: "Solar policy details",
    url: "https://example.com/th-solar",
    publishedAt: "2026-08-20T10:00:00.000Z",
    updatedAt: null,
    contentHash: "hash-solar-1",
  };

  const itemB: NormalizedFeedItem = {
    sourceId: "mint",
    guid: "mint-1",
    title: "Centre expands PM Surya Ghar rooftop solar program",
    description: "Solar rooftop expansion",
    url: "https://example.com/mint-solar",
    publishedAt: "2026-08-20T11:00:00.000Z",
    updatedAt: null,
    contentHash: "hash-solar-2",
  };

  it("NoopSemanticClusteringProvider returns shouldMerge: false", async () => {
    const provider = new NoopSemanticClusteringProvider();
    expect(provider.name).toBe("noop");
    const decision = await provider.evaluateCandidateMerge(
      {} as StoryCluster,
      {} as StoryCluster,
    );
    expect(decision.shouldMerge).toBe(false);
    expect(decision.confidence).toBe(0.0);
  });

  it("merges clusters when custom semantic provider confirms high confidence merge", async () => {
    const mockProvider: SemanticClusteringProvider = {
      name: "mock-llm",
      async evaluateCandidateMerge() {
        return {
          shouldMerge: true,
          confidence: 0.95,
          reason: "Both headlines report the same solar scheme initiative",
        };
      },
    };

    const clusters = await clusterFeedItemsAsync([itemA, itemB], {
      semanticProvider: mockProvider,
      semanticThreshold: 0.8,
    });

    expect(clusters.length).toBe(1);
    const cluster = clusters[0];
    expect(cluster?.items.length).toBe(2);
    expect(
      cluster?.mergeReasons.some((r) => r.type === "semantic_similarity"),
    ).toBe(true);
  });

  it("keeps clusters separate if semantic provider throws error", async () => {
    const failingProvider: SemanticClusteringProvider = {
      name: "failing-provider",
      async evaluateCandidateMerge() {
        throw new Error("API rate limit exceeded");
      },
    };

    const clusters = await clusterFeedItemsAsync([itemA, itemB], {
      semanticProvider: failingProvider,
    });

    expect(clusters.length).toBe(2);
  });
});
