/**
 * Format companion Markdown summary for draft edition artifacts and pull request descriptions.
 */

import type { Edition } from "@aaj-bas/schemas";
import type { CandidateRankingResult } from "../candidate-ranking";
import type { EditionValidation } from "../edition-validation";
import type { FactualValidationReport } from "../factual-validation";
import { formatFactualValidationMarkdown } from "../factual-validation";

export interface FormatSummaryMarkdownOptions {
  readonly edition: Edition;
  readonly rankingResult: CandidateRankingResult;
  readonly factualReport: FactualValidationReport;
  readonly editionValidation: EditionValidation;
  readonly diagnostics: {
    readonly editionDate: string;
    readonly totalRawItems: number;
    readonly totalNormalizedItems: number;
    readonly totalClusters: number;
    readonly coreStoriesCount: number;
    readonly poolStoriesCount: number;
    readonly distinctPublishersCount: number;
    readonly durationMs: number;
  };
}

export function formatDraftEditionSummaryMarkdown(
  options: FormatSummaryMarkdownOptions,
): string {
  const {
    edition,
    rankingResult,
    factualReport,
    editionValidation,
    diagnostics,
  } = options;

  const coreStories = edition.stories.filter((s) =>
    edition.coreStoryIds.includes(s.id),
  );
  const poolStories = edition.stories.filter(
    (s) => !edition.coreStoryIds.includes(s.id),
  );

  const hasBlockingValidationFindings = editionValidation.findings.some(
    (f) => f.severity === "blocking",
  );

  const statusBadge =
    factualReport.passed && !hasBlockingValidationFindings
      ? "✅ READY FOR HUMAN REVIEW"
      : "⚠️ REQUIRES EDITORIAL ATTENTION";

  const lines: string[] = [
    `# 🗞️ Aaj, Bas. Daily Edition Draft: ${edition.date}`,
    "",
    `> **Status**: ${statusBadge} | **Date**: \`${edition.date}\` | **Edition Version**: \`${edition.editionVersion}\` | **Pipeline Runtime**: \`${diagnostics.durationMs}ms\``,
    "",
    "---",
    "",
    "## 📊 Edition Composition & Diversity Overview",
    "",
    "| Metric | Target | Actual | Status |",
    "| :--- | :---: | :---: | :---: |",
    `| **Core Stories Count** | Exactly 8 | ${coreStories.length} | ${coreStories.length === 8 ? "✅ PASS" : "❌ FAIL"} |`,
    `| **Topic Pool Stories** | ≥ 2 | ${poolStories.length} | ${poolStories.length >= 2 ? "✅ PASS" : "⚠️ LOW"} |`,
    `| **Distinct Publishers** | ≥ 6 | ${diagnostics.distinctPublishersCount} | ${diagnostics.distinctPublishersCount >= 6 ? "✅ PASS" : "⚠️ CAPPED"} |`,
    `| **Evaluated Feed Items** | — | ${diagnostics.totalNormalizedItems} | ℹ️ INFO |`,
    `| **Discovered Story Clusters** | — | ${diagnostics.totalClusters} | ℹ️ INFO |`,
    `| **Factual Grounding Check** | 100% | ${factualReport.passed ? "100%" : "FAIL"} | ${factualReport.passed ? "✅ PASS" : "❌ BLOCK"} |`,
    "",
    "---",
    "",
    "## 📑 Core Edition Stories (Top 8)",
    "",
    "| # | Headline | Beat / Topic | Type | Sources | Confidence |",
    "| :-: | :--- | :--- | :---: | :--- | :---: |",
  ];

  coreStories.forEach((story, idx) => {
    const sourcesList = story.sourceIds.map((s) => `\`${s}\``).join(", ");
    lines.push(
      `| **${idx + 1}** | **${escapePipes(story.headline)}** | \`${story.topic}\` | \`${story.reportingType}\` | ${sourcesList} | \`${story.confidence}\` |`,
    );
  });

  lines.push(
    "",
    "---",
    "",
    "## ⚖️ Candidate Selection & Ranking Rationale",
    "",
    "| Cluster Title | Score | Action | Selection Rationale |",
    "| :--- | :---: | :---: | :--- |",
  );

  for (const candidate of rankingResult.allRanked.slice(0, 15)) {
    const actionBadge =
      candidate.decision === "selected_core"
        ? "✅ Core"
        : candidate.decision === "selected_topic_pool"
          ? "📁 Topic Pool"
          : "⏭️ Rejected";
    lines.push(
      `| ${escapePipes(candidate.cluster.cleanedTitle || candidate.cluster.representativeTitle)} | \`${candidate.compositeScore.toFixed(3)}\` | ${actionBadge} | ${escapePipes(candidate.decisionReason.details)} |`,
    );
  }

  lines.push(
    "",
    "---",
    "",
    "## 🛡️ Factual Support Validation & Hallucination Containment",
    "",
    formatFactualValidationMarkdown(factualReport),
    "",
    "---",
    "",
    "## 📖 Story Previews for Human Reviewers",
    "",
  );

  coreStories.forEach((story, idx) => {
    lines.push(
      `### Story ${idx + 1}: ${story.headline}`,
      "",
      `* **Deck**: *${story.deck}*`,
      `* **Topic**: \`${story.topic}\` | **Reporting Type**: \`${story.reportingType}\` | **Confidence**: \`${story.confidence}\``,
      `* **Attributed Sources**: ${story.sourceIds.map((s) => `\`${s}\``).join(", ")}`,
      "",
      "**What Changed:**",
    );
    for (const p of story.whatChanged) {
      lines.push(`> ${p}`);
    }
    lines.push(
      "",
      `**Why It Matters:** ${story.whyItMatters}`,
      story.uncertainty
        ? `\n**Uncertainty / Disputed Points:** ⚠️ *${story.uncertainty}*`
        : "",
      story.background ? `\n**Background Context:** ${story.background}` : "",
      "",
      "---",
      "",
    );
  });

  lines.push(
    "## ✍️ Editorial Review Instructions for Merge",
    "",
    "1. Verify that all 8 core stories are accurate, grounded, and representative of the day's major news.",
    "2. Review any advisory warnings in the factual support validation section.",
    "3. To publish this edition, approve and merge this pull request to `develop`.",
    "",
  );

  return lines.join("\n");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}
