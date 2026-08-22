import { describe, expect, it, vi } from "vitest";
import { storySchema } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { CloudflareWorkersAiSummarizer } from "./cloudflare-workers-ai";

describe("CloudflareWorkersAiSummarizer", () => {
  function makeMockCluster(): StoryCluster {
    return {
      id: "c-isro",
      primaryItem: {
        sourceId: "pti",
        guid: "g-1",
        title:
          "ISRO launches navigation satellite NVS-02 successfully into orbit",
        description:
          "Indian Space Research Organisation successfully launched the second-generation navigation satellite.",
        url: "https://example.com/isro",
        publishedAt: "2026-08-22T10:00:00.000Z",
        updatedAt: null,
        contentHash: "hash-isro",
      },
      items: [
        {
          sourceId: "pti",
          guid: "g-1",
          title:
            "ISRO launches navigation satellite NVS-02 successfully into orbit",
          description:
            "Indian Space Research Organisation successfully launched the second-generation navigation satellite.",
          url: "https://example.com/isro/pti",
          publishedAt: "2026-08-22T10:00:00.000Z",
          updatedAt: null,
          contentHash: "hash-isro-1",
        },
        {
          sourceId: "the-hindu",
          guid: "g-2",
          title: "ISRO places navigation satellite in orbit",
          description: "Second generation satellite launched from Sriharikota.",
          url: "https://example.com/isro/hindu",
          publishedAt: "2026-08-22T10:30:00.000Z",
          updatedAt: null,
          contentHash: "hash-isro-2",
        },
      ],
      sourceCount: 2,
      sources: ["pti", "the-hindu"],
      representativeTitle:
        "ISRO launches navigation satellite NVS-02 successfully into orbit",
      cleanedTitle:
        "ISRO launches navigation satellite NVS-02 successfully into orbit",
      confidenceScore: 1.0,
      mergeReasons: [],
      firstPublishedAt: "2026-08-22T10:00:00.000Z",
      lastPublishedAt: "2026-08-22T10:30:00.000Z",
    };
  }

  it("successfully parses valid LLM JSON response and creates Story", async () => {
    const mockResponse = {
      result: {
        response: JSON.stringify({
          headline: "ISRO launches navigation satellite NVS-02 into orbit",
          deck: "New generation satellite expands India's regional positioning system.",
          whatChanged: [
            "ISRO successfully placed the 2,232-kilogram navigation satellite into geosynchronous transfer orbit from Sriharikota.",
          ],
          whyItMatters:
            "The launch strengthens India's NavIC constellation with indigenous atomic clock technology.",
          reportingType: "reporting",
        }),
      },
      success: true,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account-id",
      "test-api-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(false);
    expect(result.story.headline).toBe(
      "ISRO launches navigation satellite NVS-02 into orbit",
    );
    expect(result.story.sourceCount).toBe(2);
    expect(result.story.confidence).toBe("multi-source");
    expect(() => storySchema.parse(result.story)).not.toThrow();

    // Verify auth header sent correctly
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("test-account-id"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-token",
        }),
      }),
    );
  });

  it("retries on transient HTTP 429 and succeeds", async () => {
    const mockResponse = {
      result: {
        response: JSON.stringify({
          headline: "ISRO launches navigation satellite NVS-02 into orbit",
          deck: "New generation satellite expands regional navigation.",
          whatChanged: ["Satellite successfully placed into transfer orbit."],
          whyItMatters: "Upgrades NavIC regional positioning network.",
          reportingType: "reporting",
        }),
      },
      success: true,
    };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account",
      "test-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("degrades gracefully to fallback when model errors or returns invalid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          response: "Not a valid JSON response from LLM",
        },
      }),
    } as Response);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account",
      "test-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBeDefined();
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("handles empty optional fields from model gracefully", async () => {
    const mockResponse = {
      result: {
        response: JSON.stringify({
          headline: "ISRO launches navigation satellite NVS-02 into orbit",
          deck: "New generation satellite expands regional navigation.",
          whatChanged: [
            "Satellite successfully placed into transfer orbit from Sriharikota.",
          ],
          whyItMatters: "Upgrades NavIC regional positioning network.",
          reportingType: "reporting",
          background: "", // empty optional string
          uncertainty: "", // empty optional string
        }),
      },
      success: true,
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account",
      "test-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(false);
    expect(result.story.background).toBeUndefined();
    expect(result.story.uncertainty).toBeUndefined();
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("does not retry on 401 unauthorized and degrades immediately", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account",
      "invalid-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("HTTP 401");
    expect(mockFetch).toHaveBeenCalledTimes(1); // non-retryable
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });

  it("handles timeout abort cleanly and falls back", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const mockFetch = vi.fn().mockRejectedValue(abortError);

    const summarizer = new CloudflareWorkersAiSummarizer(
      "test-account",
      "test-token",
      "@cf/meta/llama-3.1-8b-instruct",
      {
        fetch: mockFetch as unknown as typeof fetch,
        sleep: async () => {},
        maxRetries: 0,
      },
    );

    const result = await summarizer.summarize({
      cluster: makeMockCluster(),
      topic: "science-health-climate",
      editionDate: "2026-08-22",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("timeout");
    expect(() => storySchema.parse(result.story)).not.toThrow();
  });
});
