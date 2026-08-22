/**
 * Format a SourceHealthReport as GitHub Flavored Markdown.
 *
 * Designed for GitHub Actions Step Summary ($GITHUB_STEP_SUMMARY) and PR reports.
 */

import type { SourceHealthRecord, SourceHealthReport } from "./types";

export function formatSourceHealthMarkdown(report: SourceHealthReport): string {
  const lines: string[] = [];

  lines.push("# Source Ingestion Health Report");
  lines.push("");
  lines.push(`**Generated at (UTC):** \`${report.generatedAt}\``);
  lines.push("");

  lines.push("### Summary");
  lines.push("");
  lines.push("| Total Sources | Healthy | Warnings | Failing |");
  lines.push("| :--- | :--- | :--- | :--- |");
  lines.push(
    `| ${report.totalSources} | ${report.healthyCount} | ${report.warningCount} | ${report.failingCount} |`,
  );
  lines.push("");

  const requiringReview = report.records.filter((r) => r.status !== "healthy");
  if (requiringReview.length > 0) {
    lines.push("### ⚠️ Feeds Requiring Review");
    lines.push("");
    lines.push("| Source ID | Status | Issues / Notes |");
    lines.push("| :--- | :--- | :--- |");
    for (const record of requiringReview) {
      const issueNotes = formatIssues(record);
      lines.push(
        `| \`${record.sourceId}\` | **${record.status.toUpperCase()}** | ${escapeMarkdown(issueNotes)} |`,
      );
    }
    lines.push("");
  }

  lines.push("### All Sources Details");
  lines.push("");
  lines.push(
    "| Source ID | Status | Kind | HTTP | Latency | Items | Latest Item (UTC) |",
  );
  lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

  for (const record of report.records) {
    const httpStr =
      record.httpStatus !== undefined ? String(record.httpStatus) : "-";
    const latencyStr =
      record.durationMs !== undefined ? `${record.durationMs}ms` : "-";
    const latestStr =
      record.lastPublishedAt !== null ? `\`${record.lastPublishedAt}\`` : "-";

    lines.push(
      `| \`${record.sourceId}\` | ${record.status} | ${record.fetchKind} | ${httpStr} | ${latencyStr} | ${record.itemCount} | ${latestStr} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function formatIssues(record: SourceHealthRecord): string {
  if (record.fetchKind === "failure" && record.errorMessage) {
    return record.errorMessage;
  }
  if (record.warnings.length > 0) {
    return record.warnings.map((w) => `[${w.ruleId}] ${w.message}`).join("; ");
  }
  return "None";
}

function escapeMarkdown(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}
