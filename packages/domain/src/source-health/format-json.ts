/**
 * Format a SourceHealthReport as machine-readable JSON.
 */

import type { SourceHealthReport } from "./types";

export function formatSourceHealthJson(report: SourceHealthReport): string {
  return JSON.stringify(report, null, 2);
}
