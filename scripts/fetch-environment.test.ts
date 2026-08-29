import { describe, expect, it } from "bun:test";
import type { FeedTransportRequest } from "@aaj-bas/domain";
import {
  PRODUCTION_ENVIRONMENT,
  requestFeed,
  withTimeout,
} from "./fetch-environment";

describe("Production fetch environment & shared transport (ADR-0012)", () => {
  describe("withTimeout", () => {
    it("resolves promptly when promise finishes before timeout", async () => {
      const result = await withTimeout(Promise.resolve("success"), 500);
      expect(result).toBe("success");
    });

    it("rejects with TimeoutError when promise takes longer than timeoutMs", async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));
      await expect(withTimeout(slowPromise, 50)).rejects.toThrow(
        /operation timed out after 50ms/,
      );
    });
  });

  describe("DNS address pinning callback behavior in requestFeed", () => {
    it("fails immediately with empty address list in request", async () => {
      const request: FeedTransportRequest = {
        url: new URL("https://example.com/feed.xml"),
        addresses: [],
        headers: {},
        maxResponseBytes: 1024,
        timeoutMs: 1000,
      };

      const result = await requestFeed(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("network");
      }
    });
  });

  describe("PRODUCTION_ENVIRONMENT export", () => {
    it("provides valid resolver and transport bindings", () => {
      expect(typeof PRODUCTION_ENVIRONMENT.resolver.resolve).toBe("function");
      expect(typeof PRODUCTION_ENVIRONMENT.transport.request).toBe("function");
    });
  });
});
