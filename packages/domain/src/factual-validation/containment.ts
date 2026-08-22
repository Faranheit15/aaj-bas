/**
 * Factual containment, source attribution, and epistemic alignment verification rules.
 */

import type { Story } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { hasNumericConflict, tokenizeTitle } from "../deduplication";
import type { PromptExtractedFacts } from "../summarization";
import {
  COMMON_INITIAL_WORDS,
  extractDates,
  extractNamedEntities,
  extractNumbers,
  normalizeNumberToken,
} from "./extractors";
import type { FactualFinding, FactualValidationOptions } from "./types";

/**
 * Combines all textual content of a story into a single concatenated string.
 */
export function getStoryFullText(story: Story): string {
  return [
    story.headline,
    story.deck,
    ...story.whatChanged,
    story.whyItMatters,
    story.background ?? "",
    story.uncertainty ?? "",
  ].join(" ");
}

/**
 * Combines all textual content of a cluster's feed items into a single string.
 */
export function getClusterFullText(cluster: StoryCluster): string {
  return cluster.items
    .map((item) => `${item.title} ${item.description ?? ""}`)
    .join(" ");
}

/**
 * Checks that all numbers mentioned in the story are grounded in the source cluster.
 */
export function checkNumberContainment(
  story: Story,
  cluster: StoryCluster,
  _options: FactualValidationOptions = {},
): FactualFinding[] {
  const findings: FactualFinding[] = [];
  const storyText = getStoryFullText(story);
  const clusterText = getClusterFullText(cluster);

  const storyNumbers = extractNumbers(storyText);
  const clusterNumbers = extractNumbers(clusterText);

  // Normalize cluster numbers for lookup
  const normalizedClusterNumbers = new Set<string>();
  for (const num of clusterNumbers) {
    normalizedClusterNumbers.add(num.toLowerCase());
    const norm = normalizeNumberToken(num);
    if (norm) normalizedClusterNumbers.add(norm);
  }

  const ungroundedNumbers: string[] = [];

  for (const rawNum of storyNumbers) {
    const numLower = rawNum.toLowerCase();
    const normalized = normalizeNumberToken(rawNum);

    // If neither raw nor normalized token matches any cluster number
    if (
      !normalizedClusterNumbers.has(numLower) &&
      !normalizedClusterNumbers.has(normalized)
    ) {
      ungroundedNumbers.push(rawNum);
    }
  }

  if (ungroundedNumbers.length > 0) {
    findings.push({
      ruleId: "fact/number-containment",
      severity: "blocking",
      message: `Story contains ${ungroundedNumbers.length} number(s) not grounded in source cluster items: [${ungroundedNumbers.join(", ")}]`,
      storyId: story.id,
      ungroundedTokens: ungroundedNumbers,
    });
  }

  return findings;
}

/**
 * Checks that all named entities in the story are grounded in the source cluster.
 */
export function checkEntityContainment(
  story: Story,
  cluster: StoryCluster,
  extractedFacts?: PromptExtractedFacts | undefined,
  _options: FactualValidationOptions = {},
): FactualFinding[] {
  const findings: FactualFinding[] = [];
  const storyText = getStoryFullText(story);
  const clusterText = getClusterFullText(cluster);
  const clusterTextLower = clusterText.toLowerCase();

  const storyEntities = extractNamedEntities(storyText);
  if (extractedFacts?.namedEntities) {
    for (const ent of extractedFacts.namedEntities) {
      if (ent && ent.trim().length >= 2) {
        storyEntities.add(ent.trim());
      }
    }
  }

  const ungroundedEntities: string[] = [];

  for (const entity of storyEntities) {
    const entityLower = entity.toLowerCase();
    // Check if the entity (or individual component words if multi-word) exists in cluster text
    if (!clusterTextLower.includes(entityLower)) {
      const words = entityLower
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !COMMON_INITIAL_WORDS.has(w));
      const allWordsPresent =
        words.length > 0 && words.every((w) => clusterTextLower.includes(w));

      if (!allWordsPresent) {
        ungroundedEntities.push(entity);
      }
    }
  }

  if (ungroundedEntities.length > 0) {
    findings.push({
      ruleId: "fact/entity-containment",
      severity: "blocking",
      message: `Story contains ${ungroundedEntities.length} named entity/entities not grounded in source cluster items: [${ungroundedEntities.join(", ")}]`,
      storyId: story.id,
      ungroundedTokens: ungroundedEntities,
    });
  }

  return findings;
}

/**
 * Checks that temporal/date references in the story match cluster timestamps or text.
 */
