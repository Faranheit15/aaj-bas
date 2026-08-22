import { describe, expect, it } from "vitest";
import { evaluateSourceHealth } from "./evaluate";
import { formatSourceHealthJson } from "./format-json";
import { formatSourceHealthMarkdown } from "./format-markdown";
import { formatSourceHealthText } from "./format-text";
import type { SourceFetchResultInput } from "./types";

describe("source-health formatters", () => {
  const referenceNow = "2026-08-20T12:00:00.000Z";

  const fetchResults: SourceFetchResultInput[] = [
    {
      kind: "success",
      sourceId: "source-a",
      status: 200,
      finalUrl: "https://example.com/feed.xml",
      body: new Uint8Array(1024),
      contentType: "application/rss+xml",
      validators: {},
      attempts: 1,
      redirects: 0,
      durationMs: 250,
    },
    {
      kind: "failure",
      sourceId: "source-b",
      code: "network-error",
      message: "ECONNREFUSED",
      url: "https://example.com/dead.xml",
      attempts: 2,
      redirects: 0,
    },
  ];

  const report = evaluateSourceHealth(fetchResults, undefined, {
    now: referenceNow,
  });

  it("formats valid JSON", () => {
    const json = formatSourceHealthJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.reportVersion).toBe(1);
    expect(parsed.totalSources).toBe(2);
    expect(parsed.records).toHaveLength(2);
  });

  it("formats markdown with summary and requiring-review tables", () => {
    const md = formatSourceHealthMarkdown(report);
    expect(md).toContain("# Source Ingestion Health Report");
    expect(md).toContain("### Summary");
    expect(md).toContain("### ⚠️ Feeds Requiring Review");
    expect(md).toContain("`source-b`");
    expect(md).toContain("`source-a`");
  });

  it("formats CLI text with OK, WARN, FAIL and summary line", () => {
    const text = formatSourceHealthText(report);
    expect(text).toContain("source-a");
    expect(text).toContain("FAIL: source-b - network-error: ECONNREFUSED");
    expect(text).toContain(
      "Source health: 1 healthy, 0 warning(s), 1 failing of 2 sources.",
    );
  });

  it("sanitizes embedded newlines and pipes in markdown output", () => {
    const customFetch: SourceFetchResultInput[] = [
      {
        kind: "failure",
        sourceId: "source-pipe|name",
        code: "http-error",
        message: "500 Internal Error\nLine 2 with | pipe",
        url: "https://example.com/pipe",
        attempts: 1,
        redirects: 0,
      },
    ];
    const customReport = evaluateSourceHealth(customFetch, undefined, {
      now: referenceNow,
    });
    const md = formatSourceHealthMarkdown(customReport);
    expect(md).toContain("500 Internal Error Line 2 with \\| pipe");
  });

  it("formats text for empty report", () => {
    const emptyReport = evaluateSourceHealth([], undefined, {
      now: referenceNow,
    });
    expect(formatSourceHealthText(emptyReport)).toBe(
      "OK: no sources evaluated.",
    );
  });
});
