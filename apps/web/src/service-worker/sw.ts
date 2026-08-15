/**
 * The service worker, which decides nothing.
 *
 * Every judgement it appears to make is made in `cache-plan.ts` as a function
 * of plain values, and every judgement about what to install is made in
 * `planPrecache`. What is left here is the part that can only be done in a
 * worker: opening caches, calling `fetch`, and returning responses. That split
 * is why offline behaviour is testable at all -- jsdom has no service worker,
 * no Cache Storage and no fetch interception, so anything decided in this file
 * could only be verified in a browser.
 *
 * Three things this worker deliberately does NOT do.
 *
 * It does not reload the reader. `skipWaiting` and `clients.claim` are called,
 * so a new build takes over pages the old one loaded; a `controllerchange`
 * listener that reloaded them would interrupt someone mid-edition to deliver a
 * shell they did not ask for (section 49). The classic hazard of claiming an
 * old page -- a lazily imported chunk only the old build had -- does not exist
 * here: this application emits one JavaScript file and one stylesheet with no
 * dynamic imports, and `build-service-worker.ts --verify` fails the build if
 * that stops being true.
 *
 * It has no push, notification, background sync, periodic sync or navigation
 * preload handler, and not as an oversight to be filled in later: a product
 * that must be easy to stop using does not acquire the ability to interrupt a
 * reader who closed it. Their absence is asserted in `sw-shape.test.ts`.
 *
 * And it never touches its own script, a cross-origin request, or a non-GET.
 * `planRequest` refuses all three, each for a reason recorded there.
 */

import {
  CACHE_SOURCE_HEADER,
  CONTENT_CACHE,
  shellCacheName,
} from "./cache-names";
import {
  MAX_CACHED_EDITIONS,
  mayCacheResponse,
  planCacheCleanup,
  planEditionEviction,
  planRequest,
  type ResponseFacts,
} from "./cache-plan";

/**
 * `self` is typed as a `Window` by the DOM library this repository loads, and
 * the WebWorker library cannot be loaded beside it. The narrow shape asserted
 * here is declared in `build-constants.d.ts`, one member at a time.
 */
const worker = self as unknown as ServiceWorkerGlobalScope;

const SHELL_CACHE = shellCacheName(__BUILD_ID__);

/** PRD section 12.3's pointer. Spelled here for the reason `cache-plan` gives. */
const INDEX_PATH = "/content/latest.json";

/** Shape only, and not for correctness: see `warmContent`. */
const EDITION_DATE = /^\d{4}-\d{2}-\d{2}$/;

worker.addEventListener("install", (event) => {
  event.waitUntil(install());
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(activate());
});

worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const plan = planRequest({
    method: event.request.method,
    mode: event.request.mode,
    destination: event.request.destination,
    path: url.pathname,
    origin: worker.location.origin,
    requestOrigin: url.origin,
  });

  switch (plan.kind) {
    case "ignore":
      // Deliberately no `respondWith`: the browser then makes the request
      // exactly as it would with no worker installed.
      return;
    case "navigation":
      event.respondWith(fromShell(plan.key, event.request));
      return;
    case "shell":
      event.respondWith(fromShell(url.pathname, event.request));
      return;
    case "content":
      event.respondWith(fromNetwork(event.request, url.pathname));
      return;
    default: {
      // Adding a plan kind must fail to compile here rather than quietly
      // falling through to whatever this switch happens to do last.
      const _unreachable: never = plan;
      return;
    }
  }
});

/**
 * The precache is atomic and its failure is fatal; the warm-up's is swallowed.
 *
 * That asymmetry is the decision, not an accident of where the `catch` landed.
 * `addAll` rejects as a whole, so a half-written shell can never activate --
 * and a half-shell is worse than no worker, because it would serve an
 * `index.html` whose script tag points at an asset that was never stored. The
 * warm-up is the opposite case: a CDN blip on one pointer must not leave every
 * reader of that minute with no worker at all, when everything the criterion
 * asks for is already installed.
 */
async function install(): Promise<void> {
  const shell = await worker.caches.open(SHELL_CACHE);

  await shell.addAll([...__PRECACHE__]);
  await worker.skipWaiting();
  await warmContent().catch(() => undefined);
}

