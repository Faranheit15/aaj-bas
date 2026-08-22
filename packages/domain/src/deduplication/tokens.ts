/**
 * Title tokenization and normalization for duplicate detection.
 *
 * Prepares raw headlines by stripping publisher noise, tags, and stop words
 * while strictly preserving polarity words, quantities, entities, and n-grams.
 */

import type { TitleTokens } from "./types";

const LEADING_PREFIXES = [
  /^(?:live(?:\s+updates)?|breaking(?:\s+news)?|watch|opinion|analysis|explainer|exclusive|fact\s+check|editorial|report|video)\s*[:-]\s*/i,
  /^\[(?:live|video|audio|watch|photos?|explainer|opinion|analysis|editorial|exclusive|fact\s+check)\]\s*[:-]?\s*/i,
];

const TRAILING_PUBLISHERS = [
  /\s*(?:[-–—|/]\s*(?:The\s+Hindu|NDTV|Indian\s+Express|Hindustan\s+Times|Times\s+of\s+India|Mint|Scroll|The\s+Wire|BBC(?:\s+News)?|Reuters|PTI|ANI|LiveMint|Business\s+Standard|India\s+Today|Financial\s+Express|Moneycontrol|News18|Zee\s+News|ABP\s+News|Deccan\s+Herald|The\s+Print|Firstpost|Economic\s+Times))+\s*$/i,
];

const ENGLISH_NEWS_STOP_WORDS = new Set([
  "a",
  "about",
  "according",
  "after",
  "all",
  "also",
  "amid",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "may",
  "more",
  "most",
  "new",
  "now",
  "of",
  "off",
  "on",
  "once",
  "one",
  "only",
  "onto",
  "or",
  "other",
  "our",
  "out",
  "over",
  "said",
  "says",
  "she",
  "should",
  "so",
  "some",
  "such",
  "tells",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "under",
  "up",
  "upon",
  "us",
  "via",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

export function cleanTitle(title: string): string {
  let cleaned = title.normalize("NFKC").trim();

  for (const prefixRegex of LEADING_PREFIXES) {
    cleaned = cleaned.replace(prefixRegex, "").trim();
  }

  for (const suffixRegex of TRAILING_PUBLISHERS) {
    cleaned = cleaned.replace(suffixRegex, "").trim();
  }

  return cleaned;
}

export function tokenizeTitle(rawTitle: string): TitleTokens {
  const cleaned = cleanTitle(rawTitle);
  const normalized = cleaned
    .toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, "") // standardize comma numbers: 1,00,000 -> 100000
    .replace(/%/g, " percent ")
    .replace(/\bpts\b/gi, "points")
    .replace(/\bcr\b/gi, "crore")
    .replace(/\blac\b/gi, "lakh")
    .replace(/\bgovt\b/gi, "government")
    .replace(/[^\w\s.-]/g, " ") // replace punctuation (except decimals/hyphens in words) with spaces
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  const unigrams = new Set<string>();
  const significantTokens: string[] = [];
  const numbers = new Set<string>();

  for (const word of words) {
    const token = word.replace(/^[.-]+|[.-]+$/g, "");
    if (token.length === 0) {
      continue;
    }

    // Check if numeric
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      numbers.add(token);
      unigrams.add(token);
      significantTokens.push(token);
    } else if (token.length >= 2 && !ENGLISH_NEWS_STOP_WORDS.has(token)) {
      unigrams.add(token);
      significantTokens.push(token);
    }
  }

  const bigrams = new Set<string>();
  for (let i = 0; i < significantTokens.length - 1; i += 1) {
    const token1 = significantTokens[i];
    const token2 = significantTokens[i + 1];
    if (token1 && token2) {
      bigrams.add(`${token1} ${token2}`);
    }
  }

  return {
    raw: rawTitle,
    normalized,
    unigrams,
    bigrams,
    numbers,
    significantTokens,
  };
}
