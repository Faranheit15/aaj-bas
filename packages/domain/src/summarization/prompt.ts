/**
 * Versioned prompt compilation, JSON output schema, and sentence-to-source
 * attribution validation for story summarization.
 */

import {
  type ReportingType,
  type Story,
  reportingTypeSchema,
  storySchema,
} from "@aaj-bas/schemas";
import { z } from "zod";
import type { StorySummarizerInput } from "./types";

export const SUMMARIZE_PROMPT_VERSION = "summarize-v1" as const;

export interface SentenceWithSources {
  readonly sentence: string;
  readonly sourceIds: readonly string[];
}

export interface PromptExtractedFacts {
  readonly namedEntities: readonly string[];
  readonly dates: readonly string[];
  readonly numbers: readonly string[];
}

export interface PromptSummaryResult {
  readonly headline: string;
  readonly deck: string;
  readonly whatChanged: readonly SentenceWithSources[];
  readonly whyItMatters: string;
  readonly background?: string | undefined;
  readonly uncertainty?: string | undefined;
  readonly reportingType: ReportingType;
  readonly extractedFacts: PromptExtractedFacts;
}

const sentenceWithSourcesSchema = z.object({
  sentence: z.string().min(10).max(600),
  sourceIds: z.array(z.string().min(1)).min(1),
});

const extractedFactsSchema = z.object({
  namedEntities: z.array(z.string()).default([]),
  dates: z.array(z.string()).default([]),
  numbers: z.array(z.string()).default([]),
});

export const promptSummaryResultSchema = z.object({
  headline: z.string().min(10).max(160),
  deck: z.string().min(10).max(240),
  whatChanged: z.array(sentenceWithSourcesSchema).min(1).max(8),
  whyItMatters: z.string().min(20).max(800),
  background: z
    .string()
    .nullable()
    .optional()
    .transform((val) =>
      val && val.trim().length >= 20 ? val.trim().slice(0, 1500) : undefined,
    ),
  uncertainty: z
    .string()
    .nullable()
    .optional()
    .transform((val) =>
      val && val.trim().length >= 20 ? val.trim().slice(0, 800) : undefined,
    ),
  reportingType: reportingTypeSchema.default("reporting"),
  extractedFacts: extractedFactsSchema.default({
    namedEntities: [],
    dates: [],
    numbers: [],
  }),
});

