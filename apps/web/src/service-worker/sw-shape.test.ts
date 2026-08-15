/**
 * The two workers, read as source text.
 *
 * Everything decidable from values is decided in `cache-plan.test.ts`, and
 * everything that needs a browser is decided in a browser. What is left is a
 * short list of properties that are true of these files because of what is
 * ABSENT from them, and an absence has no behaviour for either kind of test to
 * observe: jsdom has no service worker at all, so `sw.ts` is never executed by
 * this suite, and a browser could only show that a capability was not used
 * today -- never that it is not there.
 *
 * `styles.test.ts` reads the stylesheet the same way and for the same reason.
 * The four properties below are the ones a later slice would remove in good
 * faith, each in a single line, and each with nothing else failing:
 *
 * - RELOADING THE READER. A `controllerchange` listener that reloads the page
 *   is the conventional service worker snippet, present in most tutorials. Here
 *   it takes a reader out of the edition they are reading to hand them a
 *   different shell (section 49). The tombstone is the one worker allowed to do
 *   it, because there it is handing the page back to the network.
 *
 * - DELETING CACHES ANYWHERE BUT THE CLEANUP. One call, over a list
 *   `planCacheCleanup` produced, is what keeps "never delete a cache this
 *   product did not create" a property of the worker rather than of one code
 *   path in it.
 *
 * - NAMING ITS OWN SCRIPT. A worker that can answer for `/sw.js` is served its
 *   own bytes by the update check and can never be replaced remotely -- so a
 *   future security fix in the reader would be a fix that never arrives. The
 *   refusal belongs in `planRequest`, where it is asserted as a value; this
 *   file asserts that the worker has no second opinion about it.
 *
 * - PUSH, NOTIFICATIONS AND BACKGROUND SYNC. A product that must be easy to
 *   stop using does not acquire the ability to interrupt a reader who closed
 *   it (sections 3.1 and 3.2). These are excluded by decision rather than by
 *   omission, and a decision is worth asserting.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install.
 */
import { describe, expect, it } from "vitest";
import sw from "./sw.ts?raw";
import tombstone from "./tombstone.ts?raw";

/**
 * Each worker with its comments stripped.
 *
 * The comments are where these rules are argued -- `sw.ts` explains at length
 * why it must not reload a client, and the tombstone explains what it is for --
 * so asserting against the raw text would fail on the explanations and say
 * nothing about the code.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const worker = code(sw);
const kill = code(tombstone);

/** Every capability that can interrupt a reader who has closed the product. */
const INTERRUPTIONS = [
  /\bpush\b/i,
  /Notification/i,
  /\bsync\b/i,
  /BackgroundFetch/i,
  /navigationPreload/i,
] as const;

describe("the service worker", () => {
  it("installs a shell, claims its pages, and answers from a plan", () => {
    /*
      The positive set, and it is load-bearing: every assertion below is an
      absence, and an empty string -- a moved file, a `?raw` import that
      silently resolved to nothing -- satisfies all of them at once.
    */
    expect(worker).toContain("shell.addAll([...__PRECACHE__])");
    expect(worker).toContain("worker.skipWaiting()");
    expect(worker).toContain("worker.clients.claim()");
    expect(worker).toContain("planRequest({");
  });

  it("never reloads a reader who is in the middle of an edition", () => {
    // The conventional snippet, and the reason it is conventional is that most
    // products want the reader to have the newest build immediately. This one
    // would rather they finished reading.
    expect(worker).not.toMatch(/controllerchange/i);
    expect(worker).not.toMatch(/location\s*\.\s*reload/);
    expect(worker).not.toMatch(/\.navigate\s*\(/);
    expect(worker).not.toMatch(/matchAll/);
  });

  it("deletes caches in exactly one place, over a list it was given", () => {
    // A second deletion elsewhere -- a quota handler, a "clear stale content"
    // helper -- would be a path to a reader's saved editions that
    // `planCacheCleanup` never sees and no test covers.
    expect([...worker.matchAll(/caches\.delete/g)]).toHaveLength(1);
    expect(worker).toContain("for (const name of planCacheCleanup(");
  });

  it("never names its own script, so it can always be replaced", () => {
    expect(worker).not.toContain("/sw.js");
  });

  it("cannot interrupt a reader: no push, notification, or background sync", () => {
    for (const capability of INTERRUPTIONS) {
      expect([capability.source, capability.test(worker)]).toStrictEqual([
        capability.source,
        false,
      ]);
    }
  });
});

describe("the tombstone worker", () => {
  it("removes itself: it clears every cache and unregisters", () => {
    // The positive set for this file, and the whole of what it is for.
    expect(kill).toContain("worker.registration.unregister()");
    expect(kill).toContain("planCacheCleanup(await worker.caches.keys(), [])");
    expect(kill).toContain("worker.skipWaiting()");
  });

  it("is the one worker that puts its pages back on the network", () => {
    // Reloading is user-hostile from the real worker and necessary from this
    // one: the page is otherwise still controlled by a worker being retired.
    expect(kill).toContain("client.navigate(client.url)");
  });

  it("intercepts nothing at all, from its first moment", () => {
    // Not merely "answers from the network": no fetch handler exists, so there
    // is no request this worker is ever in a position to answer or to observe.
    expect(kill).not.toContain('addEventListener("fetch"');
    expect(kill).not.toMatch(/respondWith/);
  });

  it("cannot interrupt a reader either", () => {
    for (const capability of INTERRUPTIONS) {
      expect([capability.source, capability.test(kill)]).toStrictEqual([
        capability.source,
        false,
      ]);
    }
  });
});
