import { describe, expect, it } from "vitest";
import type { StoryCluster } from "../clustering";
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
});
