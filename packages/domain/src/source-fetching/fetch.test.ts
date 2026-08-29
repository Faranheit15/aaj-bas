import { describe, expect, it } from "vitest";
import type {
  FeedFetchEnvironment,
  FeedTransportRequest,
  FeedTransportResult,
  ResolvedFeedAddress,
} from "./fetch";
import { fetchFeed, fetchFeeds } from "./fetch";
import type { FetchableSource } from "./source";
import { sourceRegistrySchema } from "../source-registry";
import { fetchableSourceOf } from "./source";

function activeEntry(
  overrides: Record<string, unknown> = {},
): FetchableSource["entry"] {
  const parsed = sourceRegistrySchema.parse({
    schemaVersion: 1,
    sources: [
      {
        id: "desk-daily",
        publisher: "Desk Daily",
        siteUrl: "https://desk-daily.co.in/",
        feedUrl: "https://desk-daily.co.in/feed.xml",
        sourceType: "publisher",
        region: "india",
        language: "en",
        active: true,
        sample: false,
        termsUrl: "https://desk-daily.co.in/terms",
        termsReviewedOn: "2026-07-21",
        termsReviewedBy: "faran",
        permittedUse:
          "Headlines and the supplied description may be reused with attribution and a link to the original article.",
        permittedUses: ["headline", "supplied-description"],
        attribution: "Desk Daily",
        ...overrides,
      },
    ],
  });
  const entry = parsed.sources[0];
  if (entry === undefined || !entry.active) {
    throw new Error("the fixture must be active");
  }
  return entry;
}

function source(overrides: Record<string, unknown> = {}): FetchableSource {
  const entry = activeEntry(overrides);
  const result = fetchableSourceOf(entry, {
    sourceId: entry.id,
    fetchable: true,
  });
  if (result === undefined) {
    throw new Error("the fixture must be fetchable");
  }
  return result;
}

function uncheckedSource(feedUrl: string): FetchableSource {
  return {
    entry: { ...activeEntry(), feedUrl } as unknown as FetchableSource["entry"],
    status: { sourceId: "desk-daily", fetchable: true },
  };
}

function successfulResponse(
  status = 200,
  headers: Record<string, string> = {},
  body = "<rss/>",
): FeedTransportResult {
  return {
    ok: true,
    response: {
      status,
      headers: {
        "content-type": "application/rss+xml",
        ...headers,
      },
      body: new TextEncoder().encode(body),
    },
  };
}

function environment(
  addresses: readonly ResolvedFeedAddress[] = [
    { address: "1.1.1.1", family: 4 },
  ],
  responses: readonly FeedTransportResult[] = [successfulResponse()],
): {
  environment: FeedFetchEnvironment;
  hosts: string[];
  requests: FeedTransportRequest[];
} {
  const hosts: string[] = [];
  const requests: FeedTransportRequest[] = [];
  let responseIndex = 0;

  return {
    hosts,
    requests,
    environment: {
      resolver: {
        resolve: async (hostname) => {
          hosts.push(hostname);
          return addresses;
        },
      },
      transport: {
        request: async (request) => {
          requests.push(request);
          const response =
            responses[Math.min(responseIndex, responses.length - 1)];
          responseIndex += 1;
          if (response === undefined) {
            throw new Error("the fixture ran out of responses");
          }
          return response;
        },
      },
    },
  };
}

const NO_WAIT = {
  retries: 0,
  sleep: async () => undefined,
};

