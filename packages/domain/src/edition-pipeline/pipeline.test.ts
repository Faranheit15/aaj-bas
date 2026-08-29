import { describe, expect, it } from "vitest";
import type { RawFeedItem } from "../feed-normalization";
import { GOLDEN_PROMPT_DATASET_FULL } from "../summarization";
import { editorialDateInIndia, generateDraftEditionPipeline } from "./pipeline";

describe("editorialDateInIndia", () => {
  it("uses the Asia/Kolkata calendar date around UTC midnight", () => {
    expect(editorialDateInIndia(new Date("2026-08-21T18:45:00.000Z"))).toBe(
      "2026-08-22",
    );
  });
});

describe("Draft edition generation pipeline (AB-701)", () => {
  it("orchestrates full 10-stage pipeline and produces valid draft edition", async () => {
    const normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );

    const result = await generateDraftEditionPipeline({
      date: "2026-08-22",
      normalizedItems,
    });

    expect(result.edition.date).toBe("2026-08-22");
    expect(result.edition.status).toBe("draft");
    expect(result.edition.schemaVersion).toBe(1);
    expect(result.edition.editionVersion).toBe(1);

    // Exactly 8 core stories
    expect(result.edition.coreStoryIds).toHaveLength(8);
    expect(result.diagnostics.coreStoriesCount).toBe(8);

    // Topic pools has candidate stories
    expect(result.edition.stories.length).toBeGreaterThan(8);
    expect(result.diagnostics.poolStoriesCount).toBeGreaterThan(0);

    // Diversity: distinct publishers in core and pool
    expect(result.diagnostics.distinctPublishersCount).toBeGreaterThanOrEqual(
      2,
    );

    // Referential integrity: every story in coreStoryIds is in stories
    for (const coreId of result.edition.coreStoryIds) {
      expect(result.edition.stories.some((s) => s.id === coreId)).toBe(true);
    }

    // Referential integrity: every cited sourceId exists in edition.sources
    const knownSourceIds = new Set(result.edition.sources.map((s) => s.id));
    for (const story of result.edition.stories) {
      for (const src of story.sourceIds) {
        expect(knownSourceIds.has(src)).toBe(true);
      }
    }

    // Factual support and edition validation
    expect(result.factualReport.passed).toBe(true);
    expect(
      result.editionValidation.findings.filter(
        (f) => f.severity === "blocking",
      ),
    ).toEqual([]);
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.isPublishable).toBe(true);

    // Markdown summary preview contains required sections
    expect(result.summaryMarkdown).toContain(
      "# 🗞️ Aaj, Bas. Daily Edition Draft: 2026-08-22",
    );
    expect(result.summaryMarkdown).toContain(
      "## 📊 Edition Composition & Diversity Overview",
    );
    expect(result.summaryMarkdown).toContain(
      "## 📑 Core Edition Stories (Top 8)",
    );
    expect(result.summaryMarkdown).toContain(
      "## ⚖️ Candidate Selection & Ranking Rationale",
    );
    expect(result.summaryMarkdown).toContain(
      "## 🛡️ Factual Support Validation & Hallucination Containment",
    );
    expect(result.summaryMarkdown).toContain(
      "## 📖 Story Previews for Human Reviewers",
    );
  });

  it("handles custom date and preserves draft status", async () => {
    const normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );

    const result = await generateDraftEditionPipeline({
      date: "2026-09-01",
      normalizedItems,
    });

    expect(result.edition.date).toBe("2026-09-01");
    expect(result.edition.status).toBe("draft");
  });

  it("ingests from rawItemsBySource with HTML sanitization", async () => {
    const rawRssItems = [
      {
        guid: "rss-1",
        title: "Test Headline with <b>HTML</b> &amp; Entities",
        description:
          "<p>The council passed a <strong>new policy</strong> on Tuesday.</p><script>alert(1)</script>",
        link: "https://example.com/story-1?utm_source=rss",
        publishedAt: "2026-08-22T08:00:00.000Z",
      },
    ];

    const rawMap = new Map([["src-custom-news", rawRssItems]]);

    const result = await generateDraftEditionPipeline({
      date: "2026-08-22",
      rawItemsBySource: rawMap,
    });

    expect(result.diagnostics.totalRawItems).toBe(1);
    expect(result.hasBlockingIssues).toBe(true); // only 1 story, so fewer than 8 core stories
  });

  it("reports blocking issues cleanly when insufficient stories are provided without crashing", async () => {
    const result = await generateDraftEditionPipeline({
      date: "2026-08-22",
      normalizedItems: [],
      ingestionDiagnostics: {
        fixtureMode: false,
        totalActiveSources: 0,
        successfulSources: 0,
        notModifiedSources: 0,
        failedSources: 0,
        totalParsedItems: 0,
        sources: [],
      },
    });

    expect(result.hasBlockingIssues).toBe(true);
    expect(result.isPublishable).toBe(false);
    expect(result.edition.coreStoryIds).toHaveLength(0);
    expect(result.summaryMarkdown).toContain("⚠️ REQUIRES EDITORIAL ATTENTION");
    expect(result.summaryMarkdown).toContain(
      "## 📡 Source Ingestion Diagnostics",
    );
    expect(result.summaryMarkdown).toContain(
      "0 active production sources configured in registry",
    );
    expect(result.summaryMarkdown).toContain(
      "## 🚨 Edition Validation & Integrity Findings",
    );
  });

  it("ingests distinct active source items across beats into candidate clustering, ranking, and draft generation", async () => {
    const beats = [
      {
        title: "Parliament Passes Clean Air Standards Bill 2026",
      },
      {
        title: "RBI Monetary Policy Committee Holds Benchmark Repo Rate",
      },
      {
        title: "Global Climate Summit Concludes with Loss and Damage Treaty",
      },
      {
        title: "ISRO Space Mission Completes Pre-Launch Satellite Tests",
      },
      {
        title: "Universal Immunization Health Program Expands Vaccine Drive",
      },
      {
        title: "National Quantum Mission Telecom Hub Inaugurated",
      },
      {
        title: "Supreme Court Guidelines Clarify Digital Evidence Rules",
      },
      {
        title: "National Athletics Championship Sports Meet Concludes",
      },
      {
        title: "Direct Tax Collections and GDP Revenue Grow Strongly",
      },
      {
        title: "Semiconductor Silicon Hardware Fab Construction Commences",
      },
      {
        title: "United Nations Security Council World Peace Resolution Passed",
      },
    ];

    const rawItemsBySource = new Map<string, RawFeedItem[]>();

    beats.forEach((b, idx) => {
      const sourceId = `src-publisher-${idx + 1}`;
      rawItemsBySource.set(sourceId, [
        {
          guid: `story-guid-${idx + 1}`,
          title: b.title,
          description: `Detailed reporting on ${b.title.toLowerCase()} from accredited correspondents.`,
          link: `https://publisher-${idx + 1}.example.in/story-${idx + 1}`,
          publishedAt: "2026-08-29T06:00:00Z",
        },
      ]);
    });

    const result = await generateDraftEditionPipeline({
      date: "2026-08-29",
      rawItemsBySource,
      rankingOptions: {
        maxCoreStoriesPerTopic: 8,
      },
    });

    expect(result.diagnostics.totalRawItems).toBe(11);
    expect(result.diagnostics.totalNormalizedItems).toBe(11);
    expect(result.edition.coreStoryIds).toHaveLength(8);
    expect(result.diagnostics.coreStoriesCount).toBe(8);
    expect(result.diagnostics.distinctPublishersCount).toBeGreaterThanOrEqual(
      6,
    );
    expect(result.factualReport.passed).toBe(true);
    expect(result.isPublishable).toBe(true);
  });
});
