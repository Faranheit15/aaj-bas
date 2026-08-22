/**
 * Cloudflare Workers AI adapter for story summarization.
 *
 * Implements REST client for Cloudflare Workers AI with timeout control,
 * exponential backoff retry on transient errors, secret redaction,
 * and automatic fallback degradation.
 */

import { type Story, storySchema } from "@aaj-bas/schemas";
import { DeterministicFallbackSummarizer } from "./fallback";
import {
  type StorySummarizer,
  type StorySummarizerInput,
  type StorySummarizerOutput,
  SUMMARIZER_DEFAULTS,
  type SummarizerOptions,
} from "./types";

interface WorkersAiResponse {
  result?: {
    response?: string;
    [key: string]: unknown;
  };
  success?: boolean;
  errors?: Array<{ message: string }>;
}

function cleanOptional(
  val: unknown,
  minLen = 20,
  maxLen = 800,
): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed.length >= minLen ? trimmed.slice(0, maxLen) : undefined;
}

export class CloudflareWorkersAiSummarizer implements StorySummarizer {
  readonly name = "cloudflare-workers-ai";
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly model: string;
  private readonly options: SummarizerOptions;
  private readonly fallbackSummarizer: StorySummarizer;

  constructor(
    accountId: string,
    apiToken: string,
    model: string = SUMMARIZER_DEFAULTS.defaultModel,
    options: SummarizerOptions = {},
    fallbackSummarizer?: StorySummarizer,
  ) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.model = model;
    this.options = options;
    this.fallbackSummarizer =
      fallbackSummarizer ?? new DeterministicFallbackSummarizer();
  }

  async summarize(input: StorySummarizerInput): Promise<StorySummarizerOutput> {
    const startTime = Date.now();
    const fetchImpl = this.options.fetch ?? globalThis.fetch;
    const sleepImpl =
      this.options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    const timeoutMs = this.options.timeoutMs ?? SUMMARIZER_DEFAULTS.timeoutMs;
    const maxRetries =
      this.options.maxRetries ?? SUMMARIZER_DEFAULTS.maxRetries;
    const retryDelayMs =
      this.options.retryDelayMs ?? SUMMARIZER_DEFAULTS.retryDelayMs;

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;

    const promptMessages = [
      {
        role: "system",
        content:
          "You are a factual, calm news summarizer for Aaj, Bas. Generate concise news summaries in valid JSON conforming to the schema with: headline (10-160 chars), deck (10-240 chars), whatChanged (1-4 paragraphs, 20-800 chars each), whyItMatters (20-800 chars), and reportingType ('reporting' | 'analysis' | 'opinion' | 'official' | 'research'). Never invent facts or unsupported context.",
      },
      {
        role: "user",
        content: JSON.stringify({
          topic: input.topic,
          clusterId: input.cluster.id,
          representativeTitle: input.cluster.representativeTitle,
          sources: input.cluster.sources,
          items: input.cluster.items.map((i) => ({
            sourceId: i.sourceId,
            title: i.title,
            description: i.description,
            publishedAt: i.publishedAt,
          })),
        }),
      },
    ];

    let lastErrorReason: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoffDelay = retryDelayMs * 2 ** (attempt - 1);
        await sleepImpl(backoffDelay);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;

      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: promptMessages }),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        lastErrorReason = isAbort ? "timeout" : "network error";
        continue;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429 || response.status >= 500) {
        lastErrorReason = `HTTP ${response.status}`;
        continue; // transient retry
      }

      if (!response.ok) {
        lastErrorReason = `HTTP ${response.status}`;
        break; // non-retryable 4xx
      }

      try {
        const data = (await response.json()) as WorkersAiResponse;
        const textContent =
          typeof data.result?.response === "string"
            ? data.result.response
            : typeof data.result === "string"
              ? data.result
              : "";

        if (!textContent) {
          lastErrorReason = "empty model response";
          continue;
        }

        const cleanedJson = textContent
          .trim()
          .replace(/^```json/i, "")
          .replace(/^```/i, "")
          .replace(/```$/i, "")
          .trim();

        const parsed = JSON.parse(cleanedJson);

        const distinctSources = Array.from(
          new Set(
            input.cluster.sources.length > 0
              ? input.cluster.sources
              : input.cluster.items.map((i) => i.sourceId),
          ),
        ).filter(Boolean);
        const sourceIds = (
          distinctSources.length > 0
            ? distinctSources
            : [input.cluster.primaryItem.sourceId]
        ).slice(0, 20);
        const sourceCount = sourceIds.length;
        const confidence =
          sourceCount > 1
            ? ("multi-source" as const)
            : ("single-source" as const);

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

        const rawStory: Story = {
          id: storyId,
          slug,
          topic: input.topic,
          reportingType: parsed.reportingType ?? "reporting",
          headline: parsed.headline,
          deck: parsed.deck,
          whatChanged: Array.isArray(parsed.whatChanged)
            ? parsed.whatChanged
            : [parsed.whatChanged],
          whyItMatters: parsed.whyItMatters,
          background: cleanOptional(parsed.background, 20, 1500),
          uncertainty: cleanOptional(parsed.uncertainty, 20, 800),
          sourceIds,
          sourceCount,
          confidence,
          firstPublishedAt,
          updatedAt,
          generatedBy: this.model,
          reviewed: false,
        };

        const validatedStory = storySchema.parse(rawStory);

        return {
          story: validatedStory,
          usedFallback: false,
          provider: this.name,
          model: this.model,
          latencyMs: Date.now() - startTime,
        };
      } catch (parseErr: unknown) {
        lastErrorReason = "invalid model response format";
        break; // do not retry deterministic payload failure
      }
    }

    // Graceful degradation: fallback on failure
    const fallbackResult = await this.fallbackSummarizer.summarize(input);
    return {
      ...fallbackResult,
      usedFallback: true,
      fallbackReason: lastErrorReason ?? "workers AI unavailable",
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - startTime,
    };
  }
}
