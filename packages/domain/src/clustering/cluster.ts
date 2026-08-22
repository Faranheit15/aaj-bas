/**
 * Deterministic story clustering pipeline.
 *
 * Groups normalized feed items into cohesive, multi-source story clusters with
 * complete-linkage drift prevention, numeric guards, and optional semantic assistance.
 */

import {
  calculateTimeDeltaHours,
  calculateTitleSimilarity,
  classifyDuplicate,
  getExactDuplicateReason,
  hasNumericConflict,
  isExactDuplicate,
  tokenizeTitle,
} from "../deduplication";
import { contentHashFor, type NormalizedFeedItem } from "../feed-normalization";
import { selectRepresentativeTitle } from "./representative-title";
import {
  CLUSTERING_DEFAULTS,
  type ClusterMergeReason,
  type ClusteringOptions,
  type StoryCluster,
} from "./types";

interface MutableCluster {
  primaryItem: NormalizedFeedItem;
  items: NormalizedFeedItem[];
  mergeReasons: ClusterMergeReason[];
  minPairwiseScore: number;
}

function compareIsoDates(
  a: string | null,
  b: string | null,
  ascending: boolean,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (timeA === timeB) return 0;
  return ascending ? timeA - timeB : timeB - timeA;
}

function sortFeedItemsDeterministically(
  items: readonly NormalizedFeedItem[],
): NormalizedFeedItem[] {
  return [...items].sort((a, b) => {
    const dateComp = compareIsoDates(a.publishedAt, b.publishedAt, true);
    if (dateComp !== 0) return dateComp;
    const sourceComp = a.sourceId.localeCompare(b.sourceId);
    if (sourceComp !== 0) return sourceComp;
    const guidComp = a.guid.localeCompare(b.guid);
    if (guidComp !== 0) return guidComp;
    return a.contentHash.localeCompare(b.contentHash);
  });
}

function getClusterMinMaxDates(items: readonly NormalizedFeedItem[]): {
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
} {
  let firstPublishedAt: string | null = null;
  let lastPublishedAt: string | null = null;

  for (const item of items) {
    if (item.publishedAt !== null) {
      if (
        firstPublishedAt === null ||
        compareIsoDates(item.publishedAt, firstPublishedAt, true) < 0
      ) {
        firstPublishedAt = item.publishedAt;
      }
      if (
        lastPublishedAt === null ||
        compareIsoDates(item.publishedAt, lastPublishedAt, false) < 0
      ) {
        lastPublishedAt = item.publishedAt;
      }
    }
  }

  return { firstPublishedAt, lastPublishedAt };
}

function generateClusterId(items: readonly NormalizedFeedItem[]): string {
  const sortedKeys = items
    .map((i) => `${i.sourceId}:${i.guid}`)
    .sort()
    .join("|");
  return `cluster-${contentHashFor(sortedKeys)}`;
}

function buildStoryCluster(cluster: MutableCluster): StoryCluster {
  const { firstPublishedAt, lastPublishedAt } = getClusterMinMaxDates(
    cluster.items,
  );
  const distinctSources = Array.from(
    new Set(cluster.items.map((i) => i.sourceId)),
  ).sort();
  const titleInfo = selectRepresentativeTitle(cluster.items);

  const confidenceScore =
    cluster.items.length === 1
      ? 1.0
      : Number.isFinite(cluster.minPairwiseScore) &&
          cluster.minPairwiseScore > 0
        ? cluster.minPairwiseScore
        : 1.0;

  return {
    id: generateClusterId(cluster.items),
    primaryItem: cluster.primaryItem,
    items: sortFeedItemsDeterministically(cluster.items),
    sourceCount: distinctSources.length,
    sources: distinctSources,
    representativeTitle: titleInfo.representativeTitle,
    cleanedTitle: titleInfo.cleanedTitle,
    confidenceScore: Math.min(1.0, Math.max(0.0, confidenceScore)),
    mergeReasons: [...cluster.mergeReasons],
    firstPublishedAt,
    lastPublishedAt,
  };
}

