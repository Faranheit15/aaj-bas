/**
 * Domain types for draft edition generation pipeline.
 */

import type { Edition } from "@aaj-bas/schemas";
import type {
  CandidateRankingResult,
  RankingOptions,
} from "../candidate-ranking";
import type { EditionValidation } from "../edition-validation";
import type {
  FactualValidationOptions,
  FactualValidationReport,
} from "../factual-validation";
import type { NormalizedFeedItem, RawFeedItem } from "../feed-normalization";
import type { SourceRegistry } from "../source-registry";
import type { StorySummarizer } from "../summarization";

export type IngestionSourceStatus =
  | "success"
  | "not-modified"
  | "fetch-failure"
  | "parse-failure";

export interface SourceIngestionDiagnostic {
  readonly sourceId: string;
  readonly status: IngestionSourceStatus;
  readonly httpStatus?: number | undefined;
  readonly itemCount: number;
  readonly durationMs?: number | undefined;
  readonly error?: string | undefined;
}

export interface IngestionDiagnostics {
  readonly fixtureMode: boolean;
  readonly totalActiveSources: number;
  readonly successfulSources: number;
  readonly notModifiedSources: number;
  readonly failedSources: number;
  readonly totalParsedItems: number;
  readonly sources: readonly SourceIngestionDiagnostic[];
}

export interface EditionPipelineInput {
  /** Target edition date in YYYY-MM-DD format. Defaults to current date. */
  readonly date?: string | undefined;
  /** Raw feed items mapped by source ID (will be normalized and deduplicated). */
  readonly rawItemsBySource?:
    | ReadonlyMap<string, readonly RawFeedItem[]>
    | undefined;
  /** Pre-normalized feed items. */
  readonly normalizedItems?: readonly NormalizedFeedItem[] | undefined;
  /** Source registry for metadata resolution. */
  readonly sourceRegistry?: SourceRegistry | undefined;
  /** Ingestion diagnostics metadata. */
  readonly ingestionDiagnostics?: IngestionDiagnostics | undefined;
  /** Story summarizer provider. Defaults to DeterministicFallbackSummarizer. */
  readonly summarizer?: StorySummarizer | undefined;
  /** Ranking and candidate composition options. */
  readonly rankingOptions?: RankingOptions | undefined;
  /** Factual support validation options. */
  readonly factualValidationOptions?: FactualValidationOptions | undefined;
}

export interface DraftEditionPipelineResult {
  /** The assembled and validated draft Edition document. */
  readonly edition: Edition;
  /** Formatted JSON string of the draft Edition. */
  readonly editionJson: string;
  /** Diagnostic Markdown summary for embedding in daily PR descriptions. */
  readonly summaryMarkdown: string;
  /** Detailed candidate ranking and composition outcome. */
  readonly rankingResult: CandidateRankingResult;
  /** Factual support validation report across all generated stories. */
  readonly factualReport: FactualValidationReport;
  /** Structural and editorial edition validation report. */
  readonly editionValidation: EditionValidation;
  /** Ingestion diagnostics metadata. */
  readonly ingestionDiagnostics?: IngestionDiagnostics | undefined;
  /** Whether the draft edition is valid and free of blocking findings. */
  readonly isPublishable: boolean;
  /** Whether any blocking factual support or schema findings exist. */
  readonly hasBlockingIssues: boolean;
  /** Pipeline performance and inventory diagnostics. */
  readonly diagnostics: {
    readonly editionDate: string;
    readonly totalRawItems: number;
    readonly totalNormalizedItems: number;
    readonly totalClusters: number;
    readonly coreStoriesCount: number;
    readonly poolStoriesCount: number;
    readonly distinctPublishersCount: number;
    readonly durationMs: number;
  };
}

export const PIPELINE_EXIT_CODES = {
  pass: 0,
  blockingFindings: 1,
  usage: 2,
  internal: 4,
} as const;
