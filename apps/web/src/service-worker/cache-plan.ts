/**
 * Every decision the service worker makes, as functions of plain values.
 *
 * The worker itself opens caches, calls `fetch`, and returns responses. It
 * decides nothing: which strategy a request gets, whether a response may be
 * written down, which caches a new build may delete, and which saved editions
 * a new one displaces are all answered here, from primitives.
 *
 * Functions of primitives rather than of a `Request` or a `Response`, for the
 * same reason `routing/route.ts` takes a pathname rather than a `Location`: a
 * test can then state the case it means. jsdom has no service worker, no Cache
 * Storage and no fetch interception, so anything shaped like the browser API
 * could only be tested against a mock of the subject -- and the cases that
 * matter here are precisely the ones a mock would be written to satisfy.
 *
 * Three of the four are load-bearing beyond correctness.
 *
 * CLASSIFICATION IS BY PATH BEFORE IT IS BY NAVIGATION. `index.html` carries a
 * real link to `/content/latest.json` inside its `noscript` block, so a reader
 * can navigate to a content path. Checking `mode` first would answer that
 * navigation with the HTML shell -- reintroducing inside the worker the
 * catch-all bug `public/_redirects` carries a nine-line comment forbidding, in
 * a place no `_redirects` review would ever look.
 *
 * CONTENT IS NETWORK-FIRST, never cache-first and never stale-while-
 * revalidate. ADR-0006 records that a correction rewrites a dated edition in
 * place and bumps `editionVersion`. Any strategy that answers from the cache
 * and revalidates afterwards shows an online reader the uncorrected text, which
 * makes a caching choice into the silent suppression of a correction that
 * section 46 requires be visible.
 *
 * AND A RESPONSE IS ONLY WRITTEN DOWN IF IT SAYS IT IS JSON. That guard is
 * argued where it lives, below.
 */

import { isJson } from "../edition/json-content-type";
import { CACHE_PREFIX } from "./cache-names";

/**
 * The published paths, spelled here rather than imported from
 * `edition-repository.ts`, which the worker cannot import: that module pulls in
 * Zod and reads `import.meta.env`, and a service worker bundle must have
 * neither. PRD section 12.3 pins both, and `planRequest` treats the whole
 * prefix alike, so the pointer and the archive cannot drift apart here.
 */
const CONTENT_PREFIX = "/content/";
const EDITIONS_PREFIX = "/content/editions/";

/** Vite's fingerprinted output. The hash in the name is the version. */
const ASSETS_PREFIX = "/assets/";

/** The document every navigation is answered with, and the only such key. */
export const SHELL_KEY = "/index.html";

/**
 * The worker's own script.
 *
 * Never intercepted, and this is the single most important line in the file. A
 * worker able to answer for its own script is served its own bytes by the
 * update check and can never be replaced -- so a fault in the worker would
 * become permanent on every device that had it, with no remote fix possible.
 */
const WORKER_PATH = "/sw.js";

/**
 * How many editions a device keeps.
 *
 * The rules are ADR-0007's, deliberately: the entry just written is always
 * kept, entries are dropped whole, and there is no clock and no record of when
 * anything was read -- storing that would be a behavioural timestamp, which
 * that record rejected least-recently-used eviction to avoid.
 *
 * The number is smaller than the thirty editions the stored document remembers,
 * and is defined here rather than imported from `local-state.ts`: that module
 * imports Zod, and importing a constant from it would put a validation library
 * in the service worker to read one integer.
 */
export const MAX_CACHED_EDITIONS = 10;

/** What the worker knows about a request before it decides anything. */
export interface RequestFacts {
  readonly method: string;
  /** `"navigate"` for a document the browser is loading into a window. */
  readonly mode: string;
  /** `"document"` for the same. Reported by browsers that omit `mode`. */
  readonly destination: string;
  readonly path: string;
  /** The origin this worker was served from. */
  readonly origin: string;
  /** The origin the request is addressed to. */
  readonly requestOrigin: string;
}

export type RequestPlan =
  /** Not answered at all: the browser makes the request as if no worker existed. */
  | { readonly kind: "ignore" }
  /** Answered from the shell cache under `key`, whatever the address was. */
  | { readonly kind: "navigation"; readonly key: string }
  /** Answered from the shell cache under its own path, or from the network. */
  | { readonly kind: "shell" }
  /** Answered from the network, and from the cache only if that fails. */
  | { readonly kind: "content" };