export function clusterFeedItems(
  items: readonly NormalizedFeedItem[],
  options?: ClusteringOptions,
): StoryCluster[] {
  if (items.length === 0) {
    return [];
  }

  const sortedItems = sortFeedItemsDeterministically(items);
  const maxClusterSize =
    options?.maxClusterSize ?? CLUSTERING_DEFAULTS.maxClusterSize;
  const maxTimeDeltaHours =
    options?.maxTimeDeltaHours ?? CLUSTERING_DEFAULTS.maxTimeDeltaHours;
  const centroidSimilarityThreshold =
    options?.centroidSimilarityThreshold ??
    CLUSTERING_DEFAULTS.centroidSimilarityThreshold;

  const clusters: MutableCluster[] = [];

  for (const item of sortedItems) {
    const itemTokens = tokenizeTitle(item.title);
    let bestClusterIndex = -1;
    let bestMatchScore = -1;
    let bestMergeReason: ClusterMergeReason | null = null;

    for (let cIdx = 0; cIdx < clusters.length; cIdx += 1) {
      const cluster = clusters[cIdx];
      if (!cluster || cluster.items.length >= maxClusterSize) {
        continue;
      }

      // Check time window delta against cluster items
      const timeDelta = calculateTimeDeltaHours(
        item.publishedAt,
        cluster.primaryItem.publishedAt,
      );
      if (timeDelta !== null && timeDelta > maxTimeDeltaHours) {
        continue;
      }

      // 1. Exact duplicate match check
      let isExact = false;
      for (const clusterItem of cluster.items) {
        if (isExactDuplicate(item, clusterItem)) {
          isExact = true;
          const exactReason = getExactDuplicateReason(item, clusterItem);
          bestClusterIndex = cIdx;
          bestMatchScore = 1.0;
          bestMergeReason = {
            type:
              exactReason === "canonical_url"
                ? "exact_url"
                : exactReason === "content_hash"
                  ? "exact_hash"
                  : "exact_guid",
            score: 1.0,
            exactRule: exactReason ?? undefined,
            itemAId: clusterItem.guid,
            itemBId: item.guid,
          };
          break;
        }
      }

      if (isExact) {
        break;
      }

      // 2. Near-duplicate & Complete-linkage check
      // Candidate must not have numeric conflict with any item in cluster
      let hasConflict = false;
      let minSimilarity = 1.0;

      for (const clusterItem of cluster.items) {
        const clusterItemTokens = tokenizeTitle(clusterItem.title);
        if (hasNumericConflict(itemTokens, clusterItemTokens)) {
          hasConflict = true;
          break;
        }

        const sim = calculateTitleSimilarity(
          itemTokens,
          clusterItemTokens,
          options?.deduplicationOptions,
        );
        if (sim < minSimilarity) {
          minSimilarity = sim;
        }
      }

      if (hasConflict) {
        continue;
      }

      // Candidate must pass complete-linkage floor and near-duplicate classification against primary item
      const primaryClassification = classifyDuplicate(
        item,
        cluster.primaryItem,
        options?.deduplicationOptions,
      );

      if (
        (primaryClassification.matchType === "near" ||
          primaryClassification.matchType === "exact") &&
        minSimilarity >= centroidSimilarityThreshold
      ) {
        const score =
          primaryClassification.matchType === "near"
            ? primaryClassification.score
            : 1.0;

        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestClusterIndex = cIdx;
          bestMergeReason = {
            type: "near_duplicate_title",
            score,
            details: `similarity ${score.toFixed(2)} with complete linkage floor ${minSimilarity.toFixed(2)}`,
            itemAId: cluster.primaryItem.guid,
            itemBId: item.guid,
          };
        }
      }
    }

    if (bestClusterIndex >= 0 && bestMergeReason) {
      const targetCluster = clusters[bestClusterIndex];
      if (targetCluster) {
        targetCluster.items.push(item);
        targetCluster.mergeReasons.push(bestMergeReason);
        if (bestMatchScore < targetCluster.minPairwiseScore) {
          targetCluster.minPairwiseScore = bestMatchScore;
        }
      }
    } else {
      // Create new singleton cluster
      clusters.push({
        primaryItem: item,
        items: [item],
        mergeReasons: [
          {
            type: "singleton",
            score: 1.0,
            details: "initial cluster leader",
          },
        ],
        minPairwiseScore: 1.0,
      });
    }
  }

  const result = clusters.map((c) => buildStoryCluster(c));

  // Sort clusters deterministically: last published date descending, then source count descending, then ID
  return result.sort((a, b) => {
    const dateComp = compareIsoDates(
      a.lastPublishedAt,
      b.lastPublishedAt,
      false,
    );
    if (dateComp !== 0) return dateComp;
    if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
    return a.id.localeCompare(b.id);
  });
}

