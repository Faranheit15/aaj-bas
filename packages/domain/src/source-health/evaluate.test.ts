import { describe, expect, it } from "vitest";
import type { NormalizedFeedItem } from "../feed-normalization";
import { evaluateSourceHealth } from "./evaluate";
import type { SourceFetchResultInput } from "./types";

describe("evaluateSourceHealth", () => {
  const referenceNow = "2026-08-20T12:00:00.000Z";

  it("evaluates a completely healthy source", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "the-hindu",
        status: 200,
        finalUrl: "https://www.thehindu.com/news/national/feeder/default.rss",
        body: new Uint8Array(1024),
        contentType: "application/rss+xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 450,
      },
    ];

    const items: NormalizedFeedItem[] = [
      {
        sourceId: "the-hindu",
        guid: "guid-1",
        title: "National Update",
        description: "Important changes",
        url: "https://www.thehindu.com/news/national/article1.ece",
        publishedAt: "2026-08-20T10:00:00.000Z",
        updatedAt: null,
        contentHash: "hash-1",
      },
    ];

    const itemsMap = new Map([["the-hindu", items]]);
    const report = evaluateSourceHealth(fetchResults, itemsMap, {
      now: referenceNow,
    });

    expect(report.totalSources).toBe(1);
    expect(report.healthyCount).toBe(1);
    expect(report.warningCount).toBe(0);
    expect(report.failingCount).toBe(0);

    const record = report.records[0];
    expect(record).toBeDefined();
    expect(record?.status).toBe("healthy");
    expect(record?.warnings).toHaveLength(0);
    expect(record?.itemCount).toBe(1);
    expect(record?.lastPublishedAt).toBe("2026-08-20T10:00:00.000Z");
    expect(record?.durationMs).toBe(450);
  });

  it("evaluates a failing source", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "failure",
        sourceId: "broken-news",
        code: "timeout",
        message: "Request timed out after 10000ms",
        url: "https://example.com/rss",
        attempts: 3,
        redirects: 0,
      },
    ];

    const report = evaluateSourceHealth(fetchResults, undefined, {
      now: referenceNow,
    });

    expect(report.totalSources).toBe(1);
    expect(report.healthyCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.failingCount).toBe(1);

    const record = report.records[0];
    expect(record?.status).toBe("failing");
    expect(record?.warnings).toEqual([
      {
        ruleId: "fetch/failed",
        message: "Request timed out after 10000ms",
      },
    ]);
    expect(record?.errorMessage).toBe(
      "timeout: Request timed out after 10000ms",
    );
  });

  it("flags latency/high when response duration exceeds threshold", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "slow-source",
        status: 200,
        finalUrl: "https://example.com/slow.xml",
        body: new Uint8Array(500),
        contentType: "application/xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 6500,
      },
    ];

    const items: NormalizedFeedItem[] = [
      {
        sourceId: "slow-source",
        guid: "guid-slow",
        title: "Slow Story",
        description: "Text",
        url: "https://example.com/story",
        publishedAt: "2026-08-20T11:00:00.000Z",
        updatedAt: null,
        contentHash: "hash-slow",
      },
    ];

    const report = evaluateSourceHealth(
      fetchResults,
      { "slow-source": items },
      { now: referenceNow },
    );

    expect(report.warningCount).toBe(1);
    const record = report.records[0];
    expect(record?.status).toBe("warning");
    expect(record?.warnings.some((w) => w.ruleId === "latency/high")).toBe(
      true,
    );
  });

  it("flags items/empty when successful fetch returns zero items", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "empty-source",
        status: 200,
        finalUrl: "https://example.com/empty.xml",
        body: new Uint8Array(100),
        contentType: "application/xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 300,
      },
    ];

    const report = evaluateSourceHealth(
      fetchResults,
      new Map([["empty-source", []]]),
      { now: referenceNow },
    );

    expect(report.warningCount).toBe(1);
    const record = report.records[0];
    expect(record?.status).toBe("warning");
    expect(record?.warnings.some((w) => w.ruleId === "items/empty")).toBe(true);
  });

  it("flags staleness/old when latest publication date exceeds staleness threshold", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "stale-source",
        status: 200,
        finalUrl: "https://example.com/stale.xml",
        body: new Uint8Array(200),
        contentType: "application/xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 300,
      },
    ];

    const items: NormalizedFeedItem[] = [
      {
        sourceId: "stale-source",
        guid: "guid-old",
        title: "Old Story",
        description: "Text",
        url: "https://example.com/old",
        publishedAt: "2026-08-10T12:00:00.000Z", // 10 days old relative to 2026-08-20
        updatedAt: null,
        contentHash: "hash-old",
      },
    ];

    const report = evaluateSourceHealth(
      fetchResults,
      new Map([["stale-source", items]]),
      { now: referenceNow },
    );

    expect(report.warningCount).toBe(1);
    const record = report.records[0];
    expect(record?.status).toBe("warning");
    expect(record?.warnings.some((w) => w.ruleId === "staleness/old")).toBe(
      true,
    );
  });

  it("handles not-modified fetch result", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "not-modified",
        sourceId: "cached-source",
        finalUrl: "https://example.com/feed.xml",
        validators: { etag: '"etag-123"' },
        attempts: 1,
        redirects: 0,
        durationMs: 150,
      },
    ];

    const report = evaluateSourceHealth(fetchResults, undefined, {
      now: referenceNow,
    });

    expect(report.healthyCount).toBe(1);
    const record = report.records[0];
    expect(record?.fetchKind).toBe("not-modified");
    expect(record?.httpStatus).toBe(304);
    expect(record?.status).toBe("healthy");
  });

  it("evaluates custom threshold overrides", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "custom-thresh",
        status: 200,
        finalUrl: "https://example.com/feed.xml",
        body: new Uint8Array(500),
        contentType: "application/xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 1200,
      },
    ];

    const items: NormalizedFeedItem[] = [
      {
        sourceId: "custom-thresh",
        guid: "g1",
        title: "Title",
        description: "Desc",
        url: null,
        publishedAt: "2026-08-19T12:00:00.000Z", // 24 hours old
        updatedAt: null,
        contentHash: "h1",
      },
    ];

    // With 1000ms maxLatency and 12h maxStaleness, both should trigger
    const report = evaluateSourceHealth(
      fetchResults,
      new Map([["custom-thresh", items]]),
      {
        now: referenceNow,
        thresholds: {
          maxLatencyMs: 1000,
          maxStalenessHours: 12,
        },
      },
    );

    const record = report.records[0];
    expect(record?.warnings).toHaveLength(2);
    expect(record?.warnings.map((w) => w.ruleId)).toContain("latency/high");
    expect(record?.warnings.map((w) => w.ruleId)).toContain("staleness/old");
  });

  it("does not flag items/empty when itemsBySourceId is omitted", () => {
    const fetchResults: SourceFetchResultInput[] = [
      {
        kind: "success",
        sourceId: "no-items-passed",
        status: 200,
        finalUrl: "https://example.com/feed.xml",
        body: new Uint8Array(500),
        contentType: "application/xml",
        validators: {},
        attempts: 1,
        redirects: 0,
        durationMs: 200,
      },
    ];

    const report = evaluateSourceHealth(fetchResults, undefined, {
      now: referenceNow,
    });

    expect(report.healthyCount).toBe(1);
    expect(report.warningCount).toBe(0);
    const record = report.records[0];
    expect(record?.status).toBe("healthy");
    expect(record?.warnings).toHaveLength(0);
  });
});
