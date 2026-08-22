/**
 * Safe feed fetching as a policy engine.
 *
 * This module owns request policy but performs no I/O. The runtime adapter
 * supplies DNS resolution and an HTTPS request that connects through the
 * addresses this module checked. That boundary makes redirects, retries,
 * validators, byte limits, and failure isolation testable without a live
 * network.
 *
 * The returned payload is for the source-processing pipeline, not the reader.
 * It is intentionally not imported by either application; AB-403 owns turning
 * untrusted feed bytes into normalized text before any product surface can see
 * them.
 */
import {
  classifyHostname,
  isPubliclyRoutable,
  parseIpAddress,
} from "../public-address";
import type { FetchableSource } from "./source";

export interface ResolvedFeedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface FeedResolver {
  /** Resolve both address families, or reject when resolution fails. */
  resolve(
    hostname: string,
    timeoutMs: number,
  ): Promise<readonly ResolvedFeedAddress[]>;
}

export interface FeedTransportRequest {
  readonly url: URL;
  /** Every address has already passed the public-address check. */
  readonly addresses: readonly ResolvedFeedAddress[];
  readonly headers: Readonly<Record<string, string>>;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

export interface FeedTransportResponse {
  readonly status: number;
  /** Header names are normally lowercase, but consumers must be case-insensitive. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export type FeedTransportFailureCode =
  | "timeout"
  | "network"
  | "response-too-large";

export interface FeedTransportFailure {
  readonly code: FeedTransportFailureCode;
  readonly message: string;
}

export type FeedTransportResult =
  | { readonly ok: true; readonly response: FeedTransportResponse }
  | { readonly ok: false; readonly error: FeedTransportFailure };

export interface FeedTransport {
  /** Connect to one of the already-checked addresses; never resolve again. */
  request(request: FeedTransportRequest): Promise<FeedTransportResult>;
}

export interface FeedFetchEnvironment {
  readonly resolver: FeedResolver;
  readonly transport: FeedTransport;
}

export interface FeedCacheValidators {
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface FeedFetchOptions {
  readonly maxRedirects?: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly retryDelayMs?: number;
  /** Injectable for deterministic tests; production uses the platform timer. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export const FEED_FETCH_DEFAULTS = {
  maxRedirects: 3,
  maxResponseBytes: 1_048_576,
  timeoutMs: 10_000,
  retries: 2,
  retryDelayMs: 250,
} as const;

export type FeedFetchFailureCode =
  | "invalid-url"
  | "unsafe-url"
  | "dns-error"
  | "no-addresses"
  | "unsafe-address"
  | "network-error"
  | "timeout"
  | "response-too-large"
  | "missing-location"
  | "invalid-redirect"
  | "redirect-limit"
  | "http-error"
  | "invalid-response"
  | "missing-content-type"
  | "unsupported-content-type";

export interface FeedFetchFailure {
  readonly kind: "failure";
  readonly sourceId: string;
  readonly code: FeedFetchFailureCode;
  readonly message: string;
  /** The URL being attempted when the failure became final. */
  readonly url: string;
  readonly attempts: number;
  readonly redirects: number;
}

export interface FeedFetchSuccess {
  readonly kind: "success";
  readonly sourceId: string;
  readonly status: number;
  readonly finalUrl: string;
  /** Untrusted bytes for the source-processing pipeline; never UI input. */
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly validators: FeedCacheValidators;
  readonly attempts: number;
  readonly redirects: number;
}

export interface FeedFetchNotModified {
  readonly kind: "not-modified";
  readonly sourceId: string;
  readonly finalUrl: string;
  readonly validators: FeedCacheValidators;
  readonly attempts: number;
  readonly redirects: number;
}

export type FeedFetchResult =
  | FeedFetchFailure
  | FeedFetchSuccess
  | FeedFetchNotModified;

const ACCEPT_HEADER = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "application/rdf+xml",
  "application/feed+json",
  "application/json",
].join(", ");

const ACCEPTED_CONTENT_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "application/rdf+xml",
  "application/feed+json",
  "application/json",
]);

type Settings = {
  readonly maxRedirects: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

type UrlCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "invalid-url" | "unsafe-url";
      readonly message: string;
    };

