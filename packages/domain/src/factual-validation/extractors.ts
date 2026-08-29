/**
 * Deterministic token, number, entity, and date extraction from text for factual support validation.
 */

import type { FactualExtractedTokens } from "./types";

const SPELLED_NUMBERS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
  lakh: "100000",
  million: "1000000",
  crore: "10000000",
  billion: "1000000000",
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
};

export const COMMON_INITIAL_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "with",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "according",
  "officials",
  "sources",
  "however",
  "meanwhile",
  "additionally",
  "furthermore",
  "under",
  "after",
  "before",
  "during",
  "following",
  "earlier",
  "reportedly",
  "notably",
  "moreover",
  "upgrades",
  "launches",
  "announces",
  "reports",
  "states",
  "confirms",
  "reveals",
  "adds",
  "expands",
  "second",
  "new",
  "first",
]);

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
];

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * Normalizes numeric token strings for robust matching.
 * E.g. "1,00,000" -> "100000", "₹500" -> "500", "15.0" -> "15".
 */
export function normalizeNumberToken(token: string): string {
  const lower = token.toLowerCase().trim();
  if (SPELLED_NUMBERS[lower]) {
    return SPELLED_NUMBERS[lower];
  }

  // Remove currency symbols, commas, percent signs
  const cleaned = lower.replace(/[₹$€£,%\s]/g, "");
  const num = Number.parseFloat(cleaned);
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    // Return standard decimal or integer representation
    return String(num);
  }
  return cleaned;
}

/**
 * Extracts numeric tokens from a text string.
 */
export function extractNumbers(text: string): Set<string> {
  const numbers = new Set<string>();
  if (!text) return numbers;

  // Regex for digits with optional decimals, commas, percent, currency, or unit multipliers
  const digitRegex =
    /(?:[₹$€£]\s*)?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?:\s*(?:%|percent|\bcrore\b|\blakh\b|\bmillion\b|\bbillion\b)|[BMKbmk]\b)?/gi;
  const digitMatches = text.match(digitRegex);
  if (digitMatches) {
    for (const match of digitMatches) {
      const trimmed = match.trim();
      if (trimmed.length > 0) {
        numbers.add(trimmed);
        const normalized = normalizeNumberToken(trimmed);
        if (normalized) {
          numbers.add(normalized);
        }
        const bareDigits = trimmed.replace(/[^\d.]/g, "");
        if (bareDigits) {
          numbers.add(bareDigits);
          const bareNorm = normalizeNumberToken(bareDigits);
          if (bareNorm) numbers.add(bareNorm);
        }
      }
    }
  }

  // Check spelled-out numbers
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  for (const word of words) {
    if (SPELLED_NUMBERS[word]) {
      numbers.add(word);
      numbers.add(SPELLED_NUMBERS[word]);
    }
  }

  return numbers;
}

/**
 * Extracts named entities (acronyms, capitalized noun phrases, institutions).
 */
export function extractNamedEntities(text: string, minLen = 2): Set<string> {
  const entities = new Set<string>();
  if (!text) return entities;

  // 1. Acronyms (e.g. ISRO, NavIC, NDMA, RBI, SEBI, SC, HC, IIT, AIIMS)
  const acronymRegex = /\b[A-Z]{2,10}\b|\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g;
  const acronymMatches = text.match(acronymRegex);
  if (acronymMatches) {
    for (const acr of acronymMatches) {
      if (acr.length >= minLen) {
        entities.add(acr);
      }
    }
  }

  // 2. Multi-word capitalized phrases (e.g. "Supreme Court", "Satish Dhawan Space Centre", "Ministry of Finance")
  const phraseRegex =
    /\b[A-Z][a-z]+(?:\s+(?:of|and|the|for|in|on|at)?\s*[A-Z][a-z]+)+\b/g;
  const phraseMatches = text.match(phraseRegex);
  if (phraseMatches) {
    for (const phrase of phraseMatches) {
      const words = phrase.split(/\s+/);
      const firstWordLower = words[0]?.toLowerCase() ?? "";
      if (COMMON_INITIAL_WORDS.has(firstWordLower) && words.length > 2) {
        const remaining = words.slice(1).join(" ");
        if (remaining.length >= minLen) {
          entities.add(remaining);
        }
      } else if (
        !COMMON_INITIAL_WORDS.has(firstWordLower) &&
        phrase.length >= minLen
      ) {
        entities.add(phrase);
      }
    }
  }

  return entities;
}

/**
 * Extracts date and temporal anchor strings.
 */
export function extractDates(text: string): Set<string> {
  const dates = new Set<string>();
  if (!text) return dates;

  const lower = text.toLowerCase();

  // 1. ISO dates: 2026-08-22
  const isoRegex = /\b\d{4}-\d{2}-\d{2}\b/g;
  const isoMatches = text.match(isoRegex);
  if (isoMatches) {
    for (const m of isoMatches) dates.add(m);
  }

  // 2. Formatted calendar dates: e.g. "22 August", "August 22", "Aug 22, 2026"
  const monthRegex = new RegExp(
    `\\b(?:${MONTH_NAMES.join("|")})\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b|\\b\\d{1,2}\\s+(?:${MONTH_NAMES.join("|")})(?:\\s+\\d{4})?\\b`,
    "gi",
  );
  const monthMatches = text.match(monthRegex);
  if (monthMatches) {
    for (const m of monthMatches) dates.add(m.trim());
  }

  // 3. Weekday mentions
  for (const day of WEEKDAY_NAMES) {
    if (new RegExp(`\\b${day}\\b`, "i").test(lower)) {
      dates.add(day);
    }
  }

  // 4. Relative time anchors
  const relativeWords = [
    "yesterday",
    "today",
    "tomorrow",
    "tonight",
    "last week",
  ];
  for (const rel of relativeWords) {
    if (new RegExp(`\\b${rel}\\b`, "i").test(lower)) {
      dates.add(rel);
    }
  }

  return dates;
}

/**
 * Extracts combined numbers, entities, and dates from story text.
 */
export function extractFactTokens(text: string): FactualExtractedTokens {
  return {
    numbers: Array.from(extractNumbers(text)),
    namedEntities: Array.from(extractNamedEntities(text)),
    dates: Array.from(extractDates(text)),
  };
}
