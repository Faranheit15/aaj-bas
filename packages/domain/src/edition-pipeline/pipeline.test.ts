import { describe, expect, it } from "vitest";
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
});
