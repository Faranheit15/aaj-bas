import { describe, expect, it } from "vitest";
import { storySchema } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { sourceRegistrySchema } from "../source-registry";
import { DeterministicFallbackSummarizer } from "./fallback";

describe("DeterministicFallbackSummarizer", () => {
  const summarizer = new DeterministicFallbackSummarizer();

  function policyRegistry() {
    return sourceRegistrySchema.parse({
      schemaVersion: 1,
      sources: [
        {
          id: "headline-only",
          publisher: "Headline Only",
          siteUrl: "https://headline-only.example/",
          feedUrl: "https://headline-only.example/feed.xml",
          sourceType: "publisher",
          region: "india",
          language: "en",
          active: true,
          sample: false,
          termsUrl: "https://headline-only.example/terms",
          termsReviewedOn: "2026-08-22",
          termsReviewedBy: "faran",
          permittedUse:
            "Only the source headline may be reused; descriptions and generated summaries are not permitted.",
          permittedUses: ["headline"],
          attribution: "Headline Only",
        },
        {
          id: "summary-source",
          publisher: "Summary Source",
          siteUrl: "https://summary-source.example/",
          feedUrl: "https://summary-source.example/feed.xml",
          sourceType: "publisher",
          region: "india",
          language: "en",
          active: true,
          sample: false,
          termsUrl: "https://summary-source.example/terms",
          termsReviewedOn: "2026-08-22",
          termsReviewedBy: "faran",
          permittedUse:
            "The headline and supplied description may be used for a generated summary with attribution.",
          permittedUses: [
            "headline",
            "supplied-description",
            "generated-summary",
          ],
          attribution: "Summary Source",
        },
      ],
    });
  }

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

  it("handles missing/short descriptions with an honest headline-only fallback", async () => {
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
    expect(result.story.whatChanged[0]).toContain(
      "The source headline reports:",
    );
    expect(result.story.whyItMatters).toContain(
      "provided no permitted description material",
    );
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

  it("does not use a supplied description when that source lacks permission", async () => {
    const original = makeMockCluster(
      "c-policy",
      "Councils prepare for a policy change",
      "This description must never appear in generated output.",
      ["headline-only", "summary-source"],
    );
    const cluster: StoryCluster = {
      ...original,
      items: original.items.map((item, index) => ({
        ...item,
        description:
          index === 0
            ? "This description must never appear in generated output."
            : "This permitted description explains the policy change for councils.",
      })),
    };

    const result = await summarizer.summarize({
      cluster,
      sourceRegistry: policyRegistry(),
      topic: "india",
      editionDate: "2026-08-22",
    });

    const storyText = [
      result.story.headline,
      result.story.deck,
      ...result.story.whatChanged,
    ].join(" ");
    expect(storyText).not.toContain("must never appear");
    expect(storyText).toContain("permitted description");
    expect(result.story.sourceIds).toEqual(["summary-source"]);
  });

  it("fails closed when no source permits generated summaries", async () => {
    const cluster = makeMockCluster(
      "c-headline-only",
      "A headline-only source reports a change",
      "A source description that cannot be reused.",
      ["headline-only"],
    );

    await expect(
      summarizer.summarize({
        cluster,
        sourceRegistry: policyRegistry(),
        topic: "india",
        editionDate: "2026-08-22",
      }),
    ).rejects.toThrow("no source permitted for generated summaries");
  });
});