export async function clusterFeedItemsAsync(
  items: readonly NormalizedFeedItem[],
  options?: ClusteringOptions,
): Promise<StoryCluster[]> {
  const initialClusters = clusterFeedItems(items, options);
  if (initialClusters.length <= 1 || !options?.semanticProvider) {
    return initialClusters;
  }

  const provider = options.semanticProvider;
  const threshold =
    options.semanticThreshold ?? CLUSTERING_DEFAULTS.semanticThreshold;
  const maxClusterSize =
    options.maxClusterSize ?? CLUSTERING_DEFAULTS.maxClusterSize;
  const maxTimeDeltaHours =
    options.maxTimeDeltaHours ?? CLUSTERING_DEFAULTS.maxTimeDeltaHours;
  const mergedClusters: StoryCluster[] = [];
  const mergedIndices = new Set<number>();

  for (let i = 0; i < initialClusters.length; i += 1) {
    if (mergedIndices.has(i)) {
      continue;
    }

    let current = initialClusters[i];
    if (!current) continue;

    for (let j = i + 1; j < initialClusters.length; j += 1) {
      if (mergedIndices.has(j)) {
        continue;
      }

      const candidate = initialClusters[j];
      if (!candidate) continue;

      if (current.items.length + candidate.items.length > maxClusterSize) {
        continue;
      }

      const timeDelta = calculateTimeDeltaHours(
        current.primaryItem.publishedAt,
        candidate.primaryItem.publishedAt,
      );
      if (timeDelta !== null && timeDelta > maxTimeDeltaHours) {
        continue;
      }

      try {
        const decision = await provider.evaluateCandidateMerge(
          current,
          candidate,
        );
        if (decision.shouldMerge && decision.confidence >= threshold) {
          mergedIndices.add(j);
          const combinedItems = [...current.items, ...candidate.items];
          const semanticReason: ClusterMergeReason = {
            type: "semantic_similarity",
            score: decision.confidence,
            details: decision.reason ?? `Semantic merge by ${provider.name}`,
          };

          const mutableCombined: MutableCluster = {
            primaryItem: current.primaryItem,
            items: combinedItems,
            mergeReasons: [
              ...current.mergeReasons,
              ...candidate.mergeReasons,
              semanticReason,
            ],
            minPairwiseScore: Math.min(
              current.confidenceScore,
              candidate.confidenceScore,
              decision.confidence,
            ),
          };

          current = buildStoryCluster(mutableCombined);
        }
      } catch {
        // Safe degradation: provider failure keeps clusters separate
      }
    }

    mergedClusters.push(current);
  }

  return mergedClusters.sort((a, b) => {
    const dateComp = compareIsoDates(
      a.lastPublishedAt,
      b.lastPublishedAt,
      false,
    );
    if (dateComp !== 0) return dateComp;
    if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount;
    return a.id.localeCompare(b.id);
  });
}
