/**
 * Constraint satisfaction engine for Core edition selection and Topic Pool routing.
 *
 * Enforces hard diversity constraints:
 * - Exactly CORE_STORY_COUNT (8) core stories when sufficient candidates exist.
 * - Maximum MAX_CORE_STORIES_PER_TOPIC (3) per topic in Core.
 * - Maximum MAX_CORE_STORIES_PER_PRIMARY_PUBLISHER (2) per publisher in Core.
 * - Partitions unselected candidates into interest topic pools.
 */

import {
  INTEREST_SLUGS,
  type InterestSlug,
  type TopicSlug,
} from "@aaj-bas/schemas";
import {
  type CandidateRankingResult,
  type RankedStoryCandidate,
  type RankingOptions,
  RANKING_DEFAULTS,
} from "./types";

const VALID_INTERESTS = new Set<string>(INTEREST_SLUGS);

function isInterestSlug(slug: string): slug is InterestSlug {
  return VALID_INTERESTS.has(slug);
}

export function composeEditionCandidates(
  scoredCandidates: readonly RankedStoryCandidate[],
  options?: RankingOptions,
): CandidateRankingResult {
  const coreStoryCount =
    options?.coreStoryCount ?? RANKING_DEFAULTS.coreStoryCount;
  const maxCoreStoriesPerTopic =
    options?.maxCoreStoriesPerTopic ?? RANKING_DEFAULTS.maxCoreStoriesPerTopic;
  const maxCoreStoriesPerPrimaryPublisher =
    options?.maxCoreStoriesPerPrimaryPublisher ??
    RANKING_DEFAULTS.maxCoreStoriesPerPrimaryPublisher;
  const maxPoolStoriesPerTopic =
    options?.maxPoolStoriesPerTopic ?? RANKING_DEFAULTS.maxPoolStoriesPerTopic;

  const coreCandidates: RankedStoryCandidate[] = [];
  const topicPools: Partial<Record<InterestSlug, RankedStoryCandidate[]>> = {};
  const rejectedCandidates: RankedStoryCandidate[] = [];
  const allRanked: RankedStoryCandidate[] = [];

  const coreTopicCounts: Partial<Record<TopicSlug, number>> = {};
  const corePublisherCounts: Record<string, number> = {};

  // 1. Core Selection Pass (Greedy with hard diversity constraints)
  for (const candidate of scoredCandidates) {
    const currentTopicCount = coreTopicCounts[candidate.topic] ?? 0;
    const currentPublisherCount =
      corePublisherCounts[candidate.primarySourceId] ?? 0;

    if (coreCandidates.length < coreStoryCount) {
      if (currentTopicCount >= maxCoreStoriesPerTopic) {
        // Exceeded topic cap for core
        const rejectedCandidate: RankedStoryCandidate = {
          ...candidate,
          decision: "rejected",
          decisionReason: {
            code: "topic_cap_exceeded",
            details: `exceeded max ${maxCoreStoriesPerTopic} core stories for topic '${candidate.topic}'`,
          },
        };
        allRanked.push(rejectedCandidate);
      } else if (currentPublisherCount >= maxCoreStoriesPerPrimaryPublisher) {
        // Exceeded publisher cap for core
        const rejectedCandidate: RankedStoryCandidate = {
          ...candidate,
          decision: "rejected",
          decisionReason: {
            code: "publisher_cap_exceeded",
            details: `exceeded max ${maxCoreStoriesPerPrimaryPublisher} core stories for publisher '${candidate.primarySourceId}'`,
          },
        };
        allRanked.push(rejectedCandidate);
      } else {
        // Selected for Core!
        const selectedCandidate: RankedStoryCandidate = {
          ...candidate,
          decision: "selected_core",
          decisionReason: {
            code: "core_selection",
            details: `selected for core edition with composite score ${candidate.compositeScore.toFixed(2)}`,
          },
        };
        coreCandidates.push(selectedCandidate);
        coreTopicCounts[candidate.topic] = currentTopicCount + 1;
        corePublisherCounts[candidate.primarySourceId] =
          currentPublisherCount + 1;
        allRanked.push(selectedCandidate);
      }
    } else {
      // Core is full, candidate goes to pool evaluation
      const pendingCandidate: RankedStoryCandidate = {
        ...candidate,
        decision: "rejected",
        decisionReason: {
          code: "below_score_threshold",
          details: "core edition quota fulfilled by higher scoring stories",
        },
      };
      allRanked.push(pendingCandidate);
    }
  }

  // 2. Topic Pool Partitioning Pass
  for (let i = 0; i < allRanked.length; i += 1) {
    const candidate = allRanked[i];
    if (!candidate || candidate.decision === "selected_core") {
      continue;
    }

    if (isInterestSlug(candidate.topic)) {
      const existingPool = topicPools[candidate.topic] ?? [];
      if (existingPool.length < maxPoolStoriesPerTopic) {
        const poolCandidate: RankedStoryCandidate = {
          ...candidate,
          decision: "selected_topic_pool",
          decisionReason: {
            code: "topic_pool_selection",
            details: `assigned to ${candidate.topic} topic pool (${existingPool.length + 1}/${maxPoolStoriesPerTopic})`,
          },
        };
        existingPool.push(poolCandidate);
        topicPools[candidate.topic] = existingPool;
        allRanked[i] = poolCandidate;
        continue;
      }
    }

    rejectedCandidates.push(candidate);
  }

  const distinctPublishers = Object.keys(corePublisherCounts).length;
  const topicDistribution: Record<TopicSlug, number> = {
    india: coreTopicCounts.india ?? 0,
    world: coreTopicCounts.world ?? 0,
    "business-economy": coreTopicCounts["business-economy"] ?? 0,
    "science-health-climate": coreTopicCounts["science-health-climate"] ?? 0,
    "technology-ai": coreTopicCounts["technology-ai"] ?? 0,
    "culture-entertainment": coreTopicCounts["culture-entertainment"] ?? 0,
    sports: coreTopicCounts.sports ?? 0,
    "policy-geopolitics": coreTopicCounts["policy-geopolitics"] ?? 0,
  };

  const poolCount = Object.values(topicPools).reduce(
    (sum, p) => sum + (p?.length ?? 0),
    0,
  );

  return {
    coreCandidates,
    topicPools,
    rejectedCandidates,
    allRanked,
    diagnostics: {
      totalEvaluated: scoredCandidates.length,
      coreCount: coreCandidates.length,
      poolCount,
      distinctPublishersInCore: distinctPublishers,
      topicDistributionInCore: topicDistribution,
      referenceDate:
        options?.referenceDate instanceof Date
          ? Number.isFinite(options.referenceDate.getTime())
            ? options.referenceDate.toISOString()
            : new Date().toISOString()
          : typeof options?.referenceDate === "string"
            ? options.referenceDate
            : new Date().toISOString(),
    },
  };
}
