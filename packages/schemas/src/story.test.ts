import { describe, expect, it } from "vitest";
import { storySchema } from "./story";

function validStory(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "story-rbi-rate-hold",
    slug: "rbi-holds-repo-rate",
    topic: "business-economy",
    reportingType: "reporting",
    headline: "RBI holds the repo rate at 6.5% for a fourth meeting",
    deck: "The central bank kept its benchmark rate unchanged on Wednesday.",
    whatChanged: [
      "The Monetary Policy Committee voted to keep the repo rate at 6.5%.",
      "The stance stays at withdrawal of accommodation, unchanged since June.",
    ],
    whyItMatters:
      "Home and business loan rates track the repo rate, so borrowing costs stay where they are for now.",
    sourceIds: ["src-the-hindu-rbi", "src-mint-rbi"],
    sourceCount: 2,
    confidence: "multi-source",
    firstPublishedAt: "2026-08-13T10:00:00+05:30",
    updatedAt: "2026-08-13T10:00:00+05:30",
    reviewed: true,
    ...overrides,
  };
}

describe("storySchema", () => {
  it("accepts a story with only the required fields", () => {
    expect(storySchema.safeParse(validStory()).success).toBe(true);
  });

  it("accepts the optional fields", () => {
    expect(
      storySchema.safeParse(
        validStory({
          background:
            "The committee has held the rate since the tightening cycle ended.",
          uncertainty:
            "Two members' dissent notes have not been published in full.",
          generatedBy: "workers-ai/llama-3.1-8b",
          promptVersion: "summarize-v1",
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects an unknown reporting type", () => {
    expect(
      storySchema.safeParse(validStory({ reportingType: "explainer" })).success,
    ).toBe(false);
  });

  it("accepts every declared reporting type", () => {
    for (const reportingType of [
      "reporting",
      "analysis",
      "opinion",
      "official",
      "research",
    ]) {
      expect(storySchema.safeParse(validStory({ reportingType })).success).toBe(
        true,
      );
    }
  });

  it("rejects an unknown topic", () => {
    expect(storySchema.safeParse(validStory({ topic: "crypto" })).success).toBe(
      false,
    );
  });

  it("rejects a source count that disagrees with the sources listed", () => {
    // The collapsed card shows "3 sources" from this number. A story that
    // claims more support than it lists is overstated on the surface a reader
    // uses to judge it.
    const result = storySchema.safeParse(validStory({ sourceCount: 3 }));
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "sourceCount is 3 but 2 sources are listed",
    );
  });

  it("rejects a repeated source", () => {
    expect(
      storySchema.safeParse(
        validStory({
          sourceIds: ["src-the-hindu-rbi", "src-the-hindu-rbi"],
          sourceCount: 2,
        }),
      ).success,
    ).toBe(false);
  });

  it("requires single-source stories to list exactly one source", () => {
    expect(
      storySchema.safeParse(validStory({ confidence: "single-source" }))
        .success,
    ).toBe(false);
    expect(
      storySchema.safeParse(
        validStory({
          confidence: "single-source",
          sourceIds: ["src-the-hindu-rbi"],
          sourceCount: 1,
        }),
      ).success,
    ).toBe(true);
  });

  it("requires multi-source and disputed stories to list at least two", () => {
    for (const confidence of ["multi-source", "disputed"]) {
      expect(
        storySchema.safeParse(
          validStory({
            confidence,
            sourceIds: ["src-the-hindu-rbi"],
            sourceCount: 1,
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("requires at least one source", () => {
    expect(
      storySchema.safeParse(validStory({ sourceIds: [], sourceCount: 0 }))
        .success,
    ).toBe(false);
  });

  it("requires at least one what-changed paragraph", () => {
    expect(storySchema.safeParse(validStory({ whatChanged: [] })).success).toBe(
      false,
    );
  });

  it("rejects an update recorded before first publication", () => {
    expect(
      storySchema.safeParse(
        validStory({ updatedAt: "2026-08-13T09:00:00+05:30" }),
      ).success,
    ).toBe(false);
  });

  it("compares timestamps as instants rather than as strings", () => {
    // Same moment, different offsets. A string comparison would call this an
    // update that precedes publication.
    expect(
      storySchema.safeParse(
        validStory({
          firstPublishedAt: "2026-08-13T10:00:00+05:30",
          updatedAt: "2026-08-13T04:30:00Z",
        }),
      ).success,
    ).toBe(true);
  });

  it("requires every mandatory field", () => {
    for (const field of [
      "id",
      "slug",
      "topic",
      "reportingType",
      "headline",
      "deck",
      "whatChanged",
      "whyItMatters",
      "sourceIds",
      "sourceCount",
      "confidence",
      "firstPublishedAt",
      "updatedAt",
      "reviewed",
    ]) {
      const story = validStory();
      delete story[field];
      expect(storySchema.safeParse(story).success).toBe(false);
    }
  });
});

function issueMessages(result: {
  success: boolean;
  error?: { issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.message);
}
