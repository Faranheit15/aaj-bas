/**
 * Installing the service worker, and saying nothing about it.
 *
 * Three conditions, and each is a decision rather than a precaution.
 *
 * PRODUCTION ONLY. The development server serves modules it rewrites on every
 * edit and has no `/sw.js` to register; a worker that did install there would
 * outlive the server that produced it and answer later sessions from a cache of
 * a build nobody has any more. Nothing about offline behaviour is verified by
 * running it locally anyway -- ADR-0010 puts that in a real browser against a
 * real build, and a worker in the dev loop would only make edits look like they
 * had not taken.
 *
 * AFTER `load`. `install` fetches the entire shell and the current edition the
 * moment it runs, so registering during the first render would put that traffic
 * beside the reader's first edition fetch on the same connection. Section 27
 * makes the first edition the thing that must arrive quickly; the offline copy
 * can wait for the page to be usable.
 *
 * AND NOTHING IS SAID WHEN IT FAILS. ADR-0007 set this precedent for storage
 * being unavailable and the argument transfers exactly: the product never
 * promised to work offline, so a reader who is left with a perfectly working
 * online reader has lost nothing they were offered. A message about a service
 * worker on a page whose job is today's news would be an interruption about our
 * infrastructure. The warning goes to the console, where it is for us.
 */

import { createLogger } from "@aaj-bas/logger";

const log = createLogger("web", import.meta.env.DEV ? "debug" : "warn");

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      // The reason, never the message: a registration error can quote a URL and
      // a media type, and a bounded name is what makes this diagnosable
      // without putting arbitrary text in a log (section 38).
      log.warn("No service worker; this reader stays online-only.", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    });
  });
}
