/**
 * Markdown formatter for factual validation reports, designed for GitHub PR summaries.
 */

import type { FactualValidationReport } from "./types";

export function formatFactualValidationMarkdown(
  report: FactualValidationReport,
): string {
  const lines: string[] = [];

  const statusBadge = report.publishable
    ? "### 🛡️ Factual Support Validation: ✅ PASS"
    : `### 🛡️ Factual Support Validation: ❌ BLOCKED (${report.blockingCount} blocking issue${report.blockingCount === 1 ? "" : "s"})`;

  lines.push(statusBadge);
  lines.push("");
  lines.push(
    `Validated **${report.stories.length}** draft story candidates. Status: **${report.publishable ? "Publishable" : "Blocked"}** (${report.blockingCount} blocking, ${report.warningCount} warnings).`,
  );
  lines.push("");

  // Table summary
  lines.push(
    "| Story ID | Headline | Status | Blocking | Warnings | Attribution |",
  );
  lines.push("| :--- | :--- | :---: | :---: | :---: | :---: |");

  for (const story of report.stories) {
    const statusIcon = story.passed ? "✅ PASS" : "❌ FAIL";
    const attrScore = `${Math.round(story.metrics.sourceAttributionScore * 100)}%`;
    const truncatedHeadline =
      story.headline.length > 50
        ? `${story.headline.slice(0, 47)}...`
        : story.headline;

    lines.push(
      `| \`${story.storyId}\` | ${truncatedHeadline} | ${statusIcon} | ${story.blockingCount} | ${story.warningCount} | ${attrScore} |`,
    );
  }

  lines.push("");

  // Diagnostic details for flagged stories
  const flaggedStories = report.stories.filter((s) => s.findings.length > 0);

  if (flaggedStories.length > 0) {
    lines.push("<details>");
    lines.push(
      "<summary><strong>🔍 Detailed Diagnostic Findings</strong></summary>",
    );
    lines.push("");

    for (const story of flaggedStories) {
      lines.push(`#### Story \`${story.storyId}\`: *${story.headline}*`);
      lines.push("");
      for (const finding of story.findings) {
        const sevBadge =
          finding.severity === "blocking" ? "🛑 `BLOCKING`" : "⚠️ `WARNING`";
        lines.push(`- ${sevBadge} **[${finding.ruleId}]**: ${finding.message}`);
        if (finding.ungroundedTokens && finding.ungroundedTokens.length > 0) {
          lines.push(
            `  - Offending tokens: \`${finding.ungroundedTokens.join("`, `")}\``,
          );
        }
      }
      lines.push("");
    }

    lines.push("</details>");
  } else {
    lines.push(
      "✨ *All story facts, numbers, dates, and entities are fully grounded in source cluster items.*",
    );
  }

  return lines.join("\n");
}
