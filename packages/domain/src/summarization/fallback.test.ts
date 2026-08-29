import { describe, expect, it } from "vitest";
import { storySchema } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { DeterministicFallbackSummarizer } from "./fallback";

describe("DeterministicFallbackSummarizer", () => {
  const summarizer = new DeterministicFallbackSummarizer();

  function makeMockCluster(
    id: string,
    title: string,
    description: string,
    sources: string[],
    publishedAt = "2026-08-22T10:00:00.000Z",
  ): StoryCluster {
    return {
      id,
      primaryItem: {
        sourceId: sources[0] ?? "source-1",
        guid: `g-${id}`,
        title,
        description,
        url: `https://example.com/${id}`,
        publishedAt,
        updatedAt: null,
        contentHash: `hash-${id}`,
      },
      items: sources.map((s, idx) => ({
        sourceId: s,
        guid: `g-${id}-${idx}`,
        title,
        description,
        url: `https://example.com/${id}/${idx}`,
        publishedAt,
        updatedAt: null,
        contentHash: `hash-${id}-${idx}`,
      })),
      sourceCount: sources.length,
      sources,
      representativeTitle: title,
      cleanedTitle: title,
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: publishedAt,
      lastPublishedAt: publishedAt,
    };
  }

  it("generates a valid single-source draft Story matching schema", async () => {
    const cluster = makeMockCluster(
      "c-rbi",
      "RBI keeps repo rate unchanged at 6.5%",
      "The Reserve Bank of India decided to keep the benchmark policy repo rate unchanged at 6.5 percent today.",
      ["the-hindu"],
    );

    const result = await summarizer.summarize({
      cluster,
      topic: "business-economy",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.story.confidence).toBe("single-source");
    expect(result.story.sourceCount).toBe(1);
    expect(result.story.sourceIds).toEqual(["the-hindu"]);

    // Schema validation
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("generates a valid multi-source draft Story matching schema", async () => {
    const cluster = makeMockCluster(
      "c-isro",
      "ISRO launches navigation satellite NVS-02 successfully into orbit",
      "Indian Space Research Organisation successfully launched the second-generation navigation satellite from Sriharikota.",
      ["pti", "the-hindu", "indian-express"],
    );

    const result = await summarizer.summarize({
      cluster,
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.story.confidence).toBe("multi-source");
    expect(result.story.sourceCount).toBe(3);
    expect(result.story.sourceIds).toEqual([
      "pti",
      "the-hindu",
      "indian-express",
    ]);

    // Schema validation
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("handles missing/short descriptions safely by padding context", async () => {
    const cluster = makeMockCluster(
      "c-short",
      "Supreme Court passes environmental order",
      "", // empty description
      ["the-hindu"],
    );

    const result = await summarizer.summarize({
      cluster,
      topic: "india",
      editionDate: "2026-08-22",
    });

    expect(result.story.whatChanged.length).toBeGreaterThanOrEqual(1);
    expect(result.story.whatChanged[0]?.length).toBeGreaterThanOrEqual(20);
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("safely sanitizes complex and long cluster IDs without trailing hyphens in slug", async () => {
    // A long ID that hits the 60-char slug boundary right at a hyphen
    const cluster = makeMockCluster(
      "isro-launches-navigation-satellite-second-generation-constellation-mission",
      "ISRO launches satellite mission",
      "Valid description exceeding twenty characters for schema conformance.",
      ["pti"],
    );

    const result = await summarizer.summarize({
      cluster,
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.story.slug.length).toBeLessThanOrEqual(60);
    expect(result.story.slug).not.toMatch(/-$/);
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });
});
