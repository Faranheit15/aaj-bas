/**
 * Main validator entry points for factual support and hallucination containment.
 */

import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import {
  checkDateContainment,
  checkEditorialAlignment,
  checkEntityContainment,
  checkNumberContainment,
  checkSourceAttribution,
  checkUncertaintyOnConflict,
} from "./containment";
import { extractNamedEntities, extractNumbers } from "./extractors";
import {
  FACTUAL_VALIDATION_DEFAULTS,
  type FactualFinding,
  type FactualValidationOptions,
  type FactualValidationReport,
  type PromptExtractedFacts,
  type StoryFactualValidation,
} from "./types";

/**
 * Validates factual support and hallucination containment for a single story against its source cluster.
 */
export function validateStoryFactualSupport(
  story: Story,
  cluster: StoryCluster,
  extractedFacts?: PromptExtractedFacts | undefined,
  options?: FactualValidationOptions | undefined,
): StoryFactualValidation {
  const opts = { ...FACTUAL_VALIDATION_DEFAULTS, ...options };
  const findings: FactualFinding[] = [];

  // 1. Number containment
  if (opts.blockOnUnseenNumbers) {
    findings.push(...checkNumberContainment(story, cluster, opts));
  }

  // 2. Named entity containment
  if (opts.blockOnUnseenEntities) {
    findings.push(
      ...checkEntityContainment(story, cluster, extractedFacts, opts),
    );
  }

  // 3. Date / temporal containment
  findings.push(...checkDateContainment(story, cluster, opts));

  // 4. Source attribution check
  findings.push(...checkSourceAttribution(story, cluster));

  // 5. Editorial alignment check
  findings.push(...checkEditorialAlignment(story, cluster));

  // 6. Uncertainty on conflict check
  findings.push(...checkUncertaintyOnConflict(story, cluster));

  const blockingCount = findings.filter(
    (f) => f.severity === "blocking",
  ).length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const passed = blockingCount === 0;
  const publishable = passed;

  const fullText = [
    story.headline,
    story.deck,
    ...story.whatChanged,
    story.whyItMatters,
  ].join(" ");

  const storyNumbers = extractNumbers(fullText);
  const storyEntities = extractNamedEntities(fullText);

  const ungroundedNumbersCount = findings
    .filter((f) => f.ruleId === "fact/number-containment")
    .reduce((sum, f) => sum + (f.ungroundedTokens?.length ?? 0), 0);

  const ungroundedEntitiesCount = findings
    .filter((f) => f.ruleId === "fact/entity-containment")
    .reduce((sum, f) => sum + (f.ungroundedTokens?.length ?? 0), 0);

  const sourceAttributionScore =
    story.sourceIds.length > 0 &&
    findings.every((f) => f.ruleId !== "fact/source-attribution")
      ? 1.0
      : 0.0;

  return {
    storyId: story.id,
    headline: story.headline,
    clusterId: cluster.id,
    passed,
    publishable,
    blockingCount,
    warningCount,
    findings,
    metrics: {
      totalNumbersChecked: storyNumbers.size,
      ungroundedNumbersCount,
      totalEntitiesChecked: storyEntities.size,
      ungroundedEntitiesCount,
      sourceAttributionScore,
    },
  };
}

/**
 * Validates factual support across an entire set of stories in a draft edition.
 */
export function validateFactualSupport(
  storiesWithClusters: ReadonlyArray<{
    story: Story;
    cluster: StoryCluster;
    extractedFacts?: PromptExtractedFacts | undefined;
  }>,
  options?: FactualValidationOptions | undefined,
): FactualValidationReport {
  const results: StoryFactualValidation[] = [];

  for (const item of storiesWithClusters) {
    results.push(
      validateStoryFactualSupport(
        item.story,
        item.cluster,
        item.extractedFacts,
        options,
      ),
    );
  }

  const blockingCount = results.reduce((sum, r) => sum + r.blockingCount, 0);
  const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);
  const passed = blockingCount === 0;
  const publishable = passed;

  return {
    reportVersion: 1,
    passed,
    publishable,
    blockingCount,
    warningCount,
    stories: results,
  };
}
