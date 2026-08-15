/**
 * The four files that touch a reader's interests, read as source text.
 *
 * AB-204's acceptance criterion is that preferences never leave the device, and
 * every other test in this suite asserts what the code DOES: what is stored,
 * what is read back, what is rendered. None of them can assert what is also
 * happening — a `sendBeacon` beside the write, a `fetch` whose body is the
 * selection, an `Image` whose `src` carries it — because the store would still
 * return true, the picker would still close, and the edition would still
 * compose. A leak is not a wrong answer. It is a right answer with a second
 * effect, so the second effect is what is asserted here.
 *
 * ADR-0008 calls the absence of a network path one of the structural
 * guarantees of the slice and calls those guarantees checkable rather than
 * asserted. This is the check. Sections 17 and 23 are the binding rules: v1
 * user state stays on the device, and nothing this product collects is
 * transmitted anywhere.
 *
 * Every form is listed rather than only `fetch`, because they are not variants
 * of one another — a beacon survives the page unloading, an image `src` needs
 * no response at all and reads as decoration, and `import()` reaches the
 * network through a construct that looks like an import. Each is a plausible
 * thing for a later slice to add in good faith, for analytics that would be
 * "aggregate anyway", which PRD section 15 contemplates and section 17 forbids
 * for this field.
 *
 * The one dependency here with any I/O is the logger, and ADR-0003 confines it
 * to the console; `packages/logger` carries its own argument for that.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install. `styles.test.ts` and
 * `index-html.test.ts` read their files the same way, and it resolves relative
 * to this file, so the test does not depend on a working directory.
 */
import { describe, expect, it } from "vitest";
import boosts from "./reader/InterestBoosts.tsx?raw";
import interests from "./reader/interests.ts?raw";
import store from "./local-state/local-state-store.ts?raw";
import state from "./local-state/local-state.ts?raw";

/**
 * Each file with its comments stripped, paired with something it must still
 * contain.
 *
 * The comments are where this rule is argued, both here and in the files
 * themselves — ADR-0008's sentence about a beacon is quoted in more than one
 * of them — so asserting against the raw text would fail on the prose and say
 * nothing about the code. `styles.test.ts` strips its stylesheet for the same
 * reason.
 *
 * The second half of each pair is load-bearing: every assertion below is an
 * absence, and an empty string — a moved file, a `?raw` import that silently
 * resolved to nothing — satisfies all of them at once.
 */
const FILES = [
  {
    path: "local-state/local-state-store.ts",
    source: store,
    contains: "export function rememberInterests",
  },
  {
    path: "local-state/local-state.ts",
    source: state,
    contains: "export function withInterests",
  },
  {
    path: "reader/interests.ts",
    source: interests,
    contains: "export function useInterests",
  },
  {
    path: "reader/InterestBoosts.tsx",
    source: boosts,
    contains: "export function InterestBoosts",
  },
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

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("what the reader chose", () => {
  it("is written by the four files these assertions are about", () => {
    for (const { path, source, contains } of FILES) {
      expect(withoutComments(source), path).toContain(contains);
    }
  });

  it("has nowhere to go: no fetch, beacon, socket, image, or dynamic import", () => {
    const offences = FILES.flatMap(({ path, source }) =>
      TRANSPORTS.filter((transport) =>
        transport.test(withoutComments(source)),
      ).map((transport) => `${path} matches ${transport.source}`),
    );

    expect(offences).toEqual([]);
  });
});
