/**
 * Domain types and defaults for the story clustering pipeline.
 *
 * Defines models for story clusters, merge reasons, options, and semantic
 * clustering provider interfaces.
 */

import type {
  DeduplicationOptions,
  ExactDuplicateReason,
} from "../deduplication";
import type { NormalizedFeedItem } from "../feed-normalization";

export type ClusterMergeReasonType =
  | "singleton"
  | "exact_url"
  | "exact_hash"
  | "exact_guid"
  | "near_duplicate_title"
  | "semantic_similarity";

export interface ClusterMergeReason {
  readonly type: ClusterMergeReasonType;
  readonly score?: number | undefined;
  readonly details?: string | undefined;
  readonly exactRule?: ExactDuplicateReason | undefined;
  readonly itemAId?: string | undefined;
  readonly itemBId?: string | undefined;
}

export interface StoryCluster {
  /** Deterministic stable cluster ID derived from items. */
  readonly id: string;
  /** Primary / leader item representing this cluster. */
  readonly primaryItem: NormalizedFeedItem;
  /** All items belonging to this cluster (sorted deterministically). */
  readonly items: readonly NormalizedFeedItem[];
  /** Distinct source count. */
  readonly sourceCount: number;
  /** Sorted list of distinct source IDs represented in this cluster. */
  readonly sources: readonly string[];
  /** Representative title chosen from the cluster items. */
  readonly representativeTitle: string;
  /** Sanitized representative title stripped of publisher branding and noise. */
  readonly cleanedTitle: string;
  /** Overall confidence score in [0.0, 1.0]. */
  readonly confidenceScore: number;
  /** Audit log of reasons for merging items into this cluster. */
  readonly mergeReasons: readonly ClusterMergeReason[];
  /** Earliest ISO 8601 publication date, or null. */
  readonly firstPublishedAt: string | null;
  /** Latest ISO 8601 publication date, or null. */
  readonly lastPublishedAt: string | null;
}

export interface SemanticMergeDecision {
  readonly shouldMerge: boolean;
  readonly confidence: number;
  readonly reason?: string | undefined;
}

export interface SemanticClusteringProvider {
  readonly name: string;
  evaluateCandidateMerge(
    clusterA: StoryCluster,
    clusterB: StoryCluster,
  ): Promise<SemanticMergeDecision>;
}

export interface ClusteringOptions {
  /** Underlying pairwise deduplication options. */
  readonly deduplicationOptions?: DeduplicationOptions | undefined;
  /** Optional semantic clustering provider for assisted merges. */
  readonly semanticProvider?: SemanticClusteringProvider | undefined;
  /** Confidence threshold required for semantic merges [0.0, 1.0]. Defaults to 0.80. */
  readonly semanticThreshold?: number | undefined;
  /** Maximum number of items per cluster. Defaults to 20. */
  readonly maxClusterSize?: number | undefined;
  /** Maximum publication time difference (in hours) allowed for merging. Defaults to 72. */
  readonly maxTimeDeltaHours?: number | undefined;
  /** Minimum similarity score required against cluster centroid/medoid. Defaults to 0.45. */
  readonly centroidSimilarityThreshold?: number | undefined;
}

export const CLUSTERING_DEFAULTS = {
  semanticThreshold: 0.8,
  maxClusterSize: 20,
  maxTimeDeltaHours: 72,
  centroidSimilarityThreshold: 0.45,
} as const;
