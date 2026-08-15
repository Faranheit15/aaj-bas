/**
 * Reading published content over the network.
 *
 * PRD section 12.3 pins the two public paths, and this module is the only place
 * that knows them. Section 15 keeps the boundary narrow on purpose: the UI asks
 * for an edition and is told either an edition or why not, and would not change
 * if this were served by an edge function later.
 *
 * The contract is a result union, never a rejection. A thrown value at a
 * boundary that has five genuinely different outcomes turns all five into "an
 * error happened", which is exactly what section 37 forbids.
 *
 * The five are distinguished because they are five different things to say to
 * a reader:
 *
 * - `network`   the request never completed — offline, aborted, timed out;
 * - `unavailable` there is no such document;
 * - `unreachable` the host answered, and not with the document;
 * - `malformed` a document arrived and is not JSON;
 * - `invalid`   JSON arrived and is not an edition this reader understands.
 *
 * Three of those need care.
 *
 * A static host serving a single-page application answers a missing file with
 * the HTML shell and status 200, so "no edition for that date" arrives looking
 * exactly like a successful fetch. Without the content-type check below, every
 * missing archive date would be reported to the reader as corrupt content. The
 * body is therefore only trusted as JSON when the response says it is JSON.
 * That predicate is `json-content-type.ts` rather than a function here, because
 * the service worker needs the same one on the write side: a copy that drifted
 * would let the worker save an HTML document over a good cached edition.
 *
 * And the body is read as text and parsed here rather than through
 * `response.json()`, because that method collapses a connection dropped
 * mid-body and a truncated document into the same rejection — the network
 * failure the reader can retry and the content failure they cannot.
 *
 * And `unreachable` is separate from `unavailable` because only one of them is
 * a statement about published content. A 404 is the host saying it looked and
 * there is nothing there; a 500, a 502 or a 429 is the host saying nothing
 * about the content at all. Collapsing them would let a CDN outage tell every
 * reader that the edition they are waiting for was never published.
 *
 * A successful result also says WHERE the bytes came from and WHEN they were
 * sent. Both are read off the response and neither is inferred, because the
 * alternatives are guesses: comparing `date` against the device clock would
 * call a correct response cached whenever a reader's clock is skewed, and
 * `navigator.onLine` describes a network adapter rather than a document.
 */

import { createLogger } from "@aaj-bas/logger";
import {
  type Edition,
  type EditionIndex,
  editionIndexSchema,
  editionSchema,
} from "@aaj-bas/schemas";
import { CACHE_SOURCE_HEADER } from "../service-worker/cache-names";
import { isJson } from "./json-content-type";

/**
 * Where the bytes in hand came from.
 *
 * Named `source` rather than `offline` deliberately. Which of the two produced
 * this document is knowable — the worker says so — while the reader's
 * connectivity is not: `navigator.onLine` is false reliably and true
 * meaninglessly, and a captive portal answers every request without reaching
 * this origin. Everything the reader is told about a saved copy is therefore
 * phrased as a fact about the copy.
 */
export type EditionSource = "network" | "cache";

/**
 * The header the service worker sets on a response it served from its cache.
 *
 * Declared in `service-worker/cache-names.ts` and re-exported here, rather than
 * the other way round: this module imports Zod and reads `import.meta.env`, so
 * a service worker cannot import from it at all, and the shared name has to
 * live where both sides can reach it. Two copies of a string that must match,
 * in files that are never edited together, would fail by silently reporting
 * every cached edition as freshly fetched.
 */
export { CACHE_SOURCE_HEADER };

export type EditionFailureReason =
  | "network"
  | "unavailable"
  | "unreachable"
  | "malformed"
  | "invalid";

export type EditionResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly source: EditionSource;
      /**
       * When the origin says it sent these bytes, as an ISO instant, or null
       * when it did not say or said something unparseable.
       *
       * Null is a supported answer and not a defect to paper over. The one
       * thing this field must never hold is a time this device invented:
       * `Date.now()` here would put "Downloaded just now" under a copy saved
       * last week, and it would also be the first reading timestamp this
       * product has ever stored — the exact thing ADR-0007 rejected LRU
       * eviction to avoid.
       */
      readonly copyDate: string | null;
    }
  | { readonly ok: false; readonly reason: EditionFailureReason };

export type EditionRepository = {
  readonly getIndex: (
    signal: AbortSignal,
  ) => Promise<EditionResult<EditionIndex>>;
  readonly getByDate: (
    date: string,
    signal: AbortSignal,
  ) => Promise<EditionResult<Edition>>;
};

