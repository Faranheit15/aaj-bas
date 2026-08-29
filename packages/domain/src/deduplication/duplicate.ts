/**
 * Pairwise duplicate identification and classification.
 *
 * Implements exact and near-duplicate decision rules based on canonical URLs,
 * content hashes, source GUIDs, title similarity heuristics, and publication window constraints.
 */

import type { NormalizedFeedItem } from "../feed-normalization";
import {
  calculateTitleSimilarity,
  findCommonTokens,
  hasNumericConflict,
} from "./similarity";
import { tokenizeTitle } from "./tokens";
import {
  type DeduplicationOptions,
  DEDUPLICATION_DEFAULTS,
  type DuplicateMatchResult,
  type ExactDuplicateReason,
} from "./types";

export function getExactDuplicateReason(
  itemA: NormalizedFeedItem,
  itemB: NormalizedFeedItem,
): ExactDuplicateReason | null {
  if (itemA.url !== null && itemB.url !== null && itemA.url === itemB.url) {
    return "canonical_url";
  }

  if (itemA.contentHash === itemB.contentHash) {
    return "content_hash";
  }

  if (
    itemA.sourceId === itemB.sourceId &&
    itemA.guid === itemB.guid &&
    !itemA.guid.startsWith("content-")
  ) {
    return "source_guid";
  }

  return null;
}

export function isExactDuplicate(
  itemA: NormalizedFeedItem,
  itemB: NormalizedFeedItem,
): boolean {
  return getExactDuplicateReason(itemA, itemB) !== null;
}

export function calculateTimeDeltaHours(
  dateA: string | null,
  dateB: string | null,
): number | null {
  if (dateA === null || dateB === null) {
    return null;
  }

  const msA = Date.parse(dateA);
  const msB = Date.parse(dateB);

  if (!Number.isFinite(msA) || !Number.isFinite(msB)) {
    return null;
  }

  return Math.abs(msA - msB) / (1000 * 60 * 60);
}

export function classifyDuplicate(
  itemA: NormalizedFeedItem,
  itemB: NormalizedFeedItem,
  options?: DeduplicationOptions,
): DuplicateMatchResult {
  const exactReason = getExactDuplicateReason(itemA, itemB);
  if (exactReason !== null) {
    return {
      matchType: "exact",
      reason: exactReason,
    };
  }

  const maxTimeDeltaHours =
    options?.maxTimeDeltaHours ?? DEDUPLICATION_DEFAULTS.maxTimeDeltaHours;
  const timeDeltaHours = calculateTimeDeltaHours(
    itemA.publishedAt,
    itemB.publishedAt,
  );

  if (timeDeltaHours !== null && timeDeltaHours > maxTimeDeltaHours) {
    return {
      matchType: "distinct",
      reason: `publication time difference (${Math.round(timeDeltaHours)}h) exceeds threshold of ${maxTimeDeltaHours}h`,
    };
  }

  const tokensA = tokenizeTitle(itemA.title);
  const tokensB = tokenizeTitle(itemB.title);

  if (
    (options?.penalizeNumericMismatch ??
      DEDUPLICATION_DEFAULTS.penalizeNumericMismatch) &&
    hasNumericConflict(tokensA, tokensB)
  ) {
    return {
      matchType: "distinct",
      score: 0.0,
      reason: "conflicting numeric quantities in titles",
    };
  }

  const commonTokens = findCommonTokens(tokensA, tokensB);

  const minCommonSignificantTokens =
    options?.minCommonSignificantTokens ??
    DEDUPLICATION_DEFAULTS.minCommonSignificantTokens;

  // Short titles with fewer than minCommon tokens can match if they have >= 2 common tokens and 100% precision
  const minRequiredTokens = Math.min(
    minCommonSignificantTokens,
    Math.min(tokensA.unigrams.size, tokensB.unigrams.size),
  );

  if (commonTokens.length < minRequiredTokens) {
    return {
      matchType: "distinct",
      score: 0.0,
      reason: `insufficient common tokens (${commonTokens.length} < ${minRequiredTokens})`,
    };
  }

  const score = calculateTitleSimilarity(tokensA, tokensB, options);
  const threshold =
    options?.titleSimilarityThreshold ??
    DEDUPLICATION_DEFAULTS.titleSimilarityThreshold;

  if (score >= threshold) {
    return {
      matchType: "near",
      score,
      commonTokens,
      timeDeltaHours,
    };
  }

  return {
    matchType: "distinct",
    score,
    reason: `title similarity score (${score.toFixed(2)}) below threshold (${threshold.toFixed(2)})`,
  };
}

export function isNearDuplicate(
  itemA: NormalizedFeedItem,
  itemB: NormalizedFeedItem,
  options?: DeduplicationOptions,
): boolean {
  const classification = classifyDuplicate(itemA, itemB, options);
  return (
    classification.matchType === "exact" || classification.matchType === "near"
  );
}
