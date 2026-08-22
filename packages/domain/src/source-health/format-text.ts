/**
 * Format a SourceHealthReport as clean, deterministic CLI output.
 */

import type { SourceHealthReport } from "./types";

export function formatSourceHealthText(report: SourceHealthReport): string {
  if (report.records.length === 0) {
    return "OK: no sources evaluated.";
  }

  const lines: string[] = [];

  for (const record of report.records) {
    if (record.status === "healthy") {
      const details = [
        record.httpStatus !== undefined ? `HTTP ${record.httpStatus}` : null,
        record.byteCount !== undefined ? `${record.byteCount} bytes` : null,
        `${record.itemCount} items`,
        record.durationMs !== undefined ? `${record.durationMs}ms` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(", ");

      lines.push(`OK: ${record.sourceId} (${details})`);
    } else if (record.status === "warning") {
      const warningDetails = record.warnings
        .map((w) => `[${w.ruleId}] ${w.message}`)
        .join(", ");
      lines.push(`WARN: ${record.sourceId} - ${warningDetails}`);
    } else {
      lines.push(
        `FAIL: ${record.sourceId} - ${record.errorMessage ?? "fetch failed"}`,
      );
    }
  }

  lines.push(
    `Source health: ${report.healthyCount} healthy, ${report.warningCount} warning(s), ${report.failingCount} failing of ${report.totalSources} sources.`,
  );

  return lines.join("\n");
}
