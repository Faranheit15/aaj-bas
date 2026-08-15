/**
 * Which modules in this application are allowed to send bytes anywhere.
 *
 * `SECURITY.md` tells readers, in its own words, that "no reader data leaves
 * the reader's device". Until now that was a claim about code nobody checked
 * across the whole application: `interests-stay-on-device.test.ts` asserts the
 * same absence, but over four files named by hand, so a module added tomorrow
 * is invisible to it. A file called `events.ts` could ship a beacon and every
 * existing assertion would stay green.
 *
 * This file inverts that. Instead of asking "do these four files send?", it
 * asks "which files send?" and compares the answer to a literal list. Adding a
 * transport anywhere therefore fails here, and the fix is to edit the list —
 * a one-line diff that reads as "this module may now send bytes", which is
 * exactly the review moment ADR-0003 wanted and said it could not get:
 *
 *   "adding a network transport means writing `fetch` here, which is
 *    unarguable in review; behind a sink interface the same change would read
 *    as 'adding a sink'."
 *
 * ADR-0011 records why AB-302 ships this and not an event adapter: the guard
 * is worth more as a privacy control than the adapter it was meant to protect.
 *
 * WHAT THIS IS NOT. A source-text sweep is a tripwire, not a sandbox. It is
 * defeated by `globalThis["fe" + "tch"]`, it cannot see inside `node_modules`,
 * and it says nothing about what the two permitted modules actually send. The
 * real structural control is a Content-Security-Policy `connect-src 'self'`,
 * which belongs to AB-903 and which ADR-0009 already noted must carry the
 * pre-paint script's hash. This file is the cheap half, and it is honest about
 * being the cheap half.
 */

import { describe, expect, it } from "vitest";

/**
 * Every non-test source file in the reader, read as text.
 *
 * `import.meta.glob` rather than `node:fs`: this repository installs no
 * ambient Node types, and `styles.test.ts`, `index-html.test.ts` and
 * `palette.test.ts` all read files this way for the same reason.
 */
const SOURCES = import.meta.glob("./**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * The complete list of modules permitted to send bytes, and why each may.
 *
 * An exact list, not a floor: a module removed from the product must be
 * removed from here too, so this cannot rot into a permanent permission for a
 * file that no longer exists.
 */
const MAY_SEND = [
  // Fetches the published edition and the pointer that names it. The one
  // outbound path the product has ever had; ADR-0006 argues its boundary.
  "edition/edition-repository.ts",
  // Serves and revalidates those same two paths offline. ADR-0010.
  "service-worker/sw.ts",
] as const;

/** Every way a browser can be made to send bytes somewhere. */
const TRANSPORTS = [
  /\bfetch\s*\(/,
  /sendBeacon/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /new\s+Image\b/,
  /\bimport\s*\(/,
] as const;

/**
 * Ways to make `console` write somewhere other than the console.
 *
 * ADR-0003 named this exact route and said no repository check would catch it:
 * "an application that wraps `console.error` to also call `fetch` or
 * `sendBeacon` exfiltrates every line this package writes." Two regexes make
 * that sentence false.
 */
const CONSOLE_PATCHES = [
  /\bconsole\.\w+\s*=/,
  /globalThis\.console\s*=/,
  /Object\.defineProperty\s*\(\s*console\b/,
] as const;

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** `./reader/StoryCard.tsx` reads as `reader/StoryCard.tsx`. */
function shortPath(key: string): string {
  return key.replace(/^\.\//, "");
}

const PRODUCT_SOURCES = Object.entries(SOURCES)
  .filter(([key]) => !/\.test\.tsx?$/.test(key))
  .map(([key, source]) => ({
    path: shortPath(key),
    body: withoutComments(source),
  }));

describe("what can leave this device", () => {
  it("read the application it is making a claim about", () => {
    /*
      The positive half. Every assertion below is an absence, and an empty glob
      — a moved directory, a `?raw` query that silently resolved to nothing —
      satisfies all of them at once. Anchored on both a count and a file that
      must be present, so a glob that half-resolved fails too.
    */
    expect(PRODUCT_SOURCES.length).toBeGreaterThan(30);
    expect(PRODUCT_SOURCES.map((file) => file.path)).toContain(
      "edition/edition-repository.ts",
    );
    for (const permitted of MAY_SEND) {
      expect(PRODUCT_SOURCES.map((file) => file.path)).toContain(permitted);
    }
  });

  it("is exactly the two modules that are allowed to", () => {
    const senders = PRODUCT_SOURCES.filter((file) =>
      TRANSPORTS.some((transport) => transport.test(file.body)),
    ).map((file) => file.path);

    expect(senders.sort()).toEqual([...MAY_SEND].sort());
  });

  it("is not widened by patching the console", () => {
    const patched = PRODUCT_SOURCES.filter((file) =>
      CONSOLE_PATCHES.some((patch) => patch.test(file.body)),
    ).map((file) => file.path);

    expect(patched).toEqual([]);
  });
});
