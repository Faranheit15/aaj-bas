/**
 * Production network environment for safe feed fetching.
 *
 * Implements DNS resolution and HTTPS transport with:
 * - DNS address pinning to eliminate DNS-rebinding vulnerabilities (ADR-0012).
 * - Direct IP routing using checked address list in https.request lookup.
 * - Strict HTTPS transport validation and timeouts.
 * - Enforced response payload byte limits (1 MiB default).
 */

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type {
  FeedFetchEnvironment,
  FeedTransportFailure,
  FeedTransportRequest,
  FeedTransportResult,
  ResolvedFeedAddress,
} from "@aaj-bas/domain";

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("operation timed out after " + timeoutMs + "ms");
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function resolveFeedAddresses(
  hostname: string,
  timeoutMs: number,
): Promise<readonly ResolvedFeedAddress[]> {
  const addresses = await withTimeout(
    lookup(hostname, { all: true, verbatim: true }),
    timeoutMs,
  );
  return addresses.map((address) => ({
    address: address.address,
    family: address.family,
  }));
}

export function requestFeed(
  input: FeedTransportRequest,
): Promise<FeedTransportResult> {
  return new Promise((resolve) => {
    let finished = false;
    let requestHandle: ReturnType<typeof request> | undefined;

    const finish = (result: FeedTransportResult): void => {
      if (finished) {
        return;
      }
      finished = true;
      resolve(result);
    };

    const fail = (error: unknown): void => {
      finish({
        ok: false,
        error: {
          code: "network",
          message: "HTTPS request failed: " + describe(error),
        },
      });
    };

    try {
      requestHandle = request(
        {
          hostname: input.url.hostname,
          path: (input.url.pathname || "/") + input.url.search,
          method: "GET",
          headers: { ...input.headers },
          servername: input.url.hostname,
          agent: false,
          rejectUnauthorized: true,
          lookup: (_hostname, options, callback) => {
            const addresses = input.addresses.map((address) => ({
              address: address.address,
              family: address.family,
            }));
            if (addresses.length === 0) {
              callback(new Error("the checked address list was empty"));
            } else if (options.all) {
              callback(null, addresses);
            } else {
              const first = addresses[0];
              if (first === undefined) {
                callback(new Error("the checked address list was empty"));
              } else {
                callback(null, first.address, first.family);
              }
            }
          },
        },
        (response) => {
          let ended = false;
          let byteLength = 0;
          const chunks: Uint8Array[] = [];
          const headers = normalizeHeaders(response.headers);
          const declaredLength = headers["content-length"];

          if (
            declaredLength !== undefined &&
            /^\d+$/.test(declaredLength) &&
            Number(declaredLength) > input.maxResponseBytes
          ) {
            response.destroy();
            requestHandle?.destroy();
            finish(responseTooLarge(input.maxResponseBytes));
            return;
          }

          response.on("data", (chunk) => {
            if (finished) {
              return;
            }
            const bytes = toBytes(chunk);
            if (byteLength + bytes.byteLength > input.maxResponseBytes) {
              response.destroy();
              requestHandle?.destroy();
              finish(responseTooLarge(input.maxResponseBytes));
              return;
            }
            chunks.push(bytes);
            byteLength += bytes.byteLength;
          });
          response.on("error", fail);
          response.on("aborted", () => fail(new Error("response aborted")));
          response.on("close", () => {
            if (!ended && !finished) {
              fail(new Error("response closed before it ended"));
            }
          });
          response.on("end", () => {
            ended = true;
            if (response.statusCode === undefined) {
              fail(new Error("response did not include a status code"));
              return;
            }
            finish({
              ok: true,
              response: {
                status: response.statusCode,
                headers,
                body: joinBytes(chunks, byteLength),
              },
            });
          });
        },
      );
      requestHandle.on("error", fail);
      requestHandle.setTimeout(input.timeoutMs, () => {
        if (finished) {
          return;
        }
        requestHandle?.destroy();
        finish({
          ok: false,
          error: {
            code: "timeout",
            message: "HTTPS request exceeded the timeout",
          },
        });
      });
      requestHandle.end();
    } catch (error) {
      fail(error);
    }
  });
}

function responseTooLarge(maxResponseBytes: number): {
  readonly ok: false;
  readonly error: FeedTransportFailure;
} {
  return {
    ok: false,
    error: {
      code: "response-too-large",
      message: `response exceeds the ${maxResponseBytes}-byte limit`,
    },
  };
}

function normalizeHeaders(
  headers: Record<string, string | readonly string[] | undefined>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const lowerName = name.toLowerCase();
    normalized[lowerName] =
      typeof value === "string" ? value : value.join(", ");
  }
  return normalized;
}

function toBytes(chunk: Uint8Array | string): Uint8Array {
  if (typeof chunk === "string") {
    return new TextEncoder().encode(chunk);
  }
  return chunk;
}

function joinBytes(
  chunks: readonly Uint8Array[],
  totalLength: number,
): Uint8Array {
  const joined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const PRODUCTION_ENVIRONMENT: FeedFetchEnvironment = {
  resolver: {
    resolve: resolveFeedAddresses,
  },
  transport: {
    request: requestFeed,
  },
};
