import { describe, expect, it } from "vitest";
import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import {
  validateFactualSupport,
  validateStoryFactualSupport,
} from "./validator";

describe("validateStoryFactualSupport and validateFactualSupport", () => {
  function makeMockCluster(): StoryCluster {
    return {
      id: "c-isro-launch",
      primaryItem: {
        sourceId: "pti",
        guid: "g-1",
        title: "ISRO launches NVS-02 navigation satellite",
        description: "Payload of 2,232 kg launched from Sriharikota.",
        url: "https://example.com/1",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "h-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-1",
          title: "ISRO launches NVS-02 navigation satellite",
          description: "Payload of 2,232 kg launched from Sriharikota.",
          url: "https://example.com/1",
          publishedAt: "2026-08-22T10:00:00.000Z",
          updatedAt: null,
          contentHash: "h-1",
        },
      ],
      sourceCount: 1,
      sources: ["pti"],
      representativeTitle: "ISRO launches NVS-02 navigation satellite",
      cleanedTitle: "ISRO launches NVS-02 navigation satellite",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      lastPublishedAt: "2026-08-22T10:00:00.000Z",
    };
  }

  function makeMockStory(override?: Partial<Story>): Story {
    return {
      id: "s-isro-launch",
      slug: "science-health-climate-s-isro-launch",
      topic: "science-health-climate",
      reportingType: "reporting",
      headline: "ISRO launches NVS-02 satellite into orbit",
      deck: "Navigation satellite successfully deployed from Sriharikota.",
      whatChanged: [
        "ISRO successfully launched the 2,232 kg satellite from Sriharikota.",
      ],
      whyItMatters: "Upgrades India's regional positioning capability.",
      sourceIds: ["pti"],
      sourceCount: 1,
      confidence: "single-source",
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:00.000Z",
      reviewed: false,
      ...override,
    };
  }

  it("returns passing validation result for fully grounded story", () => {
    const story = makeMockStory();
    const cluster = makeMockCluster();
    const result = validateStoryFactualSupport(story, cluster);

    expect(result.passed).toBe(true);
    expect(result.publishable).toBe(true);
    expect(result.blockingCount).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.metrics.sourceAttributionScore).toBe(1.0);
  });

  it("returns blocking failure when story contains ungrounded facts", () => {
    const story = makeMockStory({
      whatChanged: ["ISRO and NASA announced a joint $50B budget expansion."],
    });
    const cluster = makeMockCluster();
    const result = validateStoryFactualSupport(story, cluster);

    expect(result.passed).toBe(false);
    expect(result.publishable).toBe(false);
    expect(result.blockingCount).toBeGreaterThanOrEqual(1);
  });

  it("aggregates multiple stories in validateFactualSupport", () => {
    const cleanStory = makeMockStory();
    const cluster = makeMockCluster();

    const badStory = makeMockStory({
      id: "s-bad",
      whatChanged: ["999 ungrounded people visited the launch site."],
    });

    const report = validateFactualSupport([
      { story: cleanStory, cluster },
      { story: badStory, cluster },
    ]);

    expect(report.stories).toHaveLength(2);
    expect(report.passed).toBe(false);
    expect(report.publishable).toBe(false);
    expect(report.blockingCount).toBeGreaterThanOrEqual(1);
  });
});
