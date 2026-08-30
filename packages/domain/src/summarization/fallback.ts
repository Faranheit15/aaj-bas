/**
 * Deterministic fallback summarizer for Aaj, Bas.
 *
 * Generates a valid, reviewable draft Story directly from normalized feed items
 * without calling any external network or LLM API.
 */

import {
  type Confidence,
  type ReportingType,
  type Story,
  type TopicSlug,
  storySchema,
} from "@aaj-bas/schemas";
import { classifyStoryTopic } from "../candidate-ranking";
import {
  cleanTitle,
  hasNumericConflict,
  tokenizeTitle,
} from "../deduplication";
import type {
  StorySummarizer,
  StorySummarizerInput,
  StorySummarizerOutput,
} from "./types";
import {
  applyReviewedReportingType,
  clusterForGeneratedSummary,
  sourcePermitsUse,
} from "./source-policy";

function sanitizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureLength(
  text: string,
  min: number,
  max: number,
  fallback: string,
): string {
  const clean = sanitizeText(text);
  if (clean.length >= min && clean.length <= max) {
    return clean;
  }
  if (clean.length > max) {
    return clean.slice(0, max - 3).trimEnd() + "...";
  }
  const padded = `${clean} ${fallback}`.trim();
  if (padded.length >= min && padded.length <= max) {
    return padded;
  }
  if (padded.length > max) {
    return padded.slice(0, max - 3).trimEnd() + "...";
  }
  return fallback;
}

export class DeterministicFallbackSummarizer implements StorySummarizer {
  readonly name = "deterministic-fallback";

  async summarize(input: StorySummarizerInput): Promise<StorySummarizerOutput> {
    const startTime = Date.now();
    const permittedCluster = clusterForGeneratedSummary(
      input.cluster,
      input.sourceRegistry,
    );
    if (permittedCluster === undefined) {
      throw new Error(
        `source cluster ${input.cluster.id} has no source permitted for generated summaries`,
      );
    }

    const { topic } = input;
    const cluster = permittedCluster;

    const resolvedTopic: TopicSlug =
      topic ??
      (input.candidate?.topic as TopicSlug | undefined) ??
      classifyStoryTopic(cluster);

    const baseTitle =
      cluster.cleanedTitle ||
      cleanTitle(cluster.representativeTitle) ||
      cluster.primaryItem.title;
    const headline = ensureLength(
      baseTitle,
      10,
      160,
      "Developing news story from verified sources",
    );

    const firstDesc =
      cluster.items.find(
        (i) =>
          sourcePermitsUse(
            i.sourceId,
            "supplied-description",
            input.sourceRegistry,
          ) &&
          i.description &&
          i.description.trim().length >= 20,
      )?.description || "";
    const deck = ensureLength(
      firstDesc || baseTitle,
      10,
      240,
      `Reporting on ${headline.toLowerCase()}`,
    );

    const paragraphs: string[] = [];
    const cleanDesc = sanitizeText(firstDesc);
    if (cleanDesc.length >= 20) {
      paragraphs.push(
        ensureLength(
          cleanDesc,
          20,
          800,
          `Reporting confirms new developments regarding ${headline}.`,
        ),
      );
    } else {
      paragraphs.push(
        ensureLength(
          `The source headline reports: ${headline}.`,
          20,
          800,
          "The source provided no permitted description for this draft.",
        ),
      );
    }

    const distinctSources = Array.from(
      new Set(
        cluster.sources.length > 0
          ? cluster.sources
          : cluster.items.map((i) => i.sourceId),
      ),
    ).filter(Boolean);
    const sourceIds = (
      distinctSources.length > 0
        ? distinctSources
        : [cluster.primaryItem.sourceId]
    ).slice(0, 20);
    const sourceCount = sourceIds.length;

    const isOpinionCluster =
      cluster.items.length > 0 &&
      cluster.items.every((i) =>
        /\b(opinion|editorial|column|view|analysis|perspective)\b/i.test(
          i.title,
        ),
      );
    const reportingType: ReportingType = isOpinionCluster
      ? "opinion"
      : "reporting";

    let hasNumericConflictDetected = false;
    if (cluster.items.length >= 2) {
      for (let i = 0; i < cluster.items.length; i += 1) {
        for (let j = i + 1; j < cluster.items.length; j += 1) {
          const itemA = cluster.items[i];
          const itemB = cluster.items[j];
          if (
            itemA &&
            itemB &&
            hasNumericConflict(
              tokenizeTitle(itemA.title),
              tokenizeTitle(itemB.title),
            )
          ) {
            hasNumericConflictDetected = true;
            break;
          }
        }
        if (hasNumericConflictDetected) break;
      }
    }

    const confidence: Confidence = hasNumericConflictDetected
      ? "disputed"
      : sourceCount > 1
        ? "multi-source"
        : "single-source";

    const uncertainty = hasNumericConflictDetected
      ? "Figures and specific details differ across initial source reporting."
      : undefined;

    const nowIso = new Date().toISOString();
    const firstPublishedAt =
      cluster.firstPublishedAt || cluster.primaryItem.publishedAt || nowIso;
    const lastPublishedAt =
      cluster.lastPublishedAt ||
      cluster.primaryItem.publishedAt ||
      firstPublishedAt;

    const firstPubMs = Date.parse(firstPublishedAt);
    const lastPubMs = Date.parse(lastPublishedAt);
    const updatedAt =
      Number.isFinite(firstPubMs) &&
      Number.isFinite(lastPubMs) &&
      lastPubMs >= firstPubMs
        ? lastPublishedAt
        : firstPublishedAt;

    const sanitizedId = cluster.id
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseId = sanitizedId.startsWith("s-")
      ? sanitizedId
      : `s-${sanitizedId}`;
    const storyId = baseId.slice(0, 64).replace(/-+$/, "");
    const rawSlug = `${resolvedTopic}-${storyId}`;
    const slug = rawSlug.slice(0, 60).replace(/-+$/, "");

    const storyCandidate: Story = {
      id: storyId,
      slug,
      topic: resolvedTopic,
      reportingType,
      headline,
      deck,
      whatChanged: paragraphs,
      whyItMatters:
        "No additional context is included because the reviewed source provided no permitted description material.",
      uncertainty,
      sourceIds,
      sourceCount,
      confidence,
      firstPublishedAt,
      updatedAt,
      reviewed: false,
    };

    // Apply registry policy before validating the draft story.
    const story = storySchema.parse(
      applyReviewedReportingType(storyCandidate, input.sourceRegistry),
    );

    return {
      story,
      usedFallback: true,
      fallbackReason: "deterministic fallback generation",
      provider: this.name,
      latencyMs: Date.now() - startTime,
    };
  }
}
