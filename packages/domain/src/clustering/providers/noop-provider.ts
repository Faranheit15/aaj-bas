/**
 * Default No-op Semantic Clustering Provider.
 *
 * Implements the SemanticClusteringProvider interface with a safe,
 * deterministic pass-through that performs no remote calls or embeddings.
 */

import type {
  SemanticClusteringProvider,
  SemanticMergeDecision,
  StoryCluster,
} from "../types";

export class NoopSemanticClusteringProvider
  implements SemanticClusteringProvider
{
  readonly name = "noop";

  async evaluateCandidateMerge(
    _clusterA: StoryCluster,
    _clusterB: StoryCluster,
  ): Promise<SemanticMergeDecision> {
    return {
      shouldMerge: false,
      confidence: 0.0,
      reason: "Semantic assistance disabled (deterministic fallback)",
    };
  }
}