type AttemptOutcome =
  | {
      readonly kind: "redirect";
      readonly url: URL;
    }
  | {
      readonly kind: "failure";
      readonly code: FeedFetchFailureCode;
      readonly message: string;
      readonly retryable: boolean;
    }
  | {
      readonly kind: "success";
      readonly status: number;
      readonly body: Uint8Array;
      readonly contentType: string;
      readonly validators: FeedCacheValidators;
    }
  | {
      readonly kind: "not-modified";
      readonly validators: FeedCacheValidators;
    };

export async function fetchFeed(
  source: FetchableSource,
  environment: FeedFetchEnvironment,
  cache: FeedCacheValidators = {},
  options: FeedFetchOptions = {},
): Promise<FeedFetchResult> {
  const settings = resolveSettings(options);
  const sourceId = source.entry.id;
  let url: URL;

  try {
    url = new URL(source.entry.feedUrl);
  } catch {
    return failure(
      sourceId,
      "invalid-url",
      "the feed URL cannot be parsed",
      source.entry.feedUrl,
      0,
      0,
    );
  }

  let redirects = 0;
  let attempts = 0;

  while (true) {
    let retries = 0;

    while (true) {
      attempts += 1;
      const outcome = await performAttempt(url, environment, cache, settings);

      if (outcome.kind === "redirect") {
        if (redirects >= settings.maxRedirects) {
          return failure(
            sourceId,
            "redirect-limit",
            "the feed exceeded the " +
              settings.maxRedirects +
              "-redirect limit",
            url.href,
            attempts,
            redirects,
          );
        }
        redirects += 1;
        url = outcome.url;
        break;
      }

      if (outcome.kind === "failure") {
        if (outcome.retryable && retries < settings.retries) {
          retries += 1;
          await settings.sleep(settings.retryDelayMs);
          continue;
        }
        return failure(
          sourceId,
          outcome.code,
          outcome.message,
          url.href,
          attempts,
          redirects,
        );
      }

      if (outcome.kind === "not-modified") {
        return {
          kind: "not-modified",
          sourceId,
          finalUrl: url.href,
          validators: outcome.validators,
          attempts,
          redirects,
        };
      }

      return {
        kind: "success",
        sourceId,
        status: outcome.status,
        finalUrl: url.href,
        body: outcome.body,
        contentType: outcome.contentType,
        validators: outcome.validators,
        attempts,
        redirects,
      };
    }
  }
}

/** Fetch all approved sources, preserving order and isolating each failure. */
export async function fetchFeeds(
  sources: readonly FetchableSource[],
  environment: FeedFetchEnvironment,
  cache: ReadonlyMap<string, FeedCacheValidators> = new Map(),
  options: FeedFetchOptions = {},
): Promise<readonly FeedFetchResult[]> {
  const results: FeedFetchResult[] = [];

  for (const source of sources) {
    try {
      results.push(
        await fetchFeed(
          source,
          environment,
          cache.get(source.entry.id),
          options,
        ),
      );
    } catch (error) {
      // A broken adapter or an unexpected runtime error belongs to this source.
      // The next source still gets its own request, and the structured failure
      // keeps the exception from becoming an empty success state.
      results.push(
        failure(
          source.entry.id,
          "network-error",
          "unexpected fetch failure: " + describe(error),
          source.entry.feedUrl,
          0,
          0,
        ),
      );
    }
  }

  return results;
}

