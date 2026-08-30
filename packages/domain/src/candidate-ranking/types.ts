/**
 * Domain types and defaults for candidate ranking and composition.
 *
 * Defines models for story candidate scoring, feature weights, selection decisions,
 * and diversity-constrained edition composition results.
 */

import type { InterestSlug, SourceType, TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import type { SourceRegion, SourceRegistry } from "../source-registry";

export type SelectionDecisionType =
  | "selected_core"
  | "selected_topic_pool"
  | "rejected";

export type SelectionReasonCode =
  | "core_selection"
  | "topic_pool_selection"
  | "topic_cap_exceeded"
  | "publisher_cap_exceeded"
  | "below_score_threshold";

export interface SelectionDecisionReason {
  readonly code: SelectionReasonCode;
  readonly details: string;
}

export interface CandidateFeatureScores {
  /** Recency score in [0.0, 1.0] with exponential decay from reference date. */
  readonly recency: number;
  /** Corroboration score in [0.0, 1.0] based on distinct source count. */
  readonly corroboration: number;
  /** Source tier authority weight in [0.0, 1.0]. */
  readonly sourceTier: number;
  /** India relevance score in [0.0, 1.0]. */
  readonly indiaRelevance: number;
  /** Novelty / non-repetition penalty in [0.0, 1.0] against recent edition titles. */
  readonly repetitionPenalty: number;
  /** Editorial baseline weight in [0.0, 1.0] for the story's topic. */
  readonly topicWeight: number;
}

export interface RankedStoryCandidate {
  readonly cluster: StoryCluster;
  readonly topic: TopicSlug;
  readonly compositeScore: number;
  readonly featureScores: CandidateFeatureScores;
  readonly primarySourceId: string;
  readonly decision: SelectionDecisionType;
  readonly decisionReason: SelectionDecisionReason;
}

export interface CandidateRankingResult {
  /** The 8 core story candidates selected under all diversity constraints. */
  readonly coreCandidates: readonly RankedStoryCandidate[];
  /** Topic pools partitioned by InterestSlug for reader interest boosts. */
  readonly topicPools: Readonly<
    Partial<Record<InterestSlug, readonly RankedStoryCandidate[]>>
  >;
  /** Candidates rejected from both Core and Topic Pools. */
  readonly rejectedCandidates: readonly RankedStoryCandidate[];
  /** All evaluated candidates sorted by composite score descending. */
  readonly allRanked: readonly RankedStoryCandidate[];
  /** Overall composition diagnostics. */
  readonly diagnostics: {
    readonly totalEvaluated: number;
    readonly coreCount: number;
    readonly poolCount: number;
    readonly distinctPublishersInCore: number;
    readonly topicDistributionInCore: Readonly<Record<TopicSlug, number>>;
    readonly referenceDate: string;
  };
}

export interface FeatureWeights {
  readonly recency?: number | undefined;
  readonly corroboration?: number | undefined;
  readonly sourceTier?: number | undefined;
  readonly indiaRelevance?: number | undefined;
  readonly topicWeight?: number | undefined;
}

export interface RankingOptions {
  /** Reference timestamp against which recency decay is computed. Defaults to now. */
  readonly referenceDate?: string | Date | undefined;
  /** Half-life in hours for recency decay. Defaults to 18. */
  readonly recencyHalfLifeHours?: number | undefined;
  /** Recent edition titles to evaluate repetition penalty against. */
  readonly recentEditionTitles?: readonly string[] | undefined;
  /** Optional lookup callback for source authority type (e.g. wire, broadsheet). */
  readonly getSourceType?:
    | ((sourceId: string) => SourceType | undefined)
    | undefined;
  /** Optional lookup callback for source geographical region. */
  readonly getSourceRegion?:
    | ((sourceId: string) => SourceRegion | undefined)
    | undefined;
  /** Validated registry used to guard source-supplied descriptions in topic classification. */
  readonly sourceRegistry?: SourceRegistry | undefined;
  /** Feature weight overrides. */
  readonly featureWeights?: FeatureWeights | undefined;
  /** Repetition penalty deduction multiplier. Defaults to 0.5. */
  readonly repetitionPenaltyMultiplier?: number | undefined;
  /** Target core story count. Defaults to 8. */
  readonly coreStoryCount?: number | undefined;
  /** Maximum core stories from any single topic. Defaults to 3. */
  readonly maxCoreStoriesPerTopic?: number | undefined;
  /** Maximum core stories from any single primary publisher. Defaults to 2. */
  readonly maxCoreStoriesPerPrimaryPublisher?: number | undefined;
  /** Maximum stories per topic pool. Defaults to 4. */
  readonly maxPoolStoriesPerTopic?: number | undefined;
}

export const RANKING_DEFAULTS = {
  recencyHalfLifeHours: 18,
  repetitionPenaltyMultiplier: 0.5,
  coreStoryCount: 8,
  maxCoreStoriesPerTopic: 3,
  maxCoreStoriesPerPrimaryPublisher: 2,
  maxPoolStoriesPerTopic: 4,
  weights: {
    recency: 0.25,
    corroboration: 0.25,
    sourceTier: 0.15,
    indiaRelevance: 0.2,
    topicWeight: 0.15,
  },
} as const;
