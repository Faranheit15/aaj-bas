/**
 * Representative title selection for story clusters.
 *
 * Employs medoid / centroid similarity scoring combined with headline clarity
 * and length heuristics to select the most informative and consensus title.
 */

import {
  calculateTitleSimilarity,
  cleanTitle,
  tokenizeTitle,
} from "../deduplication";
import type { NormalizedFeedItem } from "../feed-normalization";

export interface RepresentativeTitleResult {
  readonly representativeTitle: string;
  readonly cleanedTitle: string;
}

export function selectRepresentativeTitle(
  items: readonly NormalizedFeedItem[],
): RepresentativeTitleResult {
  if (items.length === 0) {
    return {
      representativeTitle: "",
      cleanedTitle: "",
    };
  }

  if (items.length === 1) {
    const firstItem = items[0];
    if (firstItem) {
      return {
        representativeTitle: firstItem.title,
        cleanedTitle: cleanTitle(firstItem.title),
      };
    }
  }

  const tokenizedList = items.map((item) => tokenizeTitle(item.title));

  let bestItem = items[0];
  let bestScore = -1;

  for (let i = 0; i < items.length; i += 1) {
    const currentItem = items[i];
    const currentTokens = tokenizedList[i];
    if (!currentItem || !currentTokens) {
      continue;
    }

    // 1. Compute Medoid Similarity Score against all other items in cluster
    let totalSimilarity = 0;
    for (let j = 0; j < items.length; j += 1) {
      if (i !== j) {
        const otherTokens = tokenizedList[j];
        if (otherTokens) {
          totalSimilarity += calculateTitleSimilarity(
            currentTokens,
            otherTokens,
          );
        }
      }
    }
    const medoidScore = totalSimilarity / (items.length - 1);

    // 2. Compute Clarity and Length Heuristic
    const cleaned = cleanTitle(currentItem.title);
    const len = cleaned.length;
    let lengthScore = 1.0;
    if (len < 25) {
      lengthScore = 0.5;
    } else if (len > 120) {
      lengthScore = 0.7;
    }

    // Slight preference for titles that were already clean / without heavy publisher prefixes
    const cleanBonus = cleaned === currentItem.title ? 0.05 : 0.0;

    const compositeScore = 0.7 * medoidScore + 0.3 * lengthScore + cleanBonus;

    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      bestItem = currentItem;
    }
  }

  const winner = bestItem ?? items[0];
  const title = winner?.title ?? "";
  return {
    representativeTitle: title,
    cleanedTitle: cleanTitle(title),
  };
}
