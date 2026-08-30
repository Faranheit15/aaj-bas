import type { Edition } from "@aaj-bas/schemas";
import { describe, expect, it } from "vitest";
import type { CandidateRankingResult } from "../candidate-ranking";
import type { EditionValidation } from "../edition-validation";
import type { FactualValidationReport } from "../factual-validation";
import {
  formatSourceHealthMarkdown,
  type SourceHealthReport,
} from "../source-health";
import { composePrBody } from "./daily-draft-pr";
import { formatDraftEditionSummaryMarkdown } from "./format-summary-markdown";

describe("formatDraftEditionSummaryMarkdown & composePrBody diagnostic rendering (AB-701, AB-702)", () => {
  const dummyRankingResult: CandidateRankingResult = {
    coreCandidates: [],
    topicPools: {},
    rejectedCandidates: [],
    allRanked: [
      {
        cluster: {
          id: "cluster-1",
          primaryItem: {
            sourceId: "source-desk-daily",
            guid: "guid-1",
            title: "Major Policy Announcement",
            description: "Details on policy announcement",
            url: "https://example.com/1",
            publishedAt: "2026-08-29T06:00:00Z",
            updatedAt: null,
            contentHash: "hash-1",
          },
          representativeTitle: "Policy",
          cleanedTitle: "Major Policy Announcement",
          sourceCount: 2,
          sources: ["source-desk-daily", "source-tech-gazette"],
          items: [],
          confidenceScore: 0.95,
          mergeReasons: [{ type: "singleton" }],
          firstPublishedAt: "2026-08-29T06:00:00Z",
          lastPublishedAt: "2026-08-29T06:30:00Z",
        },
        topic: "policy-geopolitics",
        compositeScore: 0.925,
        decision: "selected_core",
        decisionReason: {
          code: "core_selection",
          details: "Highest editorial diversity score",
        },
        primarySourceId: "source-desk-daily",
        featureScores: {
          recency: 1,
          corroboration: 1,
          sourceTier: 1,
          indiaRelevance: 1,
          repetitionPenalty: 0,
          topicWeight: 1,
        },
      },
    ],
    diagnostics: {
      totalEvaluated: 1,
      coreCount: 1,
      poolCount: 0,
      distinctPublishersInCore: 1,
      topicDistributionInCore: {
        "policy-geopolitics": 1,
        "business-economy": 0,
        "science-health-climate": 0,
        "technology-ai": 0,
        sports: 0,
        "culture-entertainment": 0,
        india: 0,
        world: 0,
      },
      referenceDate: "2026-08-29T06:00:00Z",
    },
  };

  const dummyFactualReport: FactualValidationReport = {
    reportVersion: 1,
    passed: true,
    publishable: true,
    blockingCount: 0,
    warningCount: 0,
    stories: [],
  };

  const dummyEditionValidation: EditionValidation = {
    file: "content/drafts/2026-08-29.json",
    editionDate: "2026-08-29",
    publishable: true,
    findings: [],
  };

  const dummyEdition: Edition = {
    schemaVersion: 1,
    date: "2026-08-29",
    editionVersion: 1,
    status: "draft",
    publishedAt: "2026-08-29T06:00:00Z",
    updatedAt: "2026-08-29T06:30:00Z",
    estimatedMinutes: 5,
    coreStoryIds: ["story-1"],
    interestPools: {},
    stories: [
      {
        id: "story-1",
        slug: "national-quantum-hub-launch",
        headline: "National Quantum Hub Launch",
        deck: "First testbed facility opens in Bengaluru.",
        topic: "technology-ai",
        reportingType: "reporting",
        confidence: "multi-source",
        sourceCount: 2,
        sourceIds: ["source-desk-daily", "source-tech-gazette"],
        whatChanged: ["Facility inaugurated with 50-qubit capacity."],
        whyItMatters: "Accelerates commercial quantum computing access.",
        uncertainty: undefined,
        background: "Part of the National Quantum Mission.",
        firstPublishedAt: "2026-08-29T06:00:00Z",
        updatedAt: "2026-08-29T06:30:00Z",
        reviewed: true,
      },
    ],
    sources: [
      {
        id: "source-desk-daily",
        publisher: "Desk Daily",
        title: "Major Policy Announcement",
        url: "https://example.com/1",
        sourceType: "publisher",
        publishedAt: "2026-08-29T06:00:00Z",
        attribution: "Desk Daily",
      },
      {
        id: "source-tech-gazette",
        publisher: "Tech Gazette",
        title: "Major Policy Announcement",
        url: "https://example.com/2",
        sourceType: "publisher",
        publishedAt: "2026-08-29T06:00:00Z",
      },
    ],
    correctionNotes: [],
  };

  it("renders companion summary markdown with diagnostic composition table, core stories, and rationale", () => {
    const markdown = formatDraftEditionSummaryMarkdown({
      edition: dummyEdition,
      rankingResult: dummyRankingResult,
      factualReport: dummyFactualReport,
      editionValidation: dummyEditionValidation,
      ingestionDiagnostics: {
        fixtureMode: false,
        totalActiveSources: 2,
        successfulSources: 2,
        notModifiedSources: 0,
        failedSources: 0,
        totalParsedItems: 14,
        sources: [
          {
            sourceId: "source-desk-daily",
            status: "success",
            httpStatus: 200,
            itemCount: 8,
            durationMs: 120,
          },
          {
            sourceId: "source-tech-gazette",
            status: "success",
            httpStatus: 200,
            itemCount: 6,
            durationMs: 95,
          },
        ],
      },
      diagnostics: {
        editionDate: "2026-08-29",
        totalRawItems: 45,
        totalNormalizedItems: 42,
        totalClusters: 18,
        coreStoriesCount: 8,
        poolStoriesCount: 6,
        distinctPublishersCount: 7,
        durationMs: 120,
      },
    });

    // Header and badges
    expect(markdown).toContain("# 🗞️ Aaj, Bas. Daily Edition Draft: 2026-08-29");
    expect(markdown).toContain("✅ READY FOR HUMAN REVIEW");

    // Ingestion Diagnostics Table
    expect(markdown).toContain("## 📡 Source Ingestion Diagnostics");
    expect(markdown).toContain(
      "| `source-desk-daily` | ✅ Success | `200` | 8 | 120ms | None |",
    );

    // Diagnostic table
    expect(markdown).toContain(
      "## 📊 Edition Composition & Diversity Overview",
    );
    expect(markdown).toContain(
      "| **Distinct Publishers** | ≥ 6 | 7 | ✅ PASS |",
    );
    expect(markdown).toContain(
      "| **Evaluated Feed Items** | — | 42 | ℹ️ INFO |",
    );
    expect(markdown).toContain(
      "* **Attributed Sources**: `source-desk-daily` — Desk Daily, `source-tech-gazette`",
    );

    // Core stories table with source IDs
    expect(markdown).toContain("## 📑 Core Edition Stories (Top 8)");
    expect(markdown).toContain("`source-desk-daily`, `source-tech-gazette`");

    // Story Previews
    expect(markdown).toContain("### Story 1: National Quantum Hub Launch");
    expect(markdown).toContain(
      "* **Attributed Sources**: `source-desk-daily` — Desk Daily, `source-tech-gazette`",
    );
  });

  it("composes complete PR body with blocking notice banner, summary markdown, and maintainer checklist", () => {
    const summary = "## Diagnostic Summary\n\nContent details here.";
    const cleanBody = composePrBody(summary, false, "2026-08-29");

    expect(cleanBody).toContain("✅ **READY FOR EDITORIAL REVIEW**");
    expect(cleanBody).toContain("Diagnostic Summary");
    expect(cleanBody).toContain("### Publication Checklist for Maintainers");
    expect(cleanBody).toContain(
      "- [ ] Verify factual summary matches original source citations.",
    );

    const blockingBody = composePrBody(summary, true, "2026-08-29");
    expect(blockingBody).toContain("⚠️ **BLOCKING FINDINGS**");
    expect(blockingBody).toContain(
      "Human editorial review and correction are required",
    );
  });

  it("renders source health diagnostic markdown table with source IDs, statuses, and item counts", () => {
    const healthReport: SourceHealthReport = {
      reportVersion: 1,
      generatedAt: "2026-08-29T12:00:00.000Z",
      totalSources: 2,
      healthyCount: 1,
      warningCount: 0,
      failingCount: 1,
      records: [
        {
          sourceId: "source-1",
          url: "https://example.com/feed1.xml",
          status: "healthy",
          fetchKind: "success",
          httpStatus: 200,
          attempts: 1,
          redirects: 0,
          durationMs: 145,
          itemCount: 12,
          lastPublishedAt: "2026-08-29T10:00:00Z",
          warnings: [],
        },
        {
          sourceId: "source-broken",
          url: "https://example.com/broken.xml",
          status: "failing",
          fetchKind: "failure",
          httpStatus: undefined,
          attempts: 1,
          redirects: 0,
          durationMs: 10000,
          itemCount: 0,
          lastPublishedAt: null,
          errorMessage: "timeout after 10000ms",
          warnings: [],
        },
      ],
    };

    const markdown = formatSourceHealthMarkdown(healthReport);

    expect(markdown).toContain("# Source Ingestion Health Report");
    expect(markdown).toContain("### All Sources Details");
    expect(markdown).toContain(
      "| Source ID | Status | Kind | HTTP | Latency | Items | Latest Item (UTC) |",
    );
    expect(markdown).toContain(
      "| `source-1` | healthy | success | 200 | 145ms | 12 | `2026-08-29T10:00:00Z` |",
    );
    expect(markdown).toContain(
      "| `source-broken` | failing | failure | - | 10000ms | 0 | - |",
    );
  });
});
