/**
 * When the reader installs a service worker, and what it says when it cannot.
 *
 * The worker itself is verified in a browser, because nothing else can verify
 * it. What is checkable here is the three conditions around the registration,
 * and each of them is a rule a later edit would relax for a good-looking
 * reason: registering in development to "test it locally", registering
 * immediately to "cache sooner", and telling the reader when it failed.
 *
 * The `load` handler is captured rather than dispatched. Dispatching a real
 * event on jsdom's shared window leaves every handler a previous test attached
 * still listening, so the third test would run the first test's registration --
 * but the capture is worth more than the isolation: WHICH event this waits for
 * is the property, and asserting it directly is what stops a later edit
 * registering during the first render and still passing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-service-worker";

/** Every `load` handler the module under test attached, with its arguments. */
function capture(): {
  readonly load: readonly (() => void)[];
  readonly registered: readonly (readonly unknown[])[];
} {
  const load: (() => void)[] = [];

  vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
    if (type === "load" && typeof listener === "function") {
      load.push(() => {
        listener(new Event("load"));
      });
    }
  });

  return { load, registered };
}

const registered: unknown[][] = [];

/** A browser that has the API, answering registration with `outcome`. */
function withServiceWorker(outcome: () => Promise<unknown>): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: (...args: readonly unknown[]) => {
        registered.push([...args]);
        return outcome();
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  registered.length = 0;
  // jsdom's navigator has no such property to begin with, so the fake is
  // removed rather than restored.
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("registering the service worker", () => {
  it("waits for load, so installing never competes with the first edition", () => {
    /*
      `install` fetches the whole shell and the current edition as soon as it
      runs. Moving this call out of the load handler -- one line, and it reads
      as caching sooner -- puts that traffic alongside the reader's own first
      edition fetch, which is the request section 27 is about.
    */
    vi.stubEnv("PROD", true);
    const { load, registered: calls } = capture();
    withServiceWorker(() => Promise.resolve({}));

    registerServiceWorker();

    expect(load).toHaveLength(1);
    expect(calls).toEqual([]);

    load[0]?.();

    expect(calls).toEqual([["/sw.js"]]);
  });

  it("registers nothing in development, where there is no build to cache", () => {
    // A worker installed from a dev server outlives it and then answers from a
    // cache of a build that no longer exists anywhere.
    vi.stubEnv("PROD", false);
    const { load } = capture();
    withServiceWorker(() => Promise.resolve({}));

    registerServiceWorker();

    expect(load).toEqual([]);
  });

  it("registers nothing in a browser without the API, rather than throwing", () => {
    // The property access is the hazard: `navigator.serviceWorker` is absent in
    // a non-secure context and in some private modes, and reading `.register`
    // off undefined would take down the whole application at mount.
    vi.stubEnv("PROD", true);
    const { load } = capture();

    expect(() => {
      registerServiceWorker();
    }).not.toThrow();
    expect(load).toEqual([]);
  });

  it("says nothing to the reader when registration fails", async () => {
    /*
      The product never promised to work offline, so a reader left with a fully
      working online reader has lost nothing they were offered (ADR-0007's
      precedent for storage being unavailable). What must also hold is that the
      rejection is handled at all: an unhandled one is a console error in every
      browser, and the likeliest cause of it here is the most ordinary
      misconfiguration there is -- a `/sw.js` served with the wrong media type.
    */
    vi.stubEnv("PROD", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { load } = capture();
    withServiceWorker(() => Promise.reject(new TypeError("mime type")));

    registerServiceWorker();

    expect(() => load[0]?.()).not.toThrow();

    await Promise.resolve();

    expect(warn).toHaveBeenCalledTimes(1);
    // The reason, never the message: a registration failure can quote a URL and
    // a media type back at us (section 38).
    expect(warn.mock.calls[0]).toContainEqual({ reason: "TypeError" });
  });
});