/**
 * Saves the pointer and the edition it names, so the first load is enough.
 *
 * The acceptance criterion is that the current edition opens in airplane mode
 * *after one successful load*, and on that load the worker was not yet
 * controlling the page: nothing the page fetched passed through the handler
 * above. So the worker fetches those two documents itself.
 *
 * `latest` is read from a document this origin published, and it is still
 * checked for shape before being put in a path. Not because a published
 * pointer is expected to be hostile, but because interpolating an unvalidated
 * string into a URL is the habit worth not having (section 18). Zod would be
 * the repository's usual answer and cannot be: it must not enter this bundle.
 */
async function warmContent(): Promise<void> {
  const content = await worker.caches.open(CONTENT_CACHE);
  const index = await save(content, INDEX_PATH);

  if (index === null) {
    return;
  }

  const pointer = JSON.parse(await index.text()) as {
    readonly latest?: unknown;
  };

  if (typeof pointer.latest === "string" && EDITION_DATE.test(pointer.latest)) {
    await save(content, `/content/editions/${pointer.latest}.json`);
  }
}

async function activate(): Promise<void> {
  const keep = [SHELL_CACHE, CONTENT_CACHE];

  for (const name of planCacheCleanup(await worker.caches.keys(), keep)) {
    await worker.caches.delete(name);
  }

  await worker.clients.claim();
}

/**
 * Cache-first, because a fingerprinted name is its own version.
 *
 * A miss means another build's asset, so it is fetched and deliberately not
 * written: this cache holds exactly one build's file list, and a runtime write
 * would put a file in it that no build id accounts for.
 */
async function fromShell(key: string, request: Request): Promise<Response> {
  const shell = await worker.caches.open(SHELL_CACHE);

  // `ignoreVary` because the shell was stored by `addAll`, whose request sends
  // `accept: */*`, and is served back to a navigation, which sends an HTML
  // accept list. A `Vary` header naming `accept` would make those two different
  // representations to the Cache API and the lookup would miss -- silently, and
  // only when a reader is offline. One URL has one representation here.
  return (await shell.match(key, { ignoreVary: true })) ?? fetch(request);
}

/**
 * Network-first, and the cache only when the network produced no answer.
 *
 * A response that ARRIVED is returned whatever it says -- a 404, a 500, or this
 * host's 200-and-HTML for a withdrawn edition. Substituting a saved copy for
 * one of those would hide a withdrawal behind yesterday's text and present a
 * stale edition as current (section 26), and `edition-repository.ts` already
 * distinguishes all three for the reader. Only a request that never completed
 * falls back, and what comes back then is marked as a saved copy.
 */
async function fromNetwork(request: Request, path: string): Promise<Response> {
  const content = await worker.caches.open(CONTENT_CACHE);
  let response: Response;

  try {
    response = await fetch(request);
  } catch (unreachable) {
    const saved = await content.match(path, { ignoreVary: true });

    // Nothing saved and no network: the request fails exactly as it would
    // without a worker, and the reader sees the failure state the application
    // already has. Swallowing it here would turn "we have nothing" into an
    // empty success (section 37).
    if (saved === undefined) {
      throw unreachable;
    }

    return asSavedCopy(saved);
  }

  if (mayCacheResponse(factsOf(response))) {
    await content.put(path, response.clone());
    await evict(content, path);
  }

  return response;
}

async function save(content: Cache, path: string): Promise<Response | null> {
  const response = await fetch(path, { cache: "no-cache" });

  if (!mayCacheResponse(factsOf(response))) {
    return null;
  }

  await content.put(path, response.clone());

  return response;
}

function factsOf(response: Response): ResponseFacts {
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    kind: "content",
  };
}

/**
 * The same bytes, saying that they were saved.
 *
 * A response from the Cache API carries an immutable header list, so the one
 * header the reader needs has to go on a new response around the same body.
 * Every other header is carried across, `date` above all: it is when this copy
 * was downloaded, and reading it is what lets the product say so without ever
 * minting a timestamp on the device (ADR-0007, ADR-0010).
 */
function asSavedCopy(saved: Response): Response {
  const headers = new Headers(saved.headers);
  headers.set(CACHE_SOURCE_HEADER, "1");

  return new Response(saved.body, {
    status: saved.status,
    statusText: saved.statusText,
    headers,
  });
}

async function evict(content: Cache, justWritten: string): Promise<void> {
  const held = (await content.keys()).map(
    (request) => new URL(request.url).pathname,
  );

  for (const path of planEditionEviction(
    held,
    justWritten,
    MAX_CACHED_EDITIONS,
  )) {
    await content.delete(path);
  }
}
