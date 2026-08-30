import { describe, expect, it } from "vitest";
import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { sourceRegistrySchema } from "../source-registry";
import {
  applyReviewedReportingType,
  clusterForGeneratedSummary,
  sourceIdsPermittingUse,
  sourcePermitsUse,
} from "./source-policy";

function registry() {
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
          "The headline may be reused and the supplied description may inform a generated summary with attribution.",
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

function cluster(): StoryCluster {
  return {
    id: "cluster-policy",
    primaryItem: {
      sourceId: "headline-only",
      guid: "headline-guid",
      title: "A policy change reaches local councils",
      description:
        "This description must not cross the headline-only source boundary.",
      url: "https://headline-only.example/story",
      publishedAt: "2026-08-22T08:00:00.000Z",
      updatedAt: null,
      contentHash: "headline-hash",
    },
    items: [
      {
        sourceId: "headline-only",
        guid: "headline-guid",
        title: "A policy change reaches local councils",
        description:
          "This description must not cross the headline-only source boundary.",
        url: "https://headline-only.example/story",
        publishedAt: "2026-08-22T08:00:00.000Z",
        updatedAt: null,
        contentHash: "headline-hash",
      },
      {
        sourceId: "summary-source",
        guid: "summary-guid",
        title: "Councils prepare for the policy change",
        description:
          "The supplied description may be used because this source permits it.",
        url: "https://summary-source.example/story",
        publishedAt: "2026-08-22T09:00:00.000Z",
        updatedAt: null,
        contentHash: "summary-hash",
      },
    ],
    sourceCount: 2,
    sources: ["headline-only", "summary-source"],
    representativeTitle: "A policy change reaches local councils",
    cleanedTitle: "A policy change reaches local councils",
    confidenceScore: 0.9,
    mergeReasons: [],
    firstPublishedAt: "2026-08-22T08:00:00.000Z",
    lastPublishedAt: "2026-08-22T09:00:00.000Z",
  };
}

describe("summarization source-use policy", () => {
  it("labels stories that cite only official reviewed sources as official", () => {
    const officialRegistry = sourceRegistrySchema.parse({
      schemaVersion: 1,
      sources: [
        {
          ...registry().sources[0],
          id: "official-source",
          sourceType: "official",
        },
      ],
    });
    const story: Story = {
      id: "story-official",
      slug: "india-story-official",
      topic: "india",
      reportingType: "reporting",
      headline: "An official statement announces a policy change",
      deck: "The reviewed official source has issued a statement.",
      whatChanged: ["The official source announced a policy change today."],
      whyItMatters: "The statement may affect the public policy process.",
      sourceIds: ["official-source"],
      sourceCount: 1,
      confidence: "single-source",
      firstPublishedAt: "2026-08-22T08:00:00.000Z",
      updatedAt: "2026-08-22T08:00:00.000Z",
      reviewed: false,
    };

    expect(
      applyReviewedReportingType(story, officialRegistry).reportingType,
    ).toBe("official");
  });

  it("answers permissions from the validated registry and preserves source order", () => {
    const parsed = registry();

    expect(sourcePermitsUse("headline-only", "headline", parsed)).toBe(true);
    expect(
      sourcePermitsUse("headline-only", "supplied-description", parsed),
    ).toBe(false);
    expect(
      sourceIdsPermittingUse(
        ["summary-source", "headline-only", "summary-source"],
        "generated-summary",
        parsed,
      ),
    ).toEqual(["summary-source"]);
  });

  it("removes sources that cannot contribute to a generated summary", () => {
    const filtered = clusterForGeneratedSummary(cluster(), registry());

    expect(filtered).toBeDefined();
    expect(filtered?.sources).toEqual(["summary-source"]);
    expect(filtered?.items.map((item) => item.sourceId)).toEqual([
      "summary-source",
    ]);
    expect(filtered?.primaryItem.sourceId).toBe("summary-source");
    expect(filtered?.firstPublishedAt).toBe("2026-08-22T09:00:00.000Z");
    expect(filtered?.lastPublishedAt).toBe("2026-08-22T09:00:00.000Z");
  });

  it("returns no generated-summary input when every source is denied", () => {
    const denied = sourceRegistrySchema.parse({
      schemaVersion: 1,
      sources: [
        {
          ...registry().sources[0],
          id: "headline-only",
        },
      ],
    });

    expect(clusterForGeneratedSummary(cluster(), denied)).toBeUndefined();
  });
});
