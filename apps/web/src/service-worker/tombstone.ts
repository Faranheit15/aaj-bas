/**
 * The worker whose only job is to remove this product's worker.
 *
 * IT EXISTS BECAUSE DELETING `sw.js` FROM THE BUILD IS THE WORST AVAILABLE
 * RESPONSE, not the fix it looks like. The service worker update algorithm
 * requires the script response to carry a JavaScript media type. Cloudflare
 * Pages answers a path it cannot match with HTTP 200 and `text/html`, so
 * removing the file makes every update check fail on the media type -- and a
 * failed update does not remove the registration. The broken worker stays
 * installed and in control, on every device that has it, permanently. Chromium
 * does unregister a worker whose script returns 404, but this host never
 * returns 404, so that safety net does not exist here.
 *
 * The way out is therefore a worker that is still a valid script and still
 * updates cleanly, and whose whole behaviour is to undo itself: delete every
 * cache this product created, unregister, and put each open page back on the
 * network.
 *
 * It ships as a build-time variant rather than as a flag the running worker
 * reads. Activating it is then an ordinary reviewed pull request through the
 * deploy path ADR-0002 already describes -- decided in review rather than
 * written under incident pressure -- and the real worker gains no code path
 * that could ever wipe a reader's caches by accident.
 *
 * IT IS ALSO THE ONLY WORKER PERMITTED TO RELOAD A READER. `sw.ts` must never
 * do it: taking a reader out of the edition they are reading to hand them a
 * different shell is exactly the interruption section 49 asks about. Here the
 * page is being handed back to the network from a worker that no longer exists,
 * and leaving it controlled by a worker being retired is the worse outcome.
 *
 * It registers no `fetch` handler at all, so from its first moment nothing on
 * this origin is intercepted.
 */

import { createLogger } from "@aaj-bas/logger";
import { planCacheCleanup } from "./cache-plan";

const worker = self as unknown as ServiceWorkerGlobalScope;

/**
 * `warn`, and warn is honest: a deployment that retires its own service worker
 * is an incident response. One bounded line, naming the build that shipped the
 * tombstone and nothing about the reader (section 38).
 */
const log = createLogger("service-worker", "warn");

worker.addEventListener("install", (event) => {
  // No precache and no waiting: the whole point is to replace the installed
  // worker as fast as the browser allows.
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(retire());
});

async function retire(): Promise<void> {
  log.warn("Retiring the service worker.", { buildId: __BUILD_ID__ });

  // `keep` is empty, so this deletes every `aaj-bas-` cache -- and still only
  // those. A kill switch that deleted caches this product did not create would
  // be destroying another origin's data on the way out.
  for (const name of planCacheCleanup(await worker.caches.keys(), [])) {
    await worker.caches.delete(name);
  }

  await worker.registration.unregister();

  // Claim first, then navigate: a page loaded before this worker activated is
  // otherwise still controlled by the worker being removed, and would keep
  // being answered by it until it closed.
  await worker.clients.claim();

  for (const client of await worker.clients.matchAll({ type: "window" })) {
    // Its own URL, so a reader lands back where they were rather than at the
    // front page of a product they were in the middle of.
    await client.navigate(client.url);
  }
}
