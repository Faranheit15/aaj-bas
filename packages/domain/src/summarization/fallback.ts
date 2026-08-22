/**
 * Deterministic fallback summarizer for Aaj, Bas.
 *
 * Generates a valid, reviewable draft Story directly from normalized feed items
 * without calling any external network or LLM API.
 */

import { type Story, storySchema } from "@aaj-bas/schemas";
import { cleanTitle } from "../deduplication";
import type {
  StorySummarizer,
  StorySummarizerInput,
  StorySummarizerOutput,
} from "./types";

function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ") // strip any lingering html
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
    const { cluster, topic, editionDate } = input;

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
        (i) => i.description && i.description.trim().length >= 20,
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
          `Reporting published by ${cluster.primaryItem.sourceId} details developments regarding ${headline}.`,
          20,
          800,
          "Full reporting details are being monitored from primary sources.",
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
    const confidence =
      sourceCount > 1 ? ("multi-source" as const) : ("single-source" as const);

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
    const rawSlug = `${topic}-${storyId}`;
    const slug = rawSlug.slice(0, 60).replace(/-+$/, "");

    const storyCandidate: Story = {
      id: storyId,
      slug,
      topic,
      reportingType: "reporting",
      headline,
      deck,
      whatChanged: paragraphs,
      whyItMatters:
        "Context and implications are being monitored as reporting develops.",
      sourceIds,
      sourceCount,
      confidence,
      firstPublishedAt,
      updatedAt,
      reviewed: false,
    };

    // Validate draft story with shared Zod schema
    const story = storySchema.parse(storyCandidate);

    return {
      story,
      usedFallback: true,
      fallbackReason: "deterministic fallback generation",
      provider: this.name,
      latencyMs: Date.now() - startTime,
    };
  }
}
