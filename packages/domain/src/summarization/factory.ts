/**
 * Factory and configuration resolver for story summarizers.
 *
 * Provides a single configuration entry point to instantiate the active summarizer
 * with safe defaults and transparent fallback routing.
 */

import { CloudflareWorkersAiSummarizer } from "./cloudflare-workers-ai";
import { DeterministicFallbackSummarizer } from "./fallback";
import type { StorySummarizer, SummarizerConfig } from "./types";

export function createSummarizer(config?: SummarizerConfig): StorySummarizer {
  if (!config || config.provider === "fallback") {
    return new DeterministicFallbackSummarizer();
  }

  if (config.provider === "cloudflare-workers-ai") {
    if (!config.accountId || !config.apiToken) {
      return new DeterministicFallbackSummarizer();
    }
    return new CloudflareWorkersAiSummarizer(
      config.accountId,
      config.apiToken,
      config.model,
      config.options,
      config.fallbackSummarizer,
    );
  }

  if (config.provider === "custom") {
    return config.summarizer;
  }

  return new DeterministicFallbackSummarizer();
}
