import { describe, expect, it } from "vitest";
import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import {
  checkDateContainment,
  checkEditorialAlignment,
  checkEntityContainment,
  checkNumberContainment,
  checkSourceAttribution,
  checkUncertaintyOnConflict,
} from "./containment";

describe("Factual containment checks", () => {
  function makeMockCluster(override?: Partial<StoryCluster>): StoryCluster {
    return {
      id: "c-isro-launch",
      primaryItem: {
        sourceId: "pti",
        guid: "g-1",
        title:
          "ISRO launches NVS-02 navigation satellite with 2,232 kg payload",
        description:
          "The launch took place from Sriharikota on Saturday, August 22.",
        url: "https://example.com/1",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "h-1",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-1",
          title:
            "ISRO launches NVS-02 navigation satellite with 2,232 kg payload",
          description:
            "The launch took place from Sriharikota on Saturday, August 22.",
          url: "https://example.com/1",
          publishedAt: "2026-08-22T10:00:00.000Z",
          updatedAt: null,
          contentHash: "h-1",
        },
        {
          sourceId: "the-hindu",
          guid: "g-2",
          title: "ISRO navigation satellite NVS-02 reaches transfer orbit",
          description:
            "NavIC constellation receives boost from Sriharikota launch.",
          url: "https://example.com/2",
          publishedAt: "2026-08-22T10:30:00.000Z",
          updatedAt: null,
          contentHash: "h-2",
        },
      ],
      sourceCount: 2,
      sources: ["pti", "the-hindu"],
      representativeTitle:
        "ISRO launches NVS-02 navigation satellite with 2,232 kg payload",
      cleanedTitle:
        "ISRO launches NVS-02 navigation satellite with 2,232 kg payload",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      lastPublishedAt: "2026-08-22T10:30:00.000Z",
      ...override,
    };
  }

  function makeMockStory(override?: Partial<Story>): Story {
    return {
      id: "s-isro-launch",
      slug: "science-health-climate-s-isro-launch",
      topic: "science-health-climate",
      reportingType: "reporting",
      headline: "ISRO launches NVS-02 navigation satellite into orbit",
      deck: "Second-generation navigation satellite successfully launched from Sriharikota.",
      whatChanged: [
        "ISRO launched the 2,232 kg NVS-02 satellite from Sriharikota on Saturday.",
      ],
      whyItMatters:
        "Upgrades India's NavIC constellation with atomic clock technology.",
      sourceIds: ["pti", "the-hindu"],
      sourceCount: 2,
      confidence: "multi-source",
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:30:00.000Z",
      reviewed: false,
      ...override,
    };
  }

  describe("checkNumberContainment", () => {
    it("passes when all story numbers are grounded in cluster", () => {
      const story = makeMockStory();
      const cluster = makeMockCluster();
      const findings = checkNumberContainment(story, cluster);

      expect(findings).toHaveLength(0);
    });

    it("blocks when story introduces ungrounded numbers", () => {
      const story = makeMockStory({
        whatChanged: [
          "ISRO launched the 75 satellites with 50,000 workers present.",
        ],
      });
      const cluster = makeMockCluster();
      const findings = checkNumberContainment(story, cluster);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocking");
      expect(findings[0]?.ruleId).toBe("fact/number-containment");
      expect(findings[0]?.ungroundedTokens).toContain("75");
    });
  });

  describe("checkEntityContainment", () => {
    it("passes when all story entities exist in cluster", () => {
      const story = makeMockStory();
      const cluster = makeMockCluster();
      const findings = checkEntityContainment(story, cluster);

      expect(findings).toHaveLength(0);
    });

    it("blocks when story introduces ungrounded named entities", () => {
      const story = makeMockStory({
        headline: "NASA and European Space Agency assist ISRO launch",
      });
      const cluster = makeMockCluster();
      const findings = checkEntityContainment(story, cluster);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocking");
      expect(findings[0]?.ruleId).toBe("fact/entity-containment");
      expect(findings[0]?.ungroundedTokens).toContain("NASA");
    });
  });

  describe("checkDateContainment", () => {
    it("passes when story dates match cluster publication or text", () => {
      const story = makeMockStory();
      const cluster = makeMockCluster();
      const findings = checkDateContainment(story, cluster);

      expect(findings).toHaveLength(0);
    });
  });

  describe("checkSourceAttribution", () => {
    it("passes when all story sourceIds are in cluster", () => {
      const story = makeMockStory();
      const cluster = makeMockCluster();
      const findings = checkSourceAttribution(story, cluster);

      expect(findings).toHaveLength(0);
    });

    it("blocks when story cites unknown source ID", () => {
      const story = makeMockStory({
        sourceIds: ["unknown-source-xyz"],
      });
      const cluster = makeMockCluster();
      const findings = checkSourceAttribution(story, cluster);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocking");
      expect(findings[0]?.ruleId).toBe("fact/source-attribution");
    });
  });

  describe("checkEditorialAlignment", () => {
    it("blocks when opinion cluster is labeled as reporting", () => {
      const cluster = makeMockCluster({
        items: [
          {
            sourceId: "pti",
            guid: "g-1",
            title: "Opinion: Why space exploration matters for Indian economy",
            description: "An editorial on space policy and budget.",
            url: "https://example.com/1",
            publishedAt: "2026-08-22T10:00:00.000Z",
            updatedAt: null,
            contentHash: "h-1",
          },
        ],
      });
      const story = makeMockStory({ reportingType: "reporting" });
      const findings = checkEditorialAlignment(story, cluster);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocking");
      expect(findings[0]?.ruleId).toBe("fact/editorial-alignment");
    });
  });

  describe("checkUncertaintyOnConflict", () => {
    it("blocks when conflicting numbers exist across sources but story lacks uncertainty", () => {
      const cluster = makeMockCluster({
        items: [
          {
            sourceId: "pti",
            guid: "g-1",
            title: "Fire incident in factory: 5 workers injured in blaze",
            description: "Officials confirmed 5 casualties so far.",
            url: "https://example.com/1",
            publishedAt: "2026-08-22T10:00:00.000Z",
            updatedAt: null,
            contentHash: "h-1",
          },
          {
            sourceId: "the-hindu",
            guid: "g-2",
            title: "Fire incident in factory: 8 workers injured in blaze",
            description: "Hospital sources reported 8 casualties admitted.",
            url: "https://example.com/2",
            publishedAt: "2026-08-22T10:30:00.000Z",
            updatedAt: null,
            contentHash: "h-2",
          },
        ],
      });

      const story = makeMockStory({
        whatChanged: [
          "A fire incident in the factory left 8 workers injured on Saturday.",
        ],
        uncertainty: undefined,
        confidence: "multi-source",
      });

      const findings = checkUncertaintyOnConflict(story, cluster);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("blocking");
      expect(findings[0]?.ruleId).toBe("fact/uncertainty-on-conflict");
    });

    it("passes when conflicting numbers exist but story describes uncertainty", () => {
      const cluster = makeMockCluster({
        items: [
          {
            sourceId: "pti",
            guid: "g-1",
            title: "Fire incident in factory: 5 workers injured in blaze",
            description: "Officials confirmed 5 casualties so far.",
            url: "https://example.com/1",
            publishedAt: "2026-08-22T10:00:00.000Z",
            updatedAt: null,
            contentHash: "h-1",
          },
          {
            sourceId: "the-hindu",
            guid: "g-2",
            title: "Fire incident in factory: 8 workers injured in blaze",
            description: "Hospital sources reported 8 casualties admitted.",
            url: "https://example.com/2",
            publishedAt: "2026-08-22T10:30:00.000Z",
            updatedAt: null,
            contentHash: "h-2",
          },
        ],
      });

      const story = makeMockStory({
        whatChanged: ["A fire broke out in the factory on Saturday."],
        uncertainty:
          "Casualty counts vary between sources, with PTI reporting 5 and The Hindu reporting 8.",
        confidence: "disputed",
      });

      const findings = checkUncertaintyOnConflict(story, cluster);
      expect(findings).toHaveLength(0);
    });
  });
});
