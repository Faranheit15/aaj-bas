import { describe, expect, it } from "vitest";
import type { StoryCluster } from "../clustering";
import { sourceRegistrySchema } from "../source-registry";
import { classifyStoryTopic } from "./topic";

describe("Deterministic topic classification", () => {
  function makeCluster(title: string, description = ""): StoryCluster {
    return {
      id: "test-c",
      primaryItem: {
        sourceId: "source-1",
        guid: "g-1",
        title,
        description,
        url: "https://example.com",
        publishedAt: null,
        updatedAt: null,
        contentHash: "hash-1",
      },
      items: [
        {
          sourceId: "source-1",
          guid: "g-1",
          title,
          description,
          url: "https://example.com",
          publishedAt: null,
          updatedAt: null,
          contentHash: "hash-1",
        },
      ],
      sourceCount: 1,
      sources: ["source-1"],
      representativeTitle: title,
      cleanedTitle: title,
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: null,
      lastPublishedAt: null,
    };
  }

  it("classifies business and economy stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("Sensex drops 800 points as inflation rises"),
      ),
    ).toBe("business-economy");
  });

  it("classifies science, health and climate stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("ISRO launches navigation satellite into orbit"),
      ),
    ).toBe("science-health-climate");
  });

  it("classifies technology and AI stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("OpenAI releases new semiconductor AI computing model"),
      ),
    ).toBe("technology-ai");
  });

  it("classifies sports stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster(
          "India defeats Australia in cricket test match at Melbourne",
        ),
      ),
    ).toBe("sports");
  });

  it("classifies culture and entertainment stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("Bollywood actor wins best artist award at film festival"),
      ),
    ).toBe("culture-entertainment");
  });

  it("classifies policy and geopolitics stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("Global leaders sign bilateral treaty at BRICS summit"),
      ),
    ).toBe("policy-geopolitics");
  });

  it("classifies national Indian governance stories", () => {
    expect(
      classifyStoryTopic(
        makeCluster("Parliament passes digital governance bill in Lok Sabha"),
      ),
    ).toBe("india");
  });

  it("does not classify from a description the registry does not permit", () => {
    const cluster = makeCluster(
      "Government announces a new city measure",
      "The RBI repo rate changed after an inflation decision.",
    );
    const sourceRegistry = sourceRegistrySchema.parse({
      schemaVersion: 1,
      sources: [
        {
          id: "source-1",
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
      ],
    });

    expect(classifyStoryTopic(cluster)).toBe("business-economy");
    expect(classifyStoryTopic(cluster, sourceRegistry)).toBe("india");
  });
});
