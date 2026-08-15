/**
 * What a build installs for a reader who loses the network.
 *
 * Two claims, and both are about what the plan LEAVES OUT rather than what it
 * finds. Published content must not travel with the shell, because a shell
 * cache is replaced wholesale on every deploy and an edition is rewritten in
 * place when it is corrected; and the id naming the shell must move when an
 * asset moves and stay put when only content did, because a service worker is
 * replaced by its script's bytes changing and by nothing else.
 *
 * Asserted here as values, so neither needs a build to observe. The script that
 * writes `sw.js` makes no decision either one depends on.
 */
import { describe, expect, it } from "vitest";
import { buildIdFor, planPrecache } from "./precache";

/** A realistic `dist/` listing: one entry chunk, one stylesheet, the shell. */
const BUILT = [
  "_redirects",
  "assets/index-C0-C5HDs.css",
  "assets/index-DNsZQG8d.js",
  "content/editions/2026-07-21.json",
  "content/latest.json",
  "index.html",
  "manifest.webmanifest",
] as const;

describe("what a build installs", () => {
  it("installs the shell a reader needs to open the application at all", () => {
    // The positive claim, and it is what makes every exclusion below an
    // argument about this plan rather than about an empty list.
    const plan = planPrecache([...BUILT]);

    expect(plan.entries).toEqual([
      "/assets/index-C0-C5HDs.css",
      "/assets/index-DNsZQG8d.js",
      "/index.html",
      "/manifest.webmanifest",
    ]);
    expect(plan.refused).toEqual([]);
  });

  it("never installs published content, which corrections rewrite in place", () => {
    /*
      ADR-0006: a correction rewrites a dated file and bumps `editionVersion`.
      An edition installed with the shell would sit in a cache keyed to a build
      and be served to a returning reader after the correction deployed --
      section 46, reached through a caching choice rather than through an edit.
      Content is cached at runtime instead, network-first, under a name no
      deploy replaces.
    */
    const plan = planPrecache([...BUILT]);

    expect(plan.entries).not.toContain("/content/latest.json");
    expect(plan.entries).not.toContain("/content/editions/2026-07-21.json");
  });

  it("never installs the host's routing rules or the worker's own script", () => {
    /*
      `_redirects` is read by Cloudflare Pages and served to nobody, so a copy
      in a cache is one deploy behind the host's. `sw.js` is the sharper one: a
      worker able to answer for its own script can never be replaced, because
      the update check would be served the very bytes it is trying to replace.
    */
    const plan = planPrecache([
      "_redirects",
      "_headers",
      "sw.js",
      "index.html",
    ]);

    expect(plan.entries).toEqual(["/index.html"]);
  });

  it("refuses a name it cannot turn into a path, rather than dropping it", () => {
    // A name that escapes `dist/` would make the worker request something the
    // build never produced. Reported, because a file silently left out of the
    // shell is a file the reader cannot load offline.
    const plan = planPrecache(["index.html", "../secrets.json", "/etc/passwd"]);

    expect(plan.entries).toEqual(["/index.html"]);
    expect(plan.refused).toEqual(["../secrets.json", "/etc/passwd"]);
  });

  it("plans the same entries whatever order the directory walk produced", () => {
    // `Glob.scan` promises no order, so an unsorted plan would give two builds
    // of one output two build ids and replace every reader's worker for
    // nothing.
    const forwards = planPrecache([...BUILT]);
    const backwards = planPrecache([...BUILT].reverse());

    expect(backwards.entries).toEqual(forwards.entries);
    expect(backwards.buildId).toEqual(forwards.buildId);
  });
});

describe("the build id", () => {
  it("is eight hex characters, so it can name a cache", () => {
    expect(buildIdFor(["/index.html"])).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is the same for the same list, so publishing an edition updates no worker", () => {
    /*
      This is the property the whole design turns on. A deploy that changed
      only `content/` produces the same entry list, so the same id, so
      byte-identical `sw.js`, so no service worker update -- and the daily
      edition does not churn every reader's installed worker.
    */
    const entries = ["/assets/index-DNsZQG8d.js", "/index.html"];

    expect(buildIdFor(entries)).toBe(buildIdFor([...entries]));
    expect(buildIdFor(entries)).toBe(buildIdFor([...entries].reverse()));
  });

  it("differs when an asset does, which is what makes the browser update", () => {
    // The other half: Vite's content hash moves when the bundle changes, the
    // id moves with it, `sw.js` differs, and the browser installs the new
    // worker. An id that missed this would strand readers on an old shell.
    const before = buildIdFor(["/assets/index-AAAAAAAA.js", "/index.html"]);
    const after = buildIdFor(["/assets/index-BBBBBBBB.js", "/index.html"]);

    expect(after).not.toBe(before);
  });

  it("distinguishes lists that concatenate the same", () => {
    // Joined with a separator rather than concatenated: without one, adding a
    // character to one name and removing it from the next would hash alike.
    expect(buildIdFor(["/ab", "/c"])).not.toBe(buildIdFor(["/a", "/bc"]));
  });

  it("keeps every bit of the hash, including the low ones", () => {
    /*
      The multiply is written as shifts because `hash * 16777619` exceeds the
      53 bits a double holds exactly, and the bits it loses are the low ones --
      the ones that carry the most recent character. A regression to the
      arithmetic form would still return eight hex characters and still differ
      for most inputs, so this checks the case it would get wrong: two lists
      differing only in their last character.
    */
    expect(buildIdFor(["/index-a.js"])).not.toBe(buildIdFor(["/index-b.js"]));
  });
});
