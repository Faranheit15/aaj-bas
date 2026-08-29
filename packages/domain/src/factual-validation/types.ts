/**
 * Types and interfaces for factual support validation and hallucination containment.
 */

export type FactualRuleId =
  | "fact/number-containment"
  | "fact/entity-containment"
  | "fact/date-containment"
  | "fact/source-attribution"
  | "fact/editorial-alignment"
  | "fact/uncertainty-on-conflict";

export type FactualFindingSeverity = "blocking" | "warning";

export interface FactualFinding {
  readonly ruleId: FactualRuleId;
  readonly severity: FactualFindingSeverity;
  readonly message: string;
  readonly storyId?: string | undefined;
  readonly field?: string | undefined;
  readonly ungroundedTokens?: readonly string[] | undefined;
  readonly citedSources?: readonly string[] | undefined;
}

export interface FactualExtractedTokens {
  readonly numbers: readonly string[];
  readonly namedEntities: readonly string[];
  readonly dates: readonly string[];
}

export interface StoryFactualValidation {
  readonly storyId: string;
  readonly headline: string;
  readonly clusterId: string;
  readonly passed: boolean;
  readonly publishable: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly findings: readonly FactualFinding[];
  readonly metrics: {
    readonly totalNumbersChecked: number;
    readonly ungroundedNumbersCount: number;
    readonly totalEntitiesChecked: number;
    readonly ungroundedEntitiesCount: number;
    readonly sourceAttributionScore: number;
  };
}

export interface FactualValidationReport {
  readonly reportVersion: 1;
  readonly passed: boolean;
  readonly publishable: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly stories: readonly StoryFactualValidation[];
}

export interface FactualValidationOptions {
  readonly blockOnUnseenNumbers?: boolean | undefined;
  readonly blockOnUnseenEntities?: boolean | undefined;
  readonly blockOnUnseenDates?: boolean | undefined;
  readonly warnOnUncitedSources?: boolean | undefined;
  readonly minEntityLength?: number | undefined;
}

export const FACTUAL_VALIDATION_DEFAULTS: Required<FactualValidationOptions> = {
  blockOnUnseenNumbers: true,
  blockOnUnseenEntities: true,
  blockOnUnseenDates: true,
  warnOnUncitedSources: true,
  minEntityLength: 2,
};
