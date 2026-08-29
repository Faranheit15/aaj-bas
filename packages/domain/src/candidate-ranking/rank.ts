/**
 * Main orchestration entry point for candidate ranking and composition.
 *
 * Evaluates story clusters, computes feature scores, classifies topics,
 * sorts deterministically, and applies composition diversity constraints.
 */

import type { StoryCluster } from "../clustering";
import { composeEditionCandidates } from "./composition";
import {
  calculateCompositeScore,
  calculateCorroborationScore,
  calculateIndiaRelevanceScore,
  calculateRecencyScore,
  calculateRepetitionPenalty,
  calculateSourceTierScore,
  calculateTopicWeight,
} from "./features";
import { classifyStoryTopic } from "./topic";
import type {
  CandidateFeatureScores,
  CandidateRankingResult,
  RankedStoryCandidate,
  RankingOptions,
} from "./types";

export function rankAndComposeCandidates(
  clusters: readonly StoryCluster[],
  options?: RankingOptions,
): CandidateRankingResult {
  if (clusters.length === 0) {
    return composeEditionCandidates([], options);
  }

  let referenceDate: Date;
  if (options?.referenceDate instanceof Date) {
    referenceDate = Number.isFinite(options.referenceDate.getTime())
      ? options.referenceDate
      : new Date();
  } else if (typeof options?.referenceDate === "string") {
    const parsed = new Date(options.referenceDate);
    referenceDate = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  } else {
    referenceDate = new Date();
  }

  const scoredCandidates: RankedStoryCandidate[] = [];

  for (const cluster of clusters) {
    const topic = classifyStoryTopic(cluster);
    const recency = calculateRecencyScore(
      cluster.lastPublishedAt,
      referenceDate,
      options?.recencyHalfLifeHours,
    );
    const corroboration = calculateCorroborationScore(cluster.sourceCount);
    const sourceTier = calculateSourceTierScore(
      cluster.sources,
      options?.getSourceType,
    );
    const indiaRelevance = calculateIndiaRelevanceScore(
      cluster,
      options?.getSourceRegion,
    );
    const repetitionPenalty = calculateRepetitionPenalty(
      cluster.representativeTitle,
      options?.recentEditionTitles,
    );
    const topicWeight = calculateTopicWeight(topic);

    const featureScores: CandidateFeatureScores = {
      recency,
      corroboration,
      sourceTier,
      indiaRelevance,
      repetitionPenalty,
      topicWeight,
    };

    const compositeScore = calculateCompositeScore(
      featureScores,
      options?.featureWeights,
      options?.repetitionPenaltyMultiplier,
    );

    scoredCandidates.push({
      cluster,
      topic,
      compositeScore,
      featureScores,
      primarySourceId: cluster.primaryItem.sourceId,
      decision: "rejected", // pending resolution in composition pass
      decisionReason: {
        code: "below_score_threshold",
        details: "pending composition evaluation",
      },
    });
  }

  // Sort candidates deterministically: composite score descending, then source count descending, then cluster ID ascending
  const sortedCandidates = scoredCandidates.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    if (b.cluster.sourceCount !== a.cluster.sourceCount) {
      return b.cluster.sourceCount - a.cluster.sourceCount;
    }
    return a.cluster.id.localeCompare(b.cluster.id);
  });

  return composeEditionCandidates(sortedCandidates, options);
}
