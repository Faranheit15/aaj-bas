import { describe, expect, it } from "vitest";
import type { Edition } from "@aaj-bas/schemas";
import { convertDraftToPublished } from "./publish";

describe("Edition publish workflow (AB-703)", () => {
  const sampleDraft: Edition = {
    schemaVersion: 1,
    date: "2026-08-29",
    editionVersion: 1,
    status: "draft",
    publishedAt: "2026-08-29T06:00:00.000Z",
    updatedAt: "2026-08-29T06:00:00.000Z",
    estimatedMinutes: 5,
    coreStoryIds: ["story-1"],
    interestPools: {},
    stories: [
      {
        id: "story-1",
        slug: "story-1-headline",
        headline: "A verified news headline for today",
        deck: "Short deck summarizing the key development clearly.",
        topic: "india",
        reportingType: "reporting",
        confidence: "multi-source",
        whatChanged: ["Paragraph describing the change in detail."],
        whyItMatters:
          "Paragraph explaining the broader context and importance.",
        sourceCount: 2,
        sourceIds: ["source-1", "source-2"],
        firstPublishedAt: "2026-08-29T06:00:00.000Z",
        updatedAt: "2026-08-29T06:00:00.000Z",
        reviewed: false,
      },
    ],
    sources: [
      {
        id: "source-1",
        publisher: "The Hindu",
        title: "Original report title",
        url: "https://example.com/thehindu/1",
        sourceType: "publisher",
        publishedAt: "2026-08-29T05:00:00.000Z",
      },
      {
        id: "source-2",
        publisher: "Indian Express",
        title: "Second report title",
        url: "https://example.com/indianexpress/1",
        sourceType: "publisher",
        publishedAt: "2026-08-29T05:30:00.000Z",
      },
    ],
    correctionNotes: [],
  };

  it("converts draft edition to published with human review status", () => {
    const customTimestamp = "2026-08-29T07:00:00.000Z";
    const published = convertDraftToPublished(sampleDraft, {
      timestamp: customTimestamp,
    });

    expect(published.status).toBe("published");
    expect(published.stories[0]?.reviewed).toBe(true);
    expect(published.updatedAt).toBe(customTimestamp);
    expect(published.stories[0]?.updatedAt).toBe(customTimestamp);
  });

  it("rejects non-draft edition inputs", () => {
    const alreadyPublished: Edition = {
      ...sampleDraft,
      status: "published",
    };
    expect(() => convertDraftToPublished(alreadyPublished)).toThrow(
      /Cannot publish edition: expected status to be 'draft'/,
    );
  });

  it("rejects drafts carrying correction notes", () => {
    const draftWithCorrections: Edition = {
      ...sampleDraft,
      correctionNotes: [
        {
          id: "corr-1",
          storyId: "story-1",
          correctedAt: "2026-08-29T07:00:00.000Z",
          summary: "Fixed typo",
        },
      ],
    };
    expect(() => convertDraftToPublished(draftWithCorrections)).toThrow(
      /draft cannot carry correction notes/,
    );
  });

  it("rejects drafts with editionVersion !== 1", () => {
    const draftV2: Edition = {
      ...sampleDraft,
      editionVersion: 2,
    };
    expect(() => convertDraftToPublished(draftV2)).toThrow(
      /draft must be editionVersion 1/,
    );
  });
});
