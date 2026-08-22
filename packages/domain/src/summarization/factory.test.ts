import { describe, expect, it } from "vitest";
import { CloudflareWorkersAiSummarizer } from "./cloudflare-workers-ai";
import { createSummarizer } from "./factory";
import { DeterministicFallbackSummarizer } from "./fallback";

describe("createSummarizer factory", () => {
  it("creates fallback summarizer by default or when config is empty", () => {
    const s1 = createSummarizer();
    expect(s1).toBeInstanceOf(DeterministicFallbackSummarizer);

    const s2 = createSummarizer({ provider: "fallback" });
    expect(s2).toBeInstanceOf(DeterministicFallbackSummarizer);
  });

  it("creates Cloudflare adapter when valid account and token provided", () => {
    const s = createSummarizer({
      provider: "cloudflare-workers-ai",
      accountId: "acc-123",
      apiToken: "token-456",
    });
    expect(s).toBeInstanceOf(CloudflareWorkersAiSummarizer);
  });

  it("safely falls back if Cloudflare credentials are missing", () => {
    const s = createSummarizer({
      provider: "cloudflare-workers-ai",
      accountId: "",
      apiToken: "",
    });
    expect(s).toBeInstanceOf(DeterministicFallbackSummarizer);
  });

  it("supports custom summarizer injection", () => {
    const custom = new DeterministicFallbackSummarizer();
    const s = createSummarizer({
      provider: "custom",
      summarizer: custom,
    });
    expect(s).toBe(custom);
  });
});