export function planRequest(facts: RequestFacts): RequestPlan {
  // A worker that answered anything but a GET would have to decide what a POST
  // means to a cache. This product issues none, and the browser handles them
  // exactly as it would with no worker installed.
  if (facts.method !== "GET") {
    return { kind: "ignore" };
  }

  // Source links go to publishers. A worker positioned to see that traffic
  // would be a record of what a reader followed, held by us, which is the
  // collection section 23 refuses -- and it would be invisible, because
  // declining to call `respondWith` looks identical from the page.
  if (facts.requestOrigin !== facts.origin) {
    return { kind: "ignore" };
  }

  if (facts.path === WORKER_PATH) {
    return { kind: "ignore" };
  }

  // BEFORE the navigation test, and this order is the point. The `noscript`
  // link makes a navigation to a content path a thing a reader can actually do.
  if (facts.path.startsWith(CONTENT_PREFIX)) {
    return { kind: "content" };
  }

  if (facts.path.startsWith(ASSETS_PREFIX)) {
    return { kind: "shell" };
  }

  // Either fact alone identifies a document being loaded into a window, and
  // requiring both would drop the offline shell in any browser reporting one
  // and not the other. Answering a document request from the shell is the
  // right answer under either name.
  if (facts.mode === "navigate" || facts.destination === "document") {
    return { kind: "navigation", key: SHELL_KEY };
  }

  // Anything else same-origin -- the manifest, a favicon a later slice adds --
  // is left to the browser. It is not part of what a reader needs to read an
  // edition offline, and precaching something is not a reason to intercept it.
  return { kind: "ignore" };
}

/** What the worker knows about a response before deciding to keep it. */
export interface ResponseFacts {
  readonly ok: boolean;
  readonly status: number;
  readonly contentType: string | null;
  /** The plan kind this response answers. */
  readonly kind: string;
}

/**
 * Whether this response may be written to a cache.
 *
 * The content-type test is the one that matters, and it is not defensive
 * programming. Cloudflare Pages answers a path it cannot match with HTTP 200
 * and `text/html` -- verified against the live deployment, not assumed -- so a
 * withdrawn edition arrives as a successful response carrying the reader's own
 * shell. Without this test the worker would overwrite a perfectly good cached
 * edition with an HTML document, and the reader would go offline the next day
 * to a permanent "We could not display this edition." Nothing would have
 * reported a failure at any point, which is precisely how acceptance criterion
 * 2 would be lost without anyone noticing.
 *
 * Only content is ever written at runtime. The shell is written once, during
 * install, from a list the build computed; a runtime write into it would put a
 * file there that no build id accounts for.
 */
export function mayCacheResponse(facts: ResponseFacts): boolean {
  if (facts.kind !== "content") {
    return false;
  }

  // 200 exactly, not `ok`. A 206 is part of a document and the Cache API
  // refuses it outright; a 204 has no body to serve back. Both are checked
  // here so the worker never asks.
  return facts.ok && facts.status === 200 && isJson(facts.contentType);
}

/**
 * Which caches a newly activated build deletes.
 *
 * The prefix test is the whole safety property, and it is enforced here rather
 * than trusted of the caller for the reason `planRemoval` gives about names it
 * will not delete: an origin can hold caches this product never created, and
 * "the worker would only ever see its own" is an assumption a future reader of
 * the worker cannot check.
 */
export function planCacheCleanup(
  existing: readonly string[],
  keep: readonly string[],
): readonly string[] {
  const kept = new Set(keep);
  const remove = new Set<string>();

  for (const name of existing) {
    if (name.startsWith(CACHE_PREFIX) && !kept.has(name)) {
      remove.add(name);
    }
  }

  // Sorted for the same reason `planRemoval` sorts: two activations over the
  // same set delete in the same order, by UTF-16 code unit, everywhere.
  return [...remove].sort();
}

/**
 * Which saved editions the one just written displaces.
 *
 * Deliberately ADR-0007's eviction rules again rather than a second scheme:
 * the entry just written is always kept, entries are dropped whole, and the
 * decision is a pure function of the paths held and the path written. No clock
 * and no read timestamps -- least-recently-used would require storing WHEN a
 * reader read, which is strictly more sensitive than which published editions
 * they opened, and it would keep an old archive edition ahead of yesterday's.
 *
 * Order is by edition date, which is the tail of the path, so a plain
 * descending sort of fixed-width dates is newest-first without parsing one.
 *
 * @param cachedPaths - every path currently in the content cache.
 * @param justWritten - the path written a moment ago, kept whatever else goes.
 */
export function planEditionEviction(
  cachedPaths: readonly string[],
  justWritten: string,
  max: number,
): readonly string[] {
  const editions = [...new Set(cachedPaths)]
    .filter((path) => path.startsWith(EDITIONS_PREFIX) && path !== justWritten)
    .sort()
    .reverse();

  // The pointer, and anything else this function does not recognise, is never
  // evicted here. `/content/latest.json` is one small document that every load
  // begins with, and a function that deleted paths it has no rule for would be
  // the worker discarding content nobody planned to discard.
  const room = Math.max(
    0,
    max - (justWritten.startsWith(EDITIONS_PREFIX) ? 1 : 0),
  );

  return editions.slice(room);
}