async function performAttempt(
  url: URL,
  environment: FeedFetchEnvironment,
  cache: FeedCacheValidators,
  settings: Settings,
): Promise<AttemptOutcome> {
  const urlCheck = checkUrl(url);
  if (!urlCheck.ok) {
    return {
      kind: "failure",
      code: urlCheck.code,
      message: urlCheck.message,
      retryable: false,
    };
  }

  let addresses: readonly ResolvedFeedAddress[];
  try {
    addresses = await environment.resolver.resolve(
      url.hostname,
      settings.timeoutMs,
    );
  } catch (error) {
    return {
      kind: "failure",
      code: isTimeoutError(error) ? "timeout" : "dns-error",
      message:
        "DNS resolution failed for " + url.hostname + ": " + describe(error),
      retryable: true,
    };
  }

  if (addresses.length === 0) {
    return {
      kind: "failure",
      code: "no-addresses",
      message: "DNS resolution returned no addresses for " + url.hostname,
      retryable: true,
    };
  }

  for (const address of addresses) {
    const parsed = parseIpAddress(address.address);
    if (parsed === null || !isPubliclyRoutable(parsed)) {
      return {
        kind: "failure",
        code: "unsafe-address",
        message:
          "DNS resolution for " +
          url.hostname +
          " returned a non-public address " +
          address.address,
        retryable: false,
      };
    }
  }

  let result: FeedTransportResult;
  try {
    result = await environment.transport.request({
      url,
      addresses,
      headers: requestHeaders(cache),
      maxResponseBytes: settings.maxResponseBytes,
      timeoutMs: settings.timeoutMs,
    });
  } catch (error) {
    return {
      kind: "failure",
      code: "network-error",
      message: "the HTTPS request failed: " + describe(error),
      retryable: true,
    };
  }

  if (!result.ok) {
    return {
      kind: "failure",
      code:
        result.error.code === "timeout"
          ? "timeout"
          : result.error.code === "response-too-large"
            ? "response-too-large"
            : "network-error",
      message: result.error.message,
      retryable: result.error.code !== "response-too-large",
    };
  }

  const response = result.response;
  const contentLength = headerValue(response.headers, "content-length");
  if (contentLength !== undefined) {
    if (!/^[0-9]+$/.test(contentLength)) {
      return {
        kind: "failure",
        code: "invalid-response",
        message:
          "the response has an invalid content-length header: " + contentLength,
        retryable: false,
      };
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) {
      return {
        kind: "failure",
        code: "invalid-response",
        message:
          "the response content-length is outside the safe integer range",
        retryable: false,
      };
    }
    if (declaredBytes > settings.maxResponseBytes) {
      return {
        kind: "failure",
        code: "response-too-large",
        message:
          "the response declares " +
          declaredBytes +
          " bytes, above the " +
          settings.maxResponseBytes +
          "-byte limit",
        retryable: false,
      };
    }
  }

  if (response.body.byteLength > settings.maxResponseBytes) {
    return {
      kind: "failure",
      code: "response-too-large",
      message:
        "the response is " +
        response.body.byteLength +
        " bytes, above the " +
        settings.maxResponseBytes +
        "-byte limit",
      retryable: false,
    };
  }

  const validators = extractValidators(response.headers);
  if (response.status === 304) {
    return { kind: "not-modified", validators };
  }

  if (response.status >= 300 && response.status < 400) {
    const location = headerValue(response.headers, "location");
    if (location === undefined) {
      return {
        kind: "failure",
        code: "missing-location",
        message:
          "HTTP " + response.status + " did not provide a Location header",
        retryable: false,
      };
    }

    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return {
        kind: "failure",
        code: "invalid-redirect",
        message: "the redirect location cannot be parsed: " + location,
        retryable: false,
      };
    }

    const nextCheck = checkUrl(next);
    if (!nextCheck.ok) {
      return {
        kind: "failure",
        code:
          nextCheck.code === "invalid-url" ? "invalid-redirect" : "unsafe-url",
        message: "the redirect target is not fetchable: " + nextCheck.message,
        retryable: false,
      };
    }

    return { kind: "redirect", url: next };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      kind: "failure",
      code: "http-error",
      message: "the feed returned HTTP " + response.status,
      retryable: isRetryableStatus(response.status),
    };
  }

  const contentType = mediaTypeOf(response.headers);
  if (contentType === undefined) {
    return {
      kind: "failure",
      code: "missing-content-type",
      message: "the feed response did not declare a content type",
      retryable: false,
    };
  }
  if (!ACCEPTED_CONTENT_TYPES.has(contentType)) {
    return {
      kind: "failure",
      code: "unsupported-content-type",
      message: "the feed response has unsupported content type " + contentType,
      retryable: false,
    };
  }

  return {
    kind: "success",
    status: response.status,
    body: response.body,
    contentType,
    validators,
  };
}

