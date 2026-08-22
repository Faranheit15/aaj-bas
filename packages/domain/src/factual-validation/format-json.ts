/**
 * JSON serialization formatter for factual validation reports.
 */

import type {
  FactualFinding,
  FactualValidationReport,
  StoryFactualValidation,
} from "./types";

export interface FactualFindingJson {
  ruleId: string;
  severity: "blocking" | "warning";
  message: string;
  storyId?: string;
  field?: string;
  ungroundedTokens?: string[];
  citedSources?: string[];
}

export interface StoryFactualValidationJson {
  storyId: string;
  headline: string;
  clusterId: string;
  passed: boolean;
  publishable: boolean;
  blockingCount: number;
  warningCount: number;
  findings: FactualFindingJson[];
  metrics: {
    totalNumbersChecked: number;
    ungroundedNumbersCount: number;
    totalEntitiesChecked: number;
    ungroundedEntitiesCount: number;
    sourceAttributionScore: number;
  };
}

export interface FactualValidationReportJson {
  reportVersion: 1;
  passed: boolean;
  publishable: boolean;
  blockingCount: number;
  warningCount: number;
  stories: StoryFactualValidationJson[];
}

function findingToJson(finding: FactualFinding): FactualFindingJson {
  const json: FactualFindingJson = {
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
  };
  if (finding.storyId !== undefined) json.storyId = finding.storyId;
  if (finding.field !== undefined) json.field = finding.field;
  if (finding.ungroundedTokens !== undefined) {
    json.ungroundedTokens = Array.from(finding.ungroundedTokens);
  }
  if (finding.citedSources !== undefined) {
    json.citedSources = Array.from(finding.citedSources);
  }
  return json;
}

function storyValidationToJson(
  story: StoryFactualValidation,
): StoryFactualValidationJson {
  return {
    storyId: story.storyId,
    headline: story.headline,
    clusterId: story.clusterId,
    passed: story.passed,
    publishable: story.publishable,
    blockingCount: story.blockingCount,
    warningCount: story.warningCount,
    findings: story.findings.map(findingToJson),
    metrics: { ...story.metrics },
  };
}

export function toFactualValidationReportJson(
  report: FactualValidationReport,
): FactualValidationReportJson {
  return {
    reportVersion: 1,
    passed: report.passed,
    publishable: report.publishable,
    blockingCount: report.blockingCount,
    warningCount: report.warningCount,
    stories: report.stories.map(storyValidationToJson),
  };
}
