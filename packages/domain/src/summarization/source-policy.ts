/**
 * Source-use checks applied at the summarization boundary.
 *
 * A normalized item still carries the source-supplied description because it
 * is useful for deterministic processing. It does not mean every downstream
 * consumer is permitted to use that field. The registry is the authority for
 * that decision, and this module keeps the checks in one place for both the
 * deterministic and provider-backed summarizers.
 */

import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import {
  reportingTypeForReviewedSources,
  sourcePermitsUse,
  type PermittedUse,
  type SourceRegistry,
} from "../source-registry";

export { sourcePermitsUse } from "../source-registry";

export function applyReviewedReportingType(
  story: Story,
  registry: SourceRegistry | undefined,
): Story {
  const reportingType = reportingTypeForReviewedSources(story, registry);
  return reportingType === story.reportingType
    ? story
    : { ...story, reportingType };
}

/** Return source IDs that are allowed for a reviewed use, preserving order. */
export function sourceIdsPermittingUse(
  sourceIds: readonly string[],
  use: PermittedUse,
  registry: SourceRegistry | undefined,
): readonly string[] {
  const seen = new Set<string>();
  const permitted: string[] = [];

  for (const sourceId of sourceIds) {
    if (!seen.has(sourceId) && sourcePermitsUse(sourceId, use, registry)) {
      seen.add(sourceId);
      permitted.push(sourceId);
    }
  }

  return permitted;
}

/**
 * Restrict a cluster to material that may contribute to a generated summary.
 *
 * `undefined` means the registry knows about the cluster's sources but none
 * permits generated summaries. That is a blocking absence for this output
 * shape; callers must not silently turn it into invented prose.
 */
export function clusterForGeneratedSummary(
  cluster: StoryCluster,
  registry: SourceRegistry | undefined,
): StoryCluster | undefined {
  if (registry === undefined) {
    return cluster;
  }

  const items = cluster.items.filter((item) =>
    sourcePermitsUse(item.sourceId, "generated-summary", registry),
  );
  if (items.length === 0) {
    return undefined;
  }

  const primaryItem =
    items.find((item) => item.sourceId === cluster.primaryItem.sourceId) ??
    items[0];
  if (primaryItem === undefined) {
    return undefined;
  }

  const sources = [...new Set(items.map((item) => item.sourceId))].sort();
  const publicationDates = items
    .map((item) => item.publishedAt)
    .filter((value): value is string => value !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  return {
    ...cluster,
    primaryItem,
    items,
    sourceCount: sources.length,
    sources,
    // Recompute title and date metadata so excluded source material cannot
    // influence the generated story indirectly.
    representativeTitle: primaryItem.title,
    cleanedTitle: primaryItem.title,
    firstPublishedAt: publicationDates[0] ?? null,
    lastPublishedAt: publicationDates.at(-1) ?? null,
  };
}
