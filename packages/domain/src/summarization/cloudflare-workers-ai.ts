/**
 * Cloudflare Workers AI adapter for story summarization.
 *
 * Implements REST client for Cloudflare Workers AI with timeout control,
 * exponential backoff retry on transient errors, secret redaction,
 * and automatic fallback degradation.
 */

import { DeterministicFallbackSummarizer } from "./fallback";
import {
  compileSummarizePrompt,
  convertPromptResultToStory,
  parsePromptSummaryResult,
} from "./prompt";
import {
  type StorySummarizer,
  type StorySummarizerInput,
  type StorySummarizerOutput,
  SUMMARIZER_DEFAULTS,
  type SummarizerOptions,
} from "./types";
import { sourceIdsPermittingUse } from "./source-policy";

interface WorkersAiResponse {
  result?: {
    response?: string;
    [key: string]: unknown;
  };
  success?: boolean;
  errors?: Array<{ message: string }>;
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

    const compiledPrompt = compileSummarizePrompt(input);
    const promptMessages = [
      {
        role: "system",
        content: compiledPrompt.system,
      },
      {
        role: "user",
        content: compiledPrompt.user,
      },
    ];

    const allowedSources = sourceIdsPermittingUse(
      input.cluster.sources.length > 0
        ? input.cluster.sources
        : input.cluster.items.map((i) => i.sourceId),
      "generated-summary",
      input.sourceRegistry,
    );

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

        const parseRes = parsePromptSummaryResult(textContent, allowedSources);
        if (!parseRes.ok) {
          lastErrorReason = parseRes.error;
          break; // do not retry deterministic payload error
        }

        const validatedStory = convertPromptResultToStory(
          parseRes.result,
          input,
          this.model,
        );

        return {
          story: validatedStory,
          usedFallback: false,
          provider: this.name,
          model: this.model,
          latencyMs: Date.now() - startTime,
        };
      } catch (_parseErr: unknown) {
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
