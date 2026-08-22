/**
 * Domain types and defaults for story summarization and AI adapters.
 *
 * Defines the provider-neutral StorySummarizer interface, options, output structures,
 * and configuration options.
 */

import type { Story, TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";

export interface StorySummarizerInput {
  readonly cluster: StoryCluster;
  readonly topic: TopicSlug;
  readonly editionDate: string;
}

export interface StorySummarizerOutput {
  readonly story: Story;
  readonly usedFallback: boolean;
  readonly fallbackReason?: string | undefined;
  readonly provider: string;
  readonly model?: string | undefined;
  readonly latencyMs?: number | undefined;
}

export interface StorySummarizer {
  readonly name: string;
  summarize(input: StorySummarizerInput): Promise<StorySummarizerOutput>;
}

export interface SummarizerOptions {
  /** Per-attempt timeout in milliseconds. Defaults to 15,000ms. */
  readonly timeoutMs?: number | undefined;
  /** Maximum retry attempts for transient errors. Defaults to 2. */
  readonly maxRetries?: number | undefined;
  /** Base retry delay in milliseconds. Defaults to 500ms. */
  readonly retryDelayMs?: number | undefined;
  /** Custom fetch implementation for hermetic unit testing. */
  readonly fetch?: typeof fetch | undefined;
  /** Custom sleep implementation for deterministic test execution. */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

export type SummarizerConfig =
  | { readonly provider: "fallback" }
  | {
      readonly provider: "cloudflare-workers-ai";
      readonly accountId: string;
      readonly apiToken: string;
      readonly model?: string | undefined;
      readonly options?: SummarizerOptions | undefined;
      readonly fallbackSummarizer?: StorySummarizer | undefined;
    }
  | {
      readonly provider: "custom";
      readonly summarizer: StorySummarizer;
    };

export const SUMMARIZER_DEFAULTS = {
  timeoutMs: 15_000,
  maxRetries: 2,
  retryDelayMs: 500,
  defaultModel: "@cf/meta/llama-3.1-8b-instruct",
} as const;
