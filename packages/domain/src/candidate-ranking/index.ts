export { composeEditionCandidates } from "./composition";
export {
  calculateCompositeScore,
  calculateCorroborationScore,
  calculateIndiaRelevanceScore,
  calculateRecencyScore,
  calculateRepetitionPenalty,
  calculateSourceTierScore,
  calculateTopicWeight,
} from "./features";
export { rankAndComposeCandidates } from "./rank";
export { classifyStoryTopic } from "./topic";
export type {
  CandidateFeatureScores,
  CandidateRankingResult,
  FeatureWeights,
  RankedStoryCandidate,
  RankingOptions,
  SelectionDecisionReason,
  SelectionDecisionType,
  SelectionReasonCode,
} from "./types";
export { RANKING_DEFAULTS } from "./types";
