import { describe, expect, it } from "vitest";
import { GOLDEN_DUPLICATE_DATASET } from "../deduplication";
import type { NormalizedFeedItem } from "../feed-normalization";
import { clusterFeedItems } from "./cluster";

describe("clusterFeedItems", () => {
  it("returns empty array for empty items", () => {
    expect(clusterFeedItems([])).toEqual([]);
  });

  it("creates singleton cluster for single item", () => {
    const item: NormalizedFeedItem = {
      sourceId: "the-hindu",
      guid: "th-100",
      title: "ISRO launches navigation satellite NVS-02 successfully",
      description: "Launch report",
      url: "https://example.com/th-1",
      publishedAt: "2026-08-20T10:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-100",
    };

    const clusters = clusterFeedItems([item]);
    expect(clusters.length).toBe(1);
    const cluster = clusters[0];
    expect(cluster?.items.length).toBe(1);
    expect(cluster?.sourceCount).toBe(1);
    expect(cluster?.confidenceScore).toBe(1.0);
    expect(cluster?.representativeTitle).toBe(item.title);
  });

  it("merges syndicated wire copies into a single multi-source cluster", () => {
    const isroTest = GOLDEN_DUPLICATE_DATASET.find(
      (c) => c.id === "wire-syndication-isro",
    );
    expect(isroTest).toBeDefined();
    if (!isroTest) return;

    const clusters = clusterFeedItems([isroTest.itemA, isroTest.itemB]);
    expect(clusters.length).toBe(1);
    const cluster = clusters[0];
    expect(cluster?.items.length).toBe(2);
    expect(cluster?.sourceCount).toBe(2);
    expect(cluster?.sources).toEqual(["indian-express", "the-hindu"]);
    expect(cluster?.cleanedTitle).toContain("NVS-02");
  });

  it("merges exact URL duplicates with confidence 1.0", () => {
    const exactTest = GOLDEN_DUPLICATE_DATASET.find(
      (c) => c.id === "exact-url-match",
    );
    expect(exactTest).toBeDefined();
    if (!exactTest) return;

    const clusters = clusterFeedItems([exactTest.itemA, exactTest.itemB]);
    expect(clusters.length).toBe(1);
    expect(clusters[0]?.confidenceScore).toBe(1.0);
    expect(clusters[0]?.mergeReasons.some((r) => r.type === "exact_url")).toBe(
      true,
    );
  });

  it("keeps unrelated stories sharing entities in separate clusters", () => {
    const rbiTest = GOLDEN_DUPLICATE_DATASET.find(
      (c) => c.id === "hard-negative-rbi",
    );
    expect(rbiTest).toBeDefined();
    if (!rbiTest) return;

    const clusters = clusterFeedItems([rbiTest.itemA, rbiTest.itemB]);
    expect(clusters.length).toBe(2);
    expect(clusters[0]?.items.length).toBe(1);
    expect(clusters[1]?.items.length).toBe(1);
  });

  it("separates conflicting numbers into distinct clusters", () => {
    const numTest = GOLDEN_DUPLICATE_DATASET.find(
      (c) => c.id === "numeric-conflict-casualties",
    );
    expect(numTest).toBeDefined();
    if (!numTest) return;

    const clusters = clusterFeedItems([numTest.itemA, numTest.itemB]);
    expect(clusters.length).toBe(2);
  });

  it("prevents transitivity drift (chaining dissimilar items)", () => {
    // Story A: ISRO launches NVS-02 satellite from Sriharikota
    const storyA: NormalizedFeedItem = {
      sourceId: "source-a",
      guid: "guid-a",
      title: "ISRO launches NVS-02 navigation satellite from Sriharikota",
      description: "Launch",
      url: "https://example.com/a",
      publishedAt: "2026-08-20T10:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-a",
    };
    // Story B: ISRO launches GSAT-20 satellite from French Guiana
    const storyB: NormalizedFeedItem = {
      sourceId: "source-b",
      guid: "guid-b",
      title: "ISRO launches GSAT-20 satellite from French Guiana",
      description: "Launch",
      url: "https://example.com/b",
      publishedAt: "2026-08-20T10:30:00.000Z",
      updatedAt: null,
      contentHash: "hash-b",
    };
    // Story C: SpaceX launches Falcon 9 communication satellite from Cape Canaveral
    const storyC: NormalizedFeedItem = {
      sourceId: "source-c",
      guid: "guid-c",
      title:
        "SpaceX launches Falcon 9 communication satellite from Cape Canaveral",
      description: "Launch",
      url: "https://example.com/c",
      publishedAt: "2026-08-20T11:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-c",
    };

    const clusters = clusterFeedItems([storyA, storyB, storyC]);
    // Conflicting satellite numbers / locations should keep them separate
    expect(clusters.length).toBeGreaterThanOrEqual(2);
  });

  it("is permutation-invariant and produces identical clusters regardless of input order", () => {
    const items: NormalizedFeedItem[] = [
      {
        sourceId: "ndtv",
        guid: "ndtv-1",
        title: "LIVE: Sensex drops 800 pts dragged by IT, tech shares - NDTV",
        description: "Market",
        url: "https://example.com/ndtv-market",
        publishedAt: "2026-08-21T09:30:00.000Z",
        updatedAt: null,
        contentHash: "hash-m1",
      },
      {
        sourceId: "the-hindu",
        guid: "th-1",
        title: "ISRO launches navigation satellite NVS-02 successfully",
        description: "Space",
        url: "https://example.com/th-isro",
        publishedAt: "2026-08-20T10:00:00.000Z",
        updatedAt: null,
        contentHash: "hash-s1",
      },
      {
        sourceId: "mint",
        guid: "mint-1",
        title: "Sensex plunges 800 points as tech stocks drag markets - Mint",
        description: "Market",
        url: "https://example.com/mint-market",
        publishedAt: "2026-08-21T09:15:00.000Z",
        updatedAt: null,
        contentHash: "hash-m2",
      },
      {
        sourceId: "indian-express",
        guid: "ie-1",
        title: "ISRO successfully launches NVS-02 navigation satellite",
        description: "Space",
        url: "https://example.com/ie-isro",
        publishedAt: "2026-08-20T10:15:00.000Z",
        updatedAt: null,
        contentHash: "hash-s2",
      },
    ];

    const clustersOrder1 = clusterFeedItems(items);
    const reversedItems = [...items].reverse();
    const clustersOrder2 = clusterFeedItems(reversedItems);

    expect(clustersOrder1.length).toBe(2);
    expect(clustersOrder2.length).toBe(2);

    expect(clustersOrder1[0]?.id).toBe(clustersOrder2[0]?.id);
    expect(clustersOrder1[1]?.id).toBe(clustersOrder2[1]?.id);
    expect(clustersOrder1[0]?.items.length).toBe(
      clustersOrder2[0]?.items.length,
    );
    expect(clustersOrder1[1]?.items.length).toBe(
      clustersOrder2[1]?.items.length,
    );
  });
});