function checkUrl(url: URL): UrlCheck {
  if (url.protocol !== "https:") {
    return {
      ok: false,
      code: "unsafe-url",
      message:
        "only https feed URLs are allowed, received " +
        (url.protocol || "no scheme"),
    };
  }
  if (url.hostname === "" || url.hostname.length > 253) {
    return {
      ok: false,
      code: "invalid-url",
      message: "the feed URL has no valid hostname",
    };
  }
  if (url.href.length > 2048) {
    return {
      ok: false,
      code: "invalid-url",
      message: "the feed URL exceeds the 2048-character limit",
    };
  }
  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      code: "unsafe-url",
      message: "feed URLs must not carry credentials",
    };
  }
  if (url.port !== "") {
    return {
      ok: false,
      code: "unsafe-url",
      message: "feed URLs must not name a non-default port",
    };
  }
  if (url.hash !== "") {
    return {
      ok: false,
      code: "unsafe-url",
      message: "feed URLs must not carry a fragment",
    };
  }

  const reach = classifyHostname(url.hostname);
  if (reach.kind === "address") {
    return {
      ok: false,
      code: "unsafe-url",
      message:
        "the URL names the " +
        reach.reach +
        " address " +
        url.hostname +
        ", not a publisher hostname",
    };
  }
  if (reach.kind === "private-name") {
    return {
      ok: false,
      code: "unsafe-url",
      message: "the URL names the private hostname " + url.hostname,
    };
  }
  if (reach.kind === "reserved-name") {
    return {
      ok: false,
      code: "unsafe-url",
      message: "the URL names the reserved hostname " + url.hostname,
    };
  }

  return { ok: true };
}

function requestHeaders(
  cache: FeedCacheValidators,
): Readonly<Record<string, string>> {
  return {
    accept: ACCEPT_HEADER,
    "accept-encoding": "identity",
    ...(cache.etag === undefined ? {} : { "if-none-match": cache.etag }),
    ...(cache.lastModified === undefined
      ? {}
      : { "if-modified-since": cache.lastModified }),
  };
}

function extractValidators(
  headers: Readonly<Record<string, string>>,
): FeedCacheValidators {
  const etag = headerValue(headers, "etag");
  const lastModified = headerValue(headers, "last-modified");

  return {
    ...(etag === undefined || etag === "" ? {} : { etag }),
    ...(lastModified === undefined || lastModified === ""
      ? {}
      : { lastModified }),
  };
}

function mediaTypeOf(
  headers: Readonly<Record<string, string>>,
): string | undefined {
  const value = headerValue(headers, "content-type");
  if (value === undefined) {
    return undefined;
  }
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === undefined || mediaType === "" ? undefined : mediaType;
}

function headerValue(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function resolveSettings(options: FeedFetchOptions): Settings {
  const settings = {
    maxRedirects: options.maxRedirects ?? FEED_FETCH_DEFAULTS.maxRedirects,
    maxResponseBytes:
      options.maxResponseBytes ?? FEED_FETCH_DEFAULTS.maxResponseBytes,
    timeoutMs: options.timeoutMs ?? FEED_FETCH_DEFAULTS.timeoutMs,
    retries: options.retries ?? FEED_FETCH_DEFAULTS.retries,
    retryDelayMs: options.retryDelayMs ?? FEED_FETCH_DEFAULTS.retryDelayMs,
    sleep: options.sleep ?? defaultSleep,
  };

  const numericSettings = [
    ["maxRedirects", settings.maxRedirects],
    ["maxResponseBytes", settings.maxResponseBytes],
    ["timeoutMs", settings.timeoutMs],
    ["retries", settings.retries],
    ["retryDelayMs", settings.retryDelayMs],
  ] as const;
  for (const [name, value] of numericSettings) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(name + " must be a non-negative safe integer");
    }
  }
  if (settings.maxResponseBytes === 0 || settings.timeoutMs === 0) {
    throw new RangeError(
      "maxResponseBytes and timeoutMs must be greater than zero",
    );
  }

  return settings;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function failure(
  sourceId: string,
  code: FeedFetchFailureCode,
  message: string,
  url: string,
  attempts: number,
  redirects: number,
): FeedFetchFailure {
  return { kind: "failure", sourceId, code, message, url, attempts, redirects };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
