/**
 * Domain types and defaults for exact and near-duplicate detection.
 *
 * This module defines the contracts for pairwise duplicate matching, title
 * tokenization, and similarity scoring used in the ingestion deduplication pipeline.
 */

export type ExactDuplicateReason =
  | "canonical_url"
  | "content_hash"
  | "source_guid";

export type DuplicateMatchResult =
  | {
      readonly matchType: "exact";
      readonly reason: ExactDuplicateReason;
    }
  | {
      readonly matchType: "near";
      readonly score: number;
      readonly commonTokens: readonly string[];
      readonly timeDeltaHours: number | null;
    }
  | {
      readonly matchType: "distinct";
      readonly score?: number | undefined;
      readonly reason?: string | undefined;
    };

export interface DeduplicationOptions {
  /** Maximum publication time difference (in hours) allowed for near-duplicates. Defaults to 72. */
  readonly maxTimeDeltaHours?: number | undefined;
  /** Minimum similarity score [0..1] required for near-duplicate match. Defaults to 0.48. */
  readonly titleSimilarityThreshold?: number | undefined;
  /** Minimum number of overlapping significant tokens required. Defaults to 2. */
  readonly minCommonSignificantTokens?: number | undefined;
  /** Weight for unigram score component. Defaults to 0.7. */
  readonly unigramWeight?: number | undefined;
  /** Weight for bigram score component. Defaults to 0.3. */
  readonly bigramWeight?: number | undefined;
  /** Whether to penalize numeric token conflicts. Defaults to true. */
  readonly penalizeNumericMismatch?: boolean | undefined;
  /** Penalty applied to score when numeric tokens conflict. Defaults to 0.5. */
  readonly numericMismatchPenalty?: number | undefined;
}

export const DEDUPLICATION_DEFAULTS = {
  maxTimeDeltaHours: 72,
  titleSimilarityThreshold: 0.48,
  minCommonSignificantTokens: 2,
  unigramWeight: 0.7,
  bigramWeight: 0.3,
  penalizeNumericMismatch: true,
  numericMismatchPenalty: 0.5,
} as const;

export interface TitleTokens {
  readonly raw: string;
  readonly normalized: string;
  readonly unigrams: ReadonlySet<string>;
  readonly bigrams: ReadonlySet<string>;
  readonly numbers: ReadonlySet<string>;
  readonly significantTokens: readonly string[];
}
