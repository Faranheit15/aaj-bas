/**
 * Similarity calculation between tokenized titles.
 *
 * Employs Sørensen–Dice unigram and bigram coefficients with token overlap
 * and numeric conflict penalties to prevent false clustering on unrelated entity occurrences.
 */

import {
  type DeduplicationOptions,
  DEDUPLICATION_DEFAULTS,
  type TitleTokens,
} from "./types";

export function calculateDiceCoefficient(
  setA: ReadonlySet<string>,
  setB: ReadonlySet<string>,
): number {
  if (setA.size === 0 && setB.size === 0) {
    return 1.0;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0.0;
  }

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount += 1;
    }
  }

  return (2.0 * intersectionCount) / (setA.size + setB.size);
}

export function calculateOverlapCoefficient(
  setA: ReadonlySet<string>,
  setB: ReadonlySet<string>,
): number {
  if (setA.size === 0 || setB.size === 0) {
    return 0.0;
  }

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount += 1;
    }
  }

  return intersectionCount / Math.min(setA.size, setB.size);
}

export function findCommonTokens(
  tokensA: TitleTokens,
  tokensB: TitleTokens,
): string[] {
  const common: string[] = [];
  for (const token of tokensA.unigrams) {
    if (tokensB.unigrams.has(token)) {
      common.push(token);
    }
  }
  return common;
}

export function hasNumericConflict(
  tokensA: TitleTokens,
  tokensB: TitleTokens,
): boolean {
  if (tokensA.numbers.size === 0 || tokensB.numbers.size === 0) {
    return false;
  }

  // Check if there is at least one shared number
  for (const num of tokensA.numbers) {
    if (tokensB.numbers.has(num)) {
      return false;
    }
  }

  // Both have numbers, but zero overlap
  return true;
}

export function calculateTitleSimilarity(
  tokensA: TitleTokens,
  tokensB: TitleTokens,
  options?: DeduplicationOptions,
): number {
  const unigramWeight =
    options?.unigramWeight ?? DEDUPLICATION_DEFAULTS.unigramWeight;
  const bigramWeight =
    options?.bigramWeight ?? DEDUPLICATION_DEFAULTS.bigramWeight;
  const penalizeNumericMismatch =
    options?.penalizeNumericMismatch ??
    DEDUPLICATION_DEFAULTS.penalizeNumericMismatch;
  const numericMismatchPenalty =
    options?.numericMismatchPenalty ??
    DEDUPLICATION_DEFAULTS.numericMismatchPenalty;

  const unigramDice = calculateDiceCoefficient(
    tokensA.unigrams,
    tokensB.unigrams,
  );
  const unigramOverlap = calculateOverlapCoefficient(
    tokensA.unigrams,
    tokensB.unigrams,
  );
  const unigramScore = 0.5 * unigramDice + 0.5 * unigramOverlap;

  let rawScore: number;
  if (tokensA.bigrams.size > 0 && tokensB.bigrams.size > 0) {
    const bigramDice = calculateDiceCoefficient(
      tokensA.bigrams,
      tokensB.bigrams,
    );
    rawScore = Math.max(
      unigramScore * 0.9,
      unigramWeight * unigramScore + bigramWeight * bigramDice,
    );
  } else {
    rawScore = unigramScore;
  }

  if (penalizeNumericMismatch && hasNumericConflict(tokensA, tokensB)) {
    rawScore = Math.max(0, rawScore - numericMismatchPenalty);
  }

  return Math.min(1.0, Math.max(0.0, rawScore));
}
