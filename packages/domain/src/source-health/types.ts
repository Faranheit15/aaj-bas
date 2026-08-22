/**
 * Domain types for source health assessment and reporting.
 *
 * Source health is a diagnostic pipeline concern rather than public edition
 * content. These types represent the evaluation of feed fetching outcomes,
 * item freshness, response latency, and failure conditions against configured
 * health thresholds.
 */

import type { FeedFetchResult } from "../source-fetching";

export type SourceHealthStatus = "healthy" | "warning" | "failing";

export type SourceHealthWarningRule =
  | "fetch/failed"
  | "latency/high"
  | "items/empty"
  | "staleness/old";

export interface SourceHealthWarning {
  readonly ruleId: SourceHealthWarningRule;
  readonly message: string;
}

export interface SourceHealthRecord {
  readonly sourceId: string;
  readonly status: SourceHealthStatus;
  readonly fetchKind: "success" | "not-modified" | "failure";
  readonly url: string;
  readonly httpStatus?: number | undefined;
  readonly attempts: number;
  readonly redirects: number;
  readonly durationMs?: number | undefined;
  readonly byteCount?: number | undefined;
  readonly itemCount: number;
  readonly lastPublishedAt: string | null;
  readonly warnings: readonly SourceHealthWarning[];
  readonly errorMessage?: string | undefined;
}

export interface SourceHealthThresholds {
  /** Maximum acceptable request latency in milliseconds before warning. */
  readonly maxLatencyMs: number;
  /** Maximum acceptable age of newest item in hours before warning. */
  readonly maxStalenessHours: number;
}

export const SOURCE_HEALTH_DEFAULTS: SourceHealthThresholds = {
  maxLatencyMs: 5_000,
  maxStalenessHours: 72,
} as const;

export interface SourceHealthReport {
  readonly reportVersion: 1;
  readonly generatedAt: string;
  readonly totalSources: number;
  readonly healthyCount: number;
  readonly warningCount: number;
  readonly failingCount: number;
  readonly records: readonly SourceHealthRecord[];
}

export interface SourceFetchMeasurement {
  readonly durationMs?: number | undefined;
}

export type SourceFetchResultInput = FeedFetchResult & SourceFetchMeasurement;

export interface EvaluateSourceHealthOptions {
  /** Reference timestamp for staleness calculations (defaults to current time). */
  readonly now?: string | Date;
  /** Custom threshold overrides. */
  readonly thresholds?: Partial<SourceHealthThresholds>;
}