describe("fetchFeed", () => {
  it("sends conditional validators and returns a bounded feed payload", async () => {
    const fake = environment(undefined, [
      successfulResponse(
        200,
        {
          ETag: '"v2"',
          "Last-Modified": "Wed, 19 Aug 2026 08:00:00 GMT",
        },
        "<rss><channel/></rss>",
      ),
    ]);

    const result = await fetchFeed(
      source(),
      fake.environment,
      {
        etag: '"v1"',
        lastModified: "Tue, 18 Aug 2026 08:00:00 GMT",
      },
      NO_WAIT,
    );

    expect(result).toMatchObject({
      kind: "success",
      sourceId: "desk-daily",
      status: 200,
      contentType: "application/rss+xml",
      validators: {
        etag: '"v2"',
        lastModified: "Wed, 19 Aug 2026 08:00:00 GMT",
      },
      attempts: 1,
      redirects: 0,
    });
    if (result.kind !== "success") {
      throw new Error("the fixture must succeed");
    }
    expect(new TextDecoder().decode(result.body)).toBe("<rss><channel/></rss>");
    expect(fake.requests[0]?.headers).toMatchObject({
      "if-none-match": '"v1"',
      "if-modified-since": "Tue, 18 Aug 2026 08:00:00 GMT",
      "accept-encoding": "identity",
    });
    expect(fake.requests[0]?.addresses).toEqual([
      { address: "1.1.1.1", family: 4 },
    ]);
  });

  it("returns not-modified without passing an empty body downstream", async () => {
    const fake = environment(undefined, [
      successfulResponse(
        304,
        {
          ETag: '"same"',
          "Last-Modified": "Wed, 19 Aug 2026 08:00:00 GMT",
        },
        "",
      ),
    ]);

    const result = await fetchFeed(source(), fake.environment, {}, NO_WAIT);

    expect(result).toEqual({
      kind: "not-modified",
      sourceId: "desk-daily",
      finalUrl: "https://desk-daily.co.in/feed.xml",
      validators: {
        etag: '"same"',
        lastModified: "Wed, 19 Aug 2026 08:00:00 GMT",
      },
      attempts: 1,
      redirects: 0,
    });
  });

  it("blocks private or mixed DNS answers before the transport runs", async () => {
    const fake = environment([
      { address: "1.1.1.1", family: 4 },
      { address: "192.168.1.20", family: 4 },
    ]);

    const result = await fetchFeed(source(), fake.environment, {}, NO_WAIT);

    expect(result.kind).toBe("failure");
    expect(result).toMatchObject({
      code: "unsafe-address",
      attempts: 1,
    });
    expect(fake.requests).toEqual([]);
  });

  it("blocks localhost, address literals, and file URLs before DNS", async () => {
    for (const feedUrl of [
      "https://localhost/feed.xml",
      "https://127.0.0.1/feed.xml",
      "file:///etc/passwd",
    ]) {
      const fake = environment();
      const result = await fetchFeed(
        uncheckedSource(feedUrl),
        fake.environment,
        {},
        NO_WAIT,
      );

      expect(result, feedUrl).toMatchObject({
        kind: "failure",
        code: "unsafe-url",
        attempts: 1,
      });
      expect(fake.hosts, feedUrl).toEqual([]);
      expect(fake.requests, feedUrl).toEqual([]);
    }
  });

  it("validates every redirect and stops an excessive chain", async () => {
    const redirects = [
      successfulResponse(
        302,
        { Location: "https://news.publisher.com/one" },
        "",
      ),
      successfulResponse(
        302,
        { Location: "https://news.publisher.com/two" },
        "",
      ),
      successfulResponse(
        302,
        { Location: "https://news.publisher.com/three" },
        "",
      ),
    ];
    const fake = environment(undefined, redirects);

    const result = await fetchFeed(
      source(),
      fake.environment,
      {},
      { ...NO_WAIT, maxRedirects: 1 },
    );

    expect(result).toMatchObject({
      kind: "failure",
      code: "redirect-limit",
      attempts: 2,
      redirects: 1,
    });
    expect(fake.hosts).toEqual(["desk-daily.co.in", "news.publisher.com"]);
  });

  it("rejects a redirect to a file URL before resolving it", async () => {
    const fake = environment(undefined, [
      successfulResponse(302, { Location: "file:///etc/passwd" }, ""),
    ]);

    const result = await fetchFeed(source(), fake.environment, {}, NO_WAIT);

    expect(result).toMatchObject({
      kind: "failure",
      code: "unsafe-url",
      attempts: 1,
      redirects: 0,
    });
    expect(fake.hosts).toEqual(["desk-daily.co.in"]);
  });

  it("retries transient failures but does not retry an unsafe address", async () => {
    const sleeps: number[] = [];
    const fake = environment(undefined, [
      {
        ok: false,
        error: { code: "network", message: "connection reset" },
      },
      successfulResponse(503, {}, "busy"),
      successfulResponse(200, {}, "<rss/>"),
    ]);

    const result = await fetchFeed(
      source(),
      fake.environment,
      {},
      {
        retries: 2,
        retryDelayMs: 7,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    );

    expect(result).toMatchObject({
      kind: "success",
      attempts: 3,
      redirects: 0,
    });
    expect(sleeps).toEqual([7, 7]);
    expect(fake.requests).toHaveLength(3);
  });

  it("returns a failure for an oversized or HTML response", async () => {
    const oversized = environment(undefined, [
      successfulResponse(200, { "Content-Length": "100" }, "small"),
    ]);
    const oversizedResult = await fetchFeed(
      source(),
      oversized.environment,
      {},
      { ...NO_WAIT, maxResponseBytes: 10 },
    );
    expect(oversizedResult).toMatchObject({
      kind: "failure",
      code: "response-too-large",
    });

    const html = environment(undefined, [
      successfulResponse(200, { "content-type": "text/html" }, "<html/>"),
    ]);
    const htmlResult = await fetchFeed(source(), html.environment, {}, NO_WAIT);
    expect(htmlResult).toMatchObject({
      kind: "failure",
      code: "unsupported-content-type",
    });
  });
});

describe("fetchFeeds", () => {
  it("continues after one source fails and returns each structured result", async () => {
    const first = source({
      id: "broken-source",
      siteUrl: "https://broken-source.co.in/",
      feedUrl: "https://broken-source.co.in/feed.xml",
      termsUrl: "https://broken-source.co.in/terms",
    });
    const second = source({
      id: "working-source",
      publisher: "Working Source",
      feedUrl: "https://working-source.co.in/feed.xml",
      siteUrl: "https://working-source.co.in/",
      termsUrl: "https://working-source.co.in/terms",
      attribution: "Working Source",
    });
    const fake = environment();
    fake.environment = {
      ...fake.environment,
      resolver: {
        resolve: async (hostname) => {
          fake.hosts.push(hostname);
          if (hostname === "broken-source.co.in") {
            throw new Error("temporary DNS outage");
          }
          return [{ address: "1.1.1.1", family: 4 }];
        },
      },
    };

    const results = await fetchFeeds(
      [first, second],
      fake.environment,
      new Map(),
      NO_WAIT,
    );

    expect(results[0]).toMatchObject({
      kind: "failure",
      sourceId: "broken-source",
      code: "dns-error",
    });
    expect(results[1]).toMatchObject({
      kind: "success",
      sourceId: "working-source",
    });
    expect(fake.requests).toHaveLength(1);
  });

  it("isolates network timeout and connection reset failures across diverse sources", async () => {
    const sourceTimeout = source({
      id: "source-timeout",
      publisher: "Timeout Daily",
      feedUrl: "https://timeout.publisher.co.in/feed.xml",
      siteUrl: "https://timeout.publisher.co.in",
      termsUrl: "https://timeout.publisher.co.in/terms",
      attribution: "Timeout Daily",
    });
    const sourceSuccessRss = source({
      id: "source-rss",
      publisher: "Good RSS News",
      feedUrl: "https://rss.publisher.co.in/feed.xml",
      siteUrl: "https://rss.publisher.co.in",
      termsUrl: "https://rss.publisher.co.in/terms",
      attribution: "Good RSS News",
    });
    const sourceNetworkError = source({
      id: "source-neterr",
      publisher: "Broken Socket News",
      feedUrl: "https://neterr.publisher.co.in/feed.xml",
      siteUrl: "https://neterr.publisher.co.in",
      termsUrl: "https://neterr.publisher.co.in/terms",
      attribution: "Broken Socket News",
    });

    const rssBody = `<rss version="2.0"><channel><item><title>RSS Story 1</title><link>https://rss.publisher.co.in/1</link><pubDate>2026-08-29T06:00:00Z</pubDate><description>RSS Description</description></item></channel></rss>`;

    const mockEnvironment: FeedFetchEnvironment = {
      resolver: {
        resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      },
      transport: {
        request: async (req) => {
          if (req.url.hostname === "timeout.publisher.co.in") {
            return {
              ok: false,
              error: {
                code: "timeout",
                message: "socket timeout after 10000ms",
              },
            };
          }
          if (req.url.hostname === "neterr.publisher.co.in") {
            return {
              ok: false,
              error: { code: "network", message: "ECONNRESET" },
            };
          }
          if (req.url.hostname === "rss.publisher.co.in") {
            return {
              ok: true,
              response: {
                status: 200,
                headers: { "content-type": "application/rss+xml" },
                body: new TextEncoder().encode(rssBody),
              },
            };
          }
          throw new Error("unexpected request");
        },
      },
    };

    const results = await fetchFeeds(
      [sourceTimeout, sourceSuccessRss, sourceNetworkError],
      mockEnvironment,
      new Map(),
      NO_WAIT,
    );

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      kind: "failure",
      sourceId: "source-timeout",
      code: "timeout",
    });
    expect(results[1]).toMatchObject({
      kind: "success",
      sourceId: "source-rss",
      status: 200,
    });
    expect(results[2]).toMatchObject({
      kind: "failure",
      sourceId: "source-neterr",
      code: "network-error",
    });
  });
});
