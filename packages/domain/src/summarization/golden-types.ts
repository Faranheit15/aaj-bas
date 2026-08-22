/**
 * Types and contracts for prompt golden dataset evaluation.
 */

import type { ReportingType, Story, TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import type { FactualRuleId } from "../factual-validation";
import type { PromptExtractedFacts, PromptSummaryResult } from "./prompt";
import type { StorySummarizer } from "./types";

/**
 * A negative sample with an intentional hallucination or defect to test validator trap rate.
 */
export interface GoldenNegativeSample {
  readonly name: string;
  readonly story: Partial<Story>;
  readonly expectedBlockedRule: FactualRuleId;
}

/**
 * A golden test case comprising a source cluster, expected metadata, golden summary, and negative traps.
 */
export interface GoldenClusterTestCase {
  readonly id: string;
  readonly topic: TopicSlug;
  readonly description: string;
  readonly cluster: StoryCluster;
  readonly expectedReportingType: ReportingType;
  readonly expectedFacts: PromptExtractedFacts;
  readonly forbiddenHallucinations: readonly string[];
  readonly requiresUncertainty: boolean;
  readonly goldenResult: PromptSummaryResult;
  readonly negativeSamples: readonly GoldenNegativeSample[];
}

/**
 * Result of evaluating a single golden test case.
 */
export interface GoldenTestCaseEvaluation {
  readonly testCaseId: string;
  readonly topic: TopicSlug;
  readonly passed: boolean;
  readonly promptCompiled: boolean;
  readonly goldenPassed: boolean;
  readonly fallbackPassed: boolean;
  readonly negativeTrapsTotal: number;
  readonly negativeTrapsCaught: number;
  readonly blockingFindings: readonly string[];
  readonly warningFindings: readonly string[];
}

/**
 * Aggregate metrics across the entire golden dataset evaluation.
 */
export interface GoldenEvaluationMetrics {
  readonly totalTestCases: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly passRate: number;
  readonly totalNegativeTraps: number;
  readonly negativeTrapsCaught: number;
  readonly trapDetectionRate: number;
  readonly numberContainmentScore: number;
  readonly entityContainmentScore: number;
  readonly attributionScore: number;
  readonly uncertaintyScore: number;
}

/**
 * Full golden evaluation report.
 */
export interface GoldenEvaluationReport {
  readonly reportVersion: 1;
  readonly passed: boolean;
  readonly evaluatedAt: string;
  readonly summarizerName: string;
  readonly metrics: GoldenEvaluationMetrics;
  readonly testCases: readonly GoldenTestCaseEvaluation[];
}

/**
 * JSON serialization representation of golden evaluation report.
 */
export interface GoldenEvaluationReportJson {
  readonly reportVersion: 1;
  readonly passed: boolean;
  readonly evaluatedAt: string;
  readonly summarizerName: string;
  readonly metrics: GoldenEvaluationMetrics;
  readonly testCases: readonly GoldenTestCaseEvaluation[];
}

/**
 * Configuration options for evaluating golden dataset.
 */
export interface GoldenEvaluationOptions {
  readonly summarizer?: StorySummarizer | undefined;
  readonly referenceDate?: string | undefined;
}

/**
 * Standard exit codes for golden dataset runner.
 */
export const GOLDEN_EXIT_CODES = {
  pass: 0,
  fail: 1,
  usage: 2,
  internal: 4,
} as const;
