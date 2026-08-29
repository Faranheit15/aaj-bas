/**
 * Terminal plain-text formatter for factual validation reports.
 */

import type { FactualValidationReport } from "./types";

export function formatFactualValidationText(
  report: FactualValidationReport,
): string {
  const lines: string[] = [];

  if (report.publishable && report.warningCount === 0) {
    lines.push(
      `OK: Factual validation passed for ${report.stories.length} story candidates.`,
    );
    return lines.join("\n");
  }

  if (report.publishable && report.warningCount > 0) {
    lines.push(
      `WARN: Factual validation passed with ${report.warningCount} warning(s) across ${report.stories.length} story candidates.`,
    );
  } else {
    lines.push(
      `FAIL: Factual validation failed with ${report.blockingCount} blocking issue(s) and ${report.warningCount} warning(s).`,
    );
  }

  for (const story of report.stories) {
    if (story.findings.length === 0) continue;

    const prefix = story.passed ? "WARN:" : "FAIL:";
    lines.push(`  ${prefix} Story '${story.storyId}' (${story.headline})`);

    for (const finding of story.findings) {
      const tag = finding.severity === "blocking" ? "BLOCK" : "WARN";
      lines.push(`    - [${tag}] [${finding.ruleId}]: ${finding.message}`);
    }
  }

  return lines.join("\n");
}
