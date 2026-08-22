/**
 * Evaluate source health metrics and generate diagnostic reports.
 *
 * This function is pure and deterministic: given fetch results, item collections,
 * and optional reference timestamp/thresholds, it returns a SourceHealthReport.
 */

import type { NormalizedFeedItem } from "../feed-normalization";
import {
  type EvaluateSourceHealthOptions,
  SOURCE_HEALTH_DEFAULTS,
  type SourceFetchResultInput,
  type SourceHealthRecord,
  type SourceHealthReport,
  type SourceHealthStatus,
  type SourceHealthThresholds,
  type SourceHealthWarning,
} from "./types";

export function evaluateSourceHealth(
  fetchResults: readonly SourceFetchResultInput[],
  itemsBySourceId?:
    | ReadonlyMap<string, readonly NormalizedFeedItem[]>
    | Readonly<Record<string, readonly NormalizedFeedItem[]>>,
  options?: EvaluateSourceHealthOptions,
): SourceHealthReport {
  const referenceDate = resolveReferenceDate(options?.now);
  const thresholds: SourceHealthThresholds = {
    maxLatencyMs:
      options?.thresholds?.maxLatencyMs ?? SOURCE_HEALTH_DEFAULTS.maxLatencyMs,
    maxStalenessHours:
      options?.thresholds?.maxStalenessHours ??
      SOURCE_HEALTH_DEFAULTS.maxStalenessHours,
  };

  const records: SourceHealthRecord[] = [];
  let healthyCount = 0;
  let warningCount = 0;
  let failingCount = 0;

  for (const result of fetchResults) {
    const items = resolveItems(itemsBySourceId, result.sourceId);
    const lastPublishedAt = findLatestPublicationDate(items);
    const warnings: SourceHealthWarning[] = [];

    const fetchKind = result.kind;
    const durationMs = result.durationMs;
    let url: string;
    let httpStatus: number | undefined;
    let byteCount: number | undefined;
    let errorMessage: string | undefined;

    if (result.kind === "success") {
      url = result.finalUrl;
      httpStatus = result.status;
      byteCount = result.body.byteLength;

      if (durationMs !== undefined && durationMs > thresholds.maxLatencyMs) {
        warnings.push({
          ruleId: "latency/high",
          message: `Response latency (${durationMs}ms) exceeded threshold of ${thresholds.maxLatencyMs}ms`,
        });
      }

      if (itemsBySourceId !== undefined && items.length === 0) {
        warnings.push({
          ruleId: "items/empty",
          message: "Feed fetch succeeded but yielded 0 items",
        });
      }

      if (lastPublishedAt !== null) {
        const stalenessHours = calculateAgeInHours(
          lastPublishedAt,
          referenceDate,
        );
        if (
          stalenessHours !== null &&
          stalenessHours > thresholds.maxStalenessHours
        ) {
          warnings.push({
            ruleId: "staleness/old",
            message: `Latest item (${lastPublishedAt}) is ${Math.round(stalenessHours)} hours old (threshold: ${thresholds.maxStalenessHours}h)`,
          });
        }
      }
    } else if (result.kind === "not-modified") {
      url = result.finalUrl;
      httpStatus = 304;

      if (durationMs !== undefined && durationMs > thresholds.maxLatencyMs) {
        warnings.push({
          ruleId: "latency/high",
          message: `Response latency (${durationMs}ms) exceeded threshold of ${thresholds.maxLatencyMs}ms`,
        });
      }

      if (lastPublishedAt !== null) {
        const stalenessHours = calculateAgeInHours(
          lastPublishedAt,
          referenceDate,
        );
        if (
          stalenessHours !== null &&
          stalenessHours > thresholds.maxStalenessHours
        ) {
          warnings.push({
            ruleId: "staleness/old",
            message: `Latest item (${lastPublishedAt}) is ${Math.round(stalenessHours)} hours old (threshold: ${thresholds.maxStalenessHours}h)`,
          });
        }
      }
    } else {
      url = result.url;
      errorMessage = `${result.code}: ${result.message}`;
      warnings.push({
        ruleId: "fetch/failed",
        message: result.message,
      });
    }

    let status: SourceHealthStatus;
    if (fetchKind === "failure") {
      status = "failing";
      failingCount += 1;
    } else if (warnings.length > 0) {
      status = "warning";
      warningCount += 1;
    } else {
      status = "healthy";
      healthyCount += 1;
    }

    records.push({
      sourceId: result.sourceId,
      status,
      fetchKind,
      url,
      httpStatus,
      attempts: result.attempts,
      redirects: result.redirects,
      durationMs,
      byteCount,
      itemCount: items.length,
      lastPublishedAt,
      warnings,
      errorMessage,
    });
  }

  return {
    reportVersion: 1,
    generatedAt: referenceDate.toISOString(),
    totalSources: records.length,
    healthyCount,
    warningCount,
    failingCount,
    records,
  };
}

function resolveReferenceDate(now?: string | Date): Date {
  if (now instanceof Date) {
    return Number.isNaN(now.getTime()) ? new Date() : now;
  }
  if (typeof now === "string") {
    const parsed = new Date(now);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

function resolveItems(
  itemsBySourceId:
    | ReadonlyMap<string, readonly NormalizedFeedItem[]>
    | Readonly<Record<string, readonly NormalizedFeedItem[]>>
    | undefined,
  sourceId: string,
): readonly NormalizedFeedItem[] {
  if (!itemsBySourceId) {
    return [];
  }
  if (itemsBySourceId instanceof Map) {
    return itemsBySourceId.get(sourceId) ?? [];
  }
  return (
    (
      itemsBySourceId as Readonly<Record<string, readonly NormalizedFeedItem[]>>
    )[sourceId] ?? []
  );
}

function findLatestPublicationDate(
  items: readonly NormalizedFeedItem[],
): string | null {
  let latestMs = -Infinity;
  let latestIso: string | null = null;

  for (const item of items) {
    if (item.publishedAt !== null) {
      const ms = Date.parse(item.publishedAt);
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latestIso = item.publishedAt;
      }
    }
  }

  return latestIso;
}

function calculateAgeInHours(
  isoDate: string,
  referenceDate: Date,
): number | null {
  const itemMs = Date.parse(isoDate);
  if (!Number.isFinite(itemMs)) {
    return null;
  }
  const diffMs = referenceDate.getTime() - itemMs;
  return diffMs / (1000 * 60 * 60);
}
