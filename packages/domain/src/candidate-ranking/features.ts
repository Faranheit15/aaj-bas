/**
 * Pure scoring functions for candidate story ranking.
 *
 * Implements deterministic feature extraction for recency, corroboration,
 * source authority, India relevance, repetition penalty, and editorial weight.
 */

import type { SourceType, TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { calculateDiceCoefficient, tokenizeTitle } from "../deduplication";
import type { SourceRegion } from "../source-registry";
import {
  type CandidateFeatureScores,
  type FeatureWeights,
  RANKING_DEFAULTS,
} from "./types";

const INDIAN_ENTITY_KEYWORDS = new Set([
  "india",
  "indian",
  "delhi",
  "mumbai",
  "bengaluru",
  "bangalore",
  "chennai",
  "kolkata",
  "hyderabad",
  "pune",
  "ahmedabad",
  "rbi",
  "isro",
  "sebi",
  "cbi",
  "parliament",
  "lok sabha",
  "rajya sabha",
  "supreme court",
  "high court",
  "modi",
  "rupee",
  "sensex",
  "nifty",
  "crore",
  "lakh",
  "bjp",
  "congress",
  "maharashtra",
  "karnataka",
  "tamil nadu",
  "kerala",
  "gujarat",
  "punjab",
  "bengal",
  "uttar pradesh",
  "bihar",
  "rajasthan",
  "kashmir",
  "ladakh",
  "assam",
  "odisha",
]);

const TOPIC_EDITORIAL_WEIGHTS: Record<TopicSlug, number> = {
  india: 1.0,
  "policy-geopolitics": 0.9,
  "business-economy": 0.85,
  "science-health-climate": 0.85,
  "technology-ai": 0.8,
  world: 0.75,
  sports: 0.65,
  "culture-entertainment": 0.6,
};

export function calculateRecencyScore(
  publishedAt: string | null,
  referenceDate: Date,
  halfLifeHours: number = RANKING_DEFAULTS.recencyHalfLifeHours,
): number {
  if (publishedAt === null) {
    return 0.5;
  }

  const pubMs = Date.parse(publishedAt);
  if (!Number.isFinite(pubMs)) {
    return 0.5;
  }

  const refMs = Number.isFinite(referenceDate.getTime())
    ? referenceDate.getTime()
    : Date.now();
  const deltaHours = Math.max(0, (refMs - pubMs) / (1000 * 60 * 60));

  if (deltaHours > 72) {
    return 0.05;
  }

  const decay = Math.exp((-Math.LN2 * deltaHours) / halfLifeHours);
  return Math.min(1.0, Math.max(0.0, decay));
}

export function calculateCorroborationScore(sourceCount: number): number {
  if (sourceCount <= 1) return 0.35;
  if (sourceCount === 2) return 0.65;
  if (sourceCount === 3) return 0.85;
  return 1.0;
}

export function calculateSourceTierScore(
  sources: readonly string[],
  getSourceType?: (sourceId: string) => SourceType | undefined,
): number {
  if (!getSourceType || sources.length === 0) {
    return 0.8;
  }

  let maxScore = 0.6;
  for (const sourceId of sources) {
    const type = getSourceType(sourceId);
    if (!type) continue;

    let score = 0.6;
    if (type === "official" || type === "primary") {
      score = 1.0;
    } else if (type === "research") {
      score = 0.9;
    } else if (type === "publisher") {
      score = 0.8;
    }

    if (score > maxScore) {
      maxScore = score;
    }
  }

  return maxScore;
}

export function calculateIndiaRelevanceScore(
  cluster: StoryCluster,
  getSourceRegion?: (sourceId: string) => SourceRegion | undefined,
): number {
  let isIndianSource = false;
  if (getSourceRegion) {
    for (const sourceId of cluster.sources) {
      const region = getSourceRegion(sourceId);
      if (region === "india" || region === "south-asia") {
        isIndianSource = true;
        break;
      }
    }
  } else {
    isIndianSource = true;
  }

  let baseScore = isIndianSource ? 0.8 : 0.35;

  const titleTokens = tokenizeTitle(cluster.representativeTitle);
  let entityMatch = false;

  for (const token of titleTokens.unigrams) {
    if (INDIAN_ENTITY_KEYWORDS.has(token)) {
      entityMatch = true;
      break;
    }
  }

  if (!entityMatch) {
    for (const bigram of titleTokens.bigrams) {
      if (INDIAN_ENTITY_KEYWORDS.has(bigram)) {
        entityMatch = true;
        break;
      }
    }
  }

  if (entityMatch) {
    baseScore = Math.min(1.0, baseScore + 0.25);
  }

  return baseScore;
}

export function calculateRepetitionPenalty(
  title: string,
  recentEditionTitles?: readonly string[],
): number {
  if (!recentEditionTitles || recentEditionTitles.length === 0) {
    return 0.0;
  }

  const titleTokens = tokenizeTitle(title);
  let maxDice = 0;

  for (const recentTitle of recentEditionTitles) {
    const recentTokens = tokenizeTitle(recentTitle);
    const dice = calculateDiceCoefficient(
      titleTokens.unigrams,
      recentTokens.unigrams,
    );
    if (dice > maxDice) {
      maxDice = dice;
    }
  }

  if (maxDice >= 0.7) {
    return 1.0;
  }
  if (maxDice >= 0.45) {
    return (maxDice - 0.45) / 0.25;
  }
  return 0.0;
}

export function calculateTopicWeight(topic: TopicSlug): number {
  return TOPIC_EDITORIAL_WEIGHTS[topic] ?? 0.7;
}

export function calculateCompositeScore(
  featureScores: CandidateFeatureScores,
  weights?: FeatureWeights,
  penaltyMultiplier: number = RANKING_DEFAULTS.repetitionPenaltyMultiplier,
): number {
  const wRecency = weights?.recency ?? RANKING_DEFAULTS.weights.recency;
  const wCorroboration =
    weights?.corroboration ?? RANKING_DEFAULTS.weights.corroboration;
  const wSourceTier =
    weights?.sourceTier ?? RANKING_DEFAULTS.weights.sourceTier;
  const wIndiaRelevance =
    weights?.indiaRelevance ?? RANKING_DEFAULTS.weights.indiaRelevance;
  const wTopicWeight =
    weights?.topicWeight ?? RANKING_DEFAULTS.weights.topicWeight;

  const totalWeight =
    wRecency + wCorroboration + wSourceTier + wIndiaRelevance + wTopicWeight;

  const normalizedTotalWeight = totalWeight > 0 ? totalWeight : 1.0;

  const weightedSum =
    (wRecency * featureScores.recency +
      wCorroboration * featureScores.corroboration +
      wSourceTier * featureScores.sourceTier +
      wIndiaRelevance * featureScores.indiaRelevance +
      wTopicWeight * featureScores.topicWeight) /
    normalizedTotalWeight;

  const penaltyFactor =
    1.0 - penaltyMultiplier * featureScores.repetitionPenalty;
  const finalScore = weightedSum * Math.max(0.0, penaltyFactor);

  return Math.min(1.0, Math.max(0.0, finalScore));
}