export function compileSummarizePrompt(input: StorySummarizerInput): {
  system: string;
  user: string;
} {
  const allowedSources = Array.from(
    new Set(
      input.cluster.sources.length > 0
        ? input.cluster.sources
        : input.cluster.items.map((i) => i.sourceId),
    ),
  ).filter(Boolean);

  const system = [
    "You are a factual, calm, and neutral news summarizer for Aaj, Bas., a finite daily news product.",
    "Your task is to transform multi-source clustered feed items into a structured, concise news story.",
    "",
    "CRITICAL CONSTRAINTS & INSTRUCTIONS:",
    "1. NEVER invent, extrapolate, or hallucinate facts, numbers, dates, or named entities not explicitly in the source items.",
    "2. NEVER pad sentences or invent background context merely to fill space or satisfy a layout.",
    "3. NEVER present opinion, commentary, or official statements as independently verified facts.",
    "4. When sources disagree, preserve uncertainty rather than choosing one side. State disagreements in 'uncertainty'.",
    "5. Every sentence in 'whatChanged' MUST cite at least one source ID from the provided list of valid source IDs.",
    "6. Extract named entities, numbers, and dates mentioned in the summary.",
    "7. Return ONLY valid JSON matching the specified output schema. No markdown formatting, code fences, or preamble.",
    "",
    "JSON OUTPUT SCHEMA:",
    "{",
    '  "headline": string (10 to 160 characters),',
    '  "deck": string (10 to 240 characters),',
    '  "whatChanged": Array<{ "sentence": string (20 to 400 chars), "sourceIds": string[] (at least one valid source ID) }>,',
    '  "whyItMatters": string (20 to 800 characters),',
    '  "background": string | null (optional, 20 to 1500 characters),',
    '  "uncertainty": string | null (optional, 20 to 800 characters),',
    '  "reportingType": "reporting" | "analysis" | "opinion" | "official" | "research",',
    '  "extractedFacts": {',
    '    "namedEntities": string[],',
    '    "dates": string[],',
    '    "numbers": string[]',
    "  }",
    "}",
  ].join("\n");

  const itemsFormatted = input.cluster.items
    .map((item, idx) => {
      const parts = [
        `[SOURCE: ${item.sourceId} | ITEM: ${idx + 1}]`,
        `Title: ${item.title}`,
        item.publishedAt ? `Published: ${item.publishedAt}` : null,
        item.description ? `Description: ${item.description}` : null,
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n\n");

  const user = [
    `TOPIC: ${input.topic}`,
    `CLUSTER_ID: ${input.cluster.id}`,
    `REPRESENTATIVE_TITLE: ${input.cluster.representativeTitle}`,
    `VALID_SOURCE_IDS: [${allowedSources.join(", ")}]`,
    "",
    "SOURCE FEED ITEMS:",
    itemsFormatted,
    "",
    `Generate the strict source-mapped JSON summary conforming to promptVersion "${SUMMARIZE_PROMPT_VERSION}".`,
  ].join("\n");

  return { system, user };
}

export function parsePromptSummaryResult(
  rawJson: string,
  allowedSourceIds: readonly string[],
): { ok: true; result: PromptSummaryResult } | { ok: false; error: string } {
  try {
    const cleaned = rawJson
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsedJson: unknown = JSON.parse(cleaned);
    const parsed = promptSummaryResultSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return {
        ok: false,
        error: `Schema validation error: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      };
    }

    const allowedSet = new Set(allowedSourceIds);

    // Validate that all cited source IDs belong to the cluster's allowed sources
    for (const item of parsed.data.whatChanged) {
      if (item.sourceIds.length === 0) {
        return {
          ok: false,
          error: "Sentence missing source citations",
        };
      }
      for (const srcId of item.sourceIds) {
        if (!allowedSet.has(srcId)) {
          return {
            ok: false,
            error: `Unknown source ID cited: '${srcId}' (allowed: ${allowedSourceIds.join(", ")})`,
          };
        }
      }
    }

    return {
      ok: true,
      result: parsed.data as PromptSummaryResult,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "JSON parse error",
    };
  }
}

export function convertPromptResultToStory(
  result: PromptSummaryResult,
  input: StorySummarizerInput,
  modelId: string,
): Story {
  // Collect all unique cited sources across sentences
  const citedSources = new Set<string>();
  for (const item of result.whatChanged) {
    for (const src of item.sourceIds) {
      citedSources.add(src);
    }
  }

  // If no sources cited in sentences, fallback to cluster sources
  if (citedSources.size === 0) {
    for (const src of input.cluster.sources) {
      citedSources.add(src);
    }
  }

  const sourceIds = Array.from(citedSources).slice(0, 20);
  const sourceCount = sourceIds.length;
  const confidence =
    sourceCount > 1 ? ("multi-source" as const) : ("single-source" as const);

  // Group sentences into 1-4 whatChanged paragraphs (bounding each to 20-800 chars)
  const paragraphs: string[] = [];
  let currentPara = "";

  for (const s of result.whatChanged) {
    const text = s.sentence.trim();
    if (!text) continue;
    if (!currentPara) {
      currentPara = text;
    } else if (`${currentPara} ${text}`.length <= 750) {
      currentPara = `${currentPara} ${text}`;
    } else {
      paragraphs.push(currentPara);
      currentPara = text;
    }
  }
  if (currentPara) {
    paragraphs.push(currentPara);
  }

  const boundedParagraphs = (
    paragraphs.length > 0 ? paragraphs : [result.deck]
  ).slice(0, 4);

  const nowIso = new Date().toISOString();
  const firstPublishedAt =
    input.cluster.firstPublishedAt ||
    input.cluster.primaryItem.publishedAt ||
    nowIso;
  const lastPublishedAt =
    input.cluster.lastPublishedAt ||
    input.cluster.primaryItem.publishedAt ||
    firstPublishedAt;

  const firstPubMs = Date.parse(firstPublishedAt);
  const lastPubMs = Date.parse(lastPublishedAt);
  const updatedAt =
    Number.isFinite(firstPubMs) &&
    Number.isFinite(lastPubMs) &&
    lastPubMs >= firstPubMs
      ? lastPublishedAt
      : firstPublishedAt;

  const sanitizedId = input.cluster.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const baseId = sanitizedId.startsWith("s-")
    ? sanitizedId
    : `s-${sanitizedId}`;
  const storyId = baseId.slice(0, 64).replace(/-+$/, "");
  const rawSlug = `${input.topic}-${storyId}`;
  const slug = rawSlug.slice(0, 60).replace(/-+$/, "");

  const storyCandidate: Story = {
    id: storyId,
    slug,
    topic: input.topic,
    reportingType: result.reportingType,
    headline: result.headline,
    deck: result.deck,
    whatChanged: boundedParagraphs,
    whyItMatters: result.whyItMatters,
    background: result.background,
    uncertainty: result.uncertainty,
    sourceIds,
    sourceCount,
    confidence,
    firstPublishedAt,
    updatedAt,
    generatedBy: modelId,
    promptVersion: SUMMARIZE_PROMPT_VERSION,
    reviewed: false,
  };

  return storySchema.parse(storyCandidate);
}