export function checkDateContainment(
  story: Story,
  cluster: StoryCluster,
  _options: FactualValidationOptions = {},
): FactualFinding[] {
  const findings: FactualFinding[] = [];
  const storyText = getStoryFullText(story);
  const clusterText = getClusterFullText(cluster);

  const storyDates = extractDates(storyText);
  const clusterDates = extractDates(clusterText);

  // Also include cluster publication timestamps in allowed date references with explicit timezone
  for (const item of cluster.items) {
    if (item.publishedAt) {
      const isoDate = item.publishedAt.slice(0, 10);
      clusterDates.add(isoDate);
      // Day of week in Asia/Kolkata timezone
      const dayName = new Date(item.publishedAt)
        .toLocaleDateString("en-US", {
          timeZone: "Asia/Kolkata",
          weekday: "long",
        })
        .toLowerCase();
      if (dayName) clusterDates.add(dayName);
    }
  }

  const clusterDatesLower = new Set(
    Array.from(clusterDates).map((d) => d.toLowerCase()),
  );

  const ungroundedDates: string[] = [];

  for (const d of storyDates) {
    const dLower = d.toLowerCase();
    if (!clusterDatesLower.has(dLower)) {
      ungroundedDates.push(d);
    }
  }

  if (ungroundedDates.length > 0) {
    findings.push({
      ruleId: "fact/date-containment",
      severity: "warning",
      message: `Story contains temporal reference(s) not directly mentioned in cluster: [${ungroundedDates.join(", ")}]`,
      storyId: story.id,
      ungroundedTokens: ungroundedDates,
    });
  }

  return findings;
}

/**
 * Checks that cited source IDs exist and match the cluster sources.
 */
export function checkSourceAttribution(
  story: Story,
  cluster: StoryCluster,
): FactualFinding[] {
  const findings: FactualFinding[] = [];
  const allowedSources = new Set(
    cluster.sources.length > 0
      ? cluster.sources
      : cluster.items.map((i) => i.sourceId),
  );

  if (story.sourceIds.length === 0) {
    findings.push({
      ruleId: "fact/source-attribution",
      severity: "blocking",
      message: "Story has empty sourceIds list.",
      storyId: story.id,
    });
    return findings;
  }

  const unknownSources: string[] = [];
  for (const src of story.sourceIds) {
    if (!allowedSources.has(src)) {
      unknownSources.push(src);
    }
  }

  if (unknownSources.length > 0) {
    findings.push({
      ruleId: "fact/source-attribution",
      severity: "blocking",
      message: `Story cites unknown source ID(s) not present in cluster: [${unknownSources.join(", ")}]`,
      storyId: story.id,
      citedSources: unknownSources,
    });
  }

  return findings;
}

/**
 * Checks that editorial reporting labels align with source natures.
 */
export function checkEditorialAlignment(
  story: Story,
  cluster: StoryCluster,
): FactualFinding[] {
  const findings: FactualFinding[] = [];

  // Check if all cluster titles suggest opinion/editorial pieces
  const allOpinion =
    cluster.items.length > 0 &&
    cluster.items.every((i) =>
      /\b(opinion|editorial|column|view|analysis|perspective)\b/i.test(i.title),
    );

  if (allOpinion && story.reportingType === "reporting") {
    findings.push({
      ruleId: "fact/editorial-alignment",
      severity: "blocking",
      message:
        "Cluster items are all opinion/commentary, but story is marked as objective 'reporting'. ReportingType must be 'opinion' or 'analysis'.",
      storyId: story.id,
    });
  }

  return findings;
}

/**
 * Checks that if cluster items contain conflicting numbers/facts,
 * the story either carries confidence: 'disputed' or populates uncertainty.
 */
export function checkUncertaintyOnConflict(
  story: Story,
  cluster: StoryCluster,
): FactualFinding[] {
  const findings: FactualFinding[] = [];

  // Check pairwise items for numeric conflicts
  let hasConflict = false;
  let conflictDetail = "";

  if (cluster.items.length >= 2) {
    for (let i = 0; i < cluster.items.length; i += 1) {
      for (let j = i + 1; j < cluster.items.length; j += 1) {
        const itemA = cluster.items[i];
        const itemB = cluster.items[j];
        if (!itemA || !itemB) continue;

        const tokensA = tokenizeTitle(itemA.title);
        const tokensB = tokenizeTitle(itemB.title);
        if (hasNumericConflict(tokensA, tokensB)) {
          hasConflict = true;
          conflictDetail = `Conflicting numbers detected in titles between '${itemA.sourceId}' and '${itemB.sourceId}'`;
          break;
        }
      }
      if (hasConflict) break;
    }
  }

  if (hasConflict) {
    const hasUncertaintyText =
      typeof story.uncertainty === "string" &&
      story.uncertainty.trim().length >= 20;
    const isDisputed = story.confidence === "disputed";

    if (!hasUncertaintyText && !isDisputed) {
      findings.push({
        ruleId: "fact/uncertainty-on-conflict",
        severity: "blocking",
        message: `Source cluster has factual/numeric disagreements (${conflictDetail}), but story presents settled consensus without uncertainty text or disputed confidence.`,
        storyId: story.id,
      });
    }
  }

  return findings;
}