const INDEX_URL = "/content/latest.json";

const log = createLogger("web", import.meta.env.DEV ? "debug" : "warn");

export const editionRepository: EditionRepository = {
  getIndex: async (signal) => {
    const body = await fetchJson(INDEX_URL, signal);
    if (!body.ok) {
      return body;
    }

    const parsed = editionIndexSchema.safeParse(body.value);
    if (!parsed.success) {
      logRefusal(INDEX_URL, parsed.error.issues);
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      value: parsed.data,
      source: body.source,
      copyDate: body.copyDate,
    };
  },

  getByDate: async (date, signal) => {
    const url = editionUrl(date);
    const body = await fetchJson(url, signal);
    if (!body.ok) {
      return body;
    }

    // A schema failure refuses the whole edition rather than rendering the
    // stories that happened to parse. Section 16 makes `schemaVersion` a
    // literal for exactly this: half an edition is a claim the publisher never
    // made, and there is no way for a reader to tell which half is missing.
    const parsed = editionSchema.safeParse(body.value);
    if (!parsed.success) {
      logRefusal(url, parsed.error.issues);
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      value: parsed.data,
      source: body.source,
      copyDate: body.copyDate,
    };
  },
};

function editionUrl(date: string): string {
  return `/content/editions/${date}.json`;
}

async function fetchJson(
  url: string,
  signal: AbortSignal,
): Promise<EditionResult<unknown>> {
  let response: Response;

  try {
    response = await fetch(url, {
      signal,
      // Cloudflare Pages already sends `max-age=0, must-revalidate` with an
      // ETag, so this revalidates cheaply and a 304 still serves from cache.
      // `no-store` would refetch the whole edition on every visit.
      cache: "no-cache",
      headers: { accept: "application/json" },
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!response.ok) {
    // 404 and 410 are the only statuses that say anything about the content:
    // the host looked, and there is no such document. Every other refusal --
    // 5xx, 429, a misconfigured 403 -- is the host declining to answer, which
    // is a different sentence. Reporting them as `unavailable` would tell a
    // reader nothing is published during an outage of the thing that publishes.
    return {
      ok: false,
      reason: isMissing(response.status) ? "unavailable" : "unreachable",
    };
  }

  if (!isJson(response.headers.get("content-type"))) {
    // The single-page fallback: an HTML shell, status 200, in place of a file
    // that does not exist. Reported as unavailable, because that is what it is.
    return { ok: false, reason: "unavailable" };
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    // The headers arrived and the body did not: still a network failure.
    return { ok: false, reason: "network" };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text) as unknown,
      source: sourceOf(response),
      copyDate: copyDateOf(response),
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/**
 * Whether the worker answered this request out of its cache.
 *
 * Presence of the header, not its value: the worker owns what it puts there,
 * and a reader that also required a particular value would report a cached
 * edition as freshly fetched the day the worker's wording changed.
 */
function sourceOf(response: Response): EditionSource {
  return response.headers.get(CACHE_SOURCE_HEADER) === null
    ? "network"
    : "cache";
}

/**
 * The `date` header, converted from RFC 7231 to ISO.
 *
 * Nothing new is stored to produce this. The header is already on the response
 * the Cache API kept, so the download time travels with the copy it describes
 * and is deleted with it — which is why this is the timestamp PRD section 7.2
 * asks for and ADR-0007's privacy argument still permits.
 *
 * An absent or unparseable header yields null, and the sentence built from it
 * disappears. Every alternative fabricates: the device clock is not when the
 * copy arrived, and a rendered "Invalid Date" is worse than saying nothing.
 */
function copyDateOf(response: Response): string | null {
  const header = response.headers.get("date");
  if (header === null) {
    return null;
  }

  const sent = new Date(header);

  return Number.isNaN(sent.getTime()) ? null : sent.toISOString();
}

/** Whether a status is the host reporting that the document is not there. */
function isMissing(status: number): boolean {
  return status === 404 || status === 410;
}

/**
 * Records where a document failed validation, never what it contained.
 *
 * Section 38 rules out logging third-party content, and a validation issue's
 * message can quote the value that failed. Paths and a count locate the
 * problem in the published file, which is where it has to be fixed anyway.
 */
function logRefusal(
  url: string,
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): void {
  log.error("Refused published content that failed validation.", {
    url,
    issueCount: issues.length,
    paths: [
      ...new Set(
        issues.map((issue) => issue.path.map(String).join(".") || "(root)"),
      ),
    ],
  });
}
