import { describe, expect, it } from "vitest";
import { storySchema } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { sourceRegistrySchema } from "../source-registry";
import {
  SUMMARIZE_PROMPT_VERSION,
  compileSummarizePrompt,
  convertPromptResultToStory,
  parsePromptSummaryResult,
} from "./prompt";
import type { StorySummarizerInput } from "./types";

describe("Prompt compilation, output schema, and sentence source mappings", () => {
  function makeMockInput(sources: string[]): StorySummarizerInput {
    const cluster: StoryCluster = {
      id: "c-isro-launch",
      primaryItem: {
        sourceId: sources[0] ?? "pti",
        guid: "g-1",
        title: "ISRO launches navigation satellite NVS-02",
        description:
          "Indian Space Research Organisation launched the satellite from Sriharikota.",
        url: "https://example.com/isro",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "hash-1",
      },
      items: sources.map((s, idx) => ({
        sourceId: s,
        guid: `g-${idx}`,
        title: `Headline from ${s}`,
        description: `Description from ${s} covering the launch details.`,
        url: `https://example.com/${s}`,
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: `hash-${idx}`,
      })),
      sourceCount: sources.length,
      sources,
      representativeTitle: "ISRO launches navigation satellite NVS-02",
      cleanedTitle: "ISRO launches navigation satellite NVS-02",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      lastPublishedAt: "2026-08-22T10:00:00.000Z",
    };

    return {
      cluster,
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    };
  }

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

  it("compiles valid system and user prompt with allowed source IDs", () => {
    const input = makeMockInput(["pti", "the-hindu"]);
    const prompt = compileSummarizePrompt(input);

    expect(prompt.system).toContain("CRITICAL CONSTRAINTS");
    expect(prompt.system).toContain("whatChanged");
    expect(prompt.user).toContain("VALID_SOURCE_IDS: [pti, the-hindu]");
    expect(prompt.user).toContain("ISRO launches navigation satellite NVS-02");
    expect(prompt.user).toContain(
      `promptVersion "${SUMMARIZE_PROMPT_VERSION}"`,
    );
  });

  it("omits descriptions and source IDs that the registry does not permit", () => {
    const input = {
      ...makeMockInput(["headline-only", "summary-source"]),
      sourceRegistry: policyRegistry(),
    };
    const prompt = compileSummarizePrompt(input);

    expect(prompt.user).toContain("VALID_SOURCE_IDS: [summary-source]");
    expect(prompt.user).not.toContain("Description from headline-only");
    expect(prompt.user).not.toContain("[SOURCE: headline-only");
    expect(prompt.user).toContain(
      "Description from summary-source covering the launch details.",
    );
  });

  it("successfully parses valid source-mapped JSON result", () => {
    const validJson = JSON.stringify({
      headline: "ISRO launches navigation satellite NVS-02 into orbit",
      deck: "Second-generation navigation satellite expands India's regional positioning capability.",
      whatChanged: [
        {
          sentence:
            "ISRO successfully launched the NVS-02 satellite from the Satish Dhawan Space Centre on Saturday.",
          sourceIds: ["pti"],
        },
        {
          sentence:
            "The 2,232-kilogram satellite was placed accurately into geosynchronous transfer orbit.",
          sourceIds: ["pti", "the-hindu"],
        },
      ],
      whyItMatters:
        "The mission upgrades India's NavIC regional positioning system with an indigenous atomic clock.",
      reportingType: "reporting",
      background:
        "NavIC provides positioning services over India and up to 1,500 km beyond its borders.",
      uncertainty: null,
      extractedFacts: {
        namedEntities: [
          "ISRO",
          "NVS-02",
          "NavIC",
          "Satish Dhawan Space Centre",
        ],
        dates: ["2026-08-22", "Saturday"],
        numbers: ["2,232", "1,500"],
      },
    });

    const parsed = parsePromptSummaryResult(validJson, ["pti", "the-hindu"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.headline).toBe(
        "ISRO launches navigation satellite NVS-02 into orbit",
      );
      expect(parsed.result.whatChanged.length).toBe(2);
      expect(parsed.result.extractedFacts.namedEntities).toContain("ISRO");
    }
  });

  it("strips markdown code blocks prior to parsing", () => {
    const wrappedJson = [
      "```json",
      JSON.stringify({
        headline: "ISRO launches navigation satellite NVS-02 into orbit",
        deck: "Second-generation navigation satellite expands regional capability.",
        whatChanged: [
          {
            sentence:
              "ISRO successfully launched the NVS-02 satellite from Sriharikota.",
            sourceIds: ["pti"],
          },
        ],
        whyItMatters:
          "The mission upgrades NavIC positioning system with atomic clock technology.",
        reportingType: "reporting",
        extractedFacts: {
          namedEntities: ["ISRO"],
          dates: [],
          numbers: [],
        },
      }),
      "```",
    ].join("\n");

    const parsed = parsePromptSummaryResult(wrappedJson, ["pti"]);
    expect(parsed.ok).toBe(true);
  });

  it("rejects response when a sentence cites an unknown source ID", () => {
    const invalidSourceJson = JSON.stringify({
      headline: "ISRO launches navigation satellite NVS-02 into orbit",
      deck: "Second-generation navigation satellite expands regional capability.",
      whatChanged: [
        {
          sentence:
            "ISRO successfully launched the NVS-02 satellite from Sriharikota.",
          sourceIds: ["unknown-source-id"], // Not in allowed sources
        },
      ],
      whyItMatters: "The mission upgrades NavIC positioning system.",
      reportingType: "reporting",
    });

    const parsed = parsePromptSummaryResult(invalidSourceJson, [
      "pti",
      "the-hindu",
    ]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("Unknown source ID cited");
    }
  });

  it("rejects response when a sentence has empty source citations", () => {
    const missingSourceJson = JSON.stringify({
      headline: "ISRO launches navigation satellite NVS-02 into orbit",
      deck: "Second-generation navigation satellite expands regional capability.",
      whatChanged: [
        {
          sentence:
            "ISRO successfully launched the NVS-02 satellite from Sriharikota.",
          sourceIds: [], // Empty sourceIds
        },
      ],
      whyItMatters: "The mission upgrades NavIC positioning system.",
      reportingType: "reporting",
    });

    const parsed = parsePromptSummaryResult(missingSourceJson, ["pti"]);
    expect(parsed.ok).toBe(false);
  });

  it("converts PromptSummaryResult into valid Story matching schema with promptVersion", () => {
    const input = makeMockInput(["pti", "the-hindu"]);
    const promptResult = {
      headline: "ISRO launches navigation satellite NVS-02 into orbit",
      deck: "Second-generation navigation satellite expands India's regional positioning capability.",
      whatChanged: [
        {
          sentence:
            "ISRO successfully launched the NVS-02 satellite from Sriharikota on Saturday.",
          sourceIds: ["pti"],
        },
        {
          sentence:
            "The satellite was placed accurately into transfer orbit with atomic clock technology.",
          sourceIds: ["the-hindu"],
        },
      ],
      whyItMatters:
        "The mission strengthens India's NavIC constellation for civil and defense navigation.",
      background:
        "Phase 1 deployed seven satellites across regional orbits since 2013.",
      uncertainty: undefined,
      reportingType: "reporting" as const,
      extractedFacts: {
        namedEntities: ["ISRO", "NavIC"],
        dates: ["2026-08-22"],
        numbers: ["2013"],
      },
    };

    const story = convertPromptResultToStory(
      promptResult,
      input,
      "@cf/meta/llama-3.1-8b-instruct",
    );

    expect(story.headline).toBe(promptResult.headline);
    expect(story.promptVersion).toBe("summarize-v1");
    expect(story.generatedBy).toBe("@cf/meta/llama-3.1-8b-instruct");
    expect(story.confidence).toBe("multi-source");
    expect(story.sourceCount).toBe(2);
    expect(story.sourceIds).toEqual(["pti", "the-hindu"]);
    expect(() => storySchema.parse(story)).not.toThrow();
  });

  it("drops unauthorized source citations before building a generated Story", () => {
    const input = {
      ...makeMockInput(["headline-only", "summary-source"]),
      sourceRegistry: policyRegistry(),
    };
    const story = convertPromptResultToStory(
      {
        headline: "Councils prepare for a policy change",
        deck: "The permitted source describes preparation for a policy change.",
        whatChanged: [
          {
            sentence:
              "Councils are preparing for the policy change described by the source.",
            sourceIds: ["headline-only", "summary-source"],
          },
        ],
        whyItMatters:
          "The change may affect how councils plan their upcoming work.",
        reportingType: "reporting",
        extractedFacts: {
          namedEntities: ["Councils"],
          dates: [],
          numbers: [],
        },
      },
      input,
      "model-v1",
    );

    expect(story.sourceIds).toEqual(["summary-source"]);
  });
});
