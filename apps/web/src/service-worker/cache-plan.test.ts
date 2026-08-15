/**
 * The four decisions the service worker makes, asserted as values.
 *
 * This is the whole of the worker's judgement. `sw.ts` opens caches and returns
 * responses and decides nothing, so a defect in offline behaviour is a defect
 * in one of these functions -- and each test below is named for the change that
 * would introduce one.
 *
 * They are values rather than fakes on purpose. jsdom has no service worker, no
 * Cache Storage and no fetch interception, so a test built on a mock of those
 * APIs would be asserting the mock; ADR-0010 rejected several packages that
 * offer exactly that. What a browser has to verify -- that an edition opens in
 * airplane mode -- is verified in a browser, and what is decidable from values
 * is decided here.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CACHED_EDITIONS,
  mayCacheResponse,
  planCacheCleanup,
  planEditionEviction,
  planRequest,
  type RequestFacts,
  SHELL_KEY,
} from "./cache-plan";

const ORIGIN = "https://aajbas.example";

/** A same-origin GET for a subresource, which each test varies from. */
function request(facts: Partial<RequestFacts>): RequestFacts {
  return {
    method: "GET",
    mode: "cors",
    destination: "empty",
    path: "/",
    origin: ORIGIN,
    requestOrigin: ORIGIN,
    ...facts,
  };
}

/** The same request as a browser makes it when loading a page into a window. */
function navigation(path: string): RequestFacts {
  return request({ path, mode: "navigate", destination: "document" });
}

describe("what the worker does with a request", () => {
  it("answers a navigation from the shell, under one key for every address", () => {
    /*
      The positive case the offline criterion rests on: `/edition/2026-07-21`
      was never fetched as a document, because `_redirects` rewrites it to
      `index.html` at the host. Only the shell is cached, so only the shell can
      answer -- and answering it under its own path would miss.
    */
    expect(planRequest(navigation("/"))).toEqual({
      kind: "navigation",
      key: SHELL_KEY,
    });
    expect(planRequest(navigation("/edition/2026-07-21"))).toEqual({
      kind: "navigation",
      key: SHELL_KEY,
    });
  });

  it("classifies a NAVIGATION to /content/latest.json as content, not as the shell", () => {
    /*
      THE TRAP. `index.html` carries a real link to this path inside its
      `noscript` block, so a reader can click it and the browser sends a request
      with `mode: "navigate"`. A worker that tested the mode before the path
      would hand back the HTML shell -- the exact catch-all failure
      `public/_redirects` carries a nine-line comment forbidding, rebuilt inside
      the worker where no review of that file would ever find it.

      Reordering the two tests in `planRequest` is a one-line change that looks
      tidier and breaks only this.
    */
    expect(planRequest(navigation("/content/latest.json"))).toEqual({
      kind: "content",
    });
    expect(
      planRequest(navigation("/content/editions/2026-07-21.json")),
    ).toEqual({ kind: "content" });
  });

  it("takes published content from the network first, whatever the destination", () => {
    expect(planRequest(request({ path: "/content/latest.json" }))).toEqual({
      kind: "content",
    });
    expect(
      planRequest(request({ path: "/content/editions/2026-07-21.json" })),
    ).toEqual({ kind: "content" });
  });

  it("takes a fingerprinted asset from the cache first, because the name is the version", () => {
    expect(
      planRequest(
        request({ path: "/assets/index-DNsZQG8d.js", destination: "script" }),
      ),
    ).toEqual({ kind: "shell" });
  });

  it("never answers for its own script, which is what keeps the worker replaceable", () => {
    /*
      A worker that could serve `/sw.js` from a cache would be served its own
      bytes by the browser's update check, and could never be replaced on any
      device that had it. The navigation form is checked too: the path test runs
      first, so even a reader typing the URL in gets the network.
    */
    expect(planRequest(request({ path: "/sw.js" }))).toEqual({
      kind: "ignore",
    });
    expect(planRequest(navigation("/sw.js"))).toEqual({ kind: "ignore" });
  });

  it("never intercepts a cross-origin request, so publisher traffic stays unseen", () => {
    // Every source link in an edition leaves this origin. A worker in that path
    // would be a record of what a reader followed (section 23), and declining
    // to intercept is invisible from the page, so nothing else would notice.
    expect(
      planRequest(
        request({
          path: "/article",
          requestOrigin: "https://publisher.example",
          mode: "navigate",
          destination: "document",
        }),
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("never intercepts a request that is not a GET", () => {
    expect(
      planRequest(request({ method: "POST", path: "/content/latest.json" })),
    ).toEqual({ kind: "ignore" });
  });

  it("leaves same-origin requests it has no rule for to the browser", () => {
    // The manifest is precached but not intercepted: being in a cache is not a
    // reason to answer for a request, and the browser handles it correctly.
    expect(planRequest(request({ path: "/manifest.webmanifest" }))).toEqual({
      kind: "ignore",
    });
  });
});

describe("what the worker will write down", () => {
  it("refuses a 200 that carries HTML, which is how this host reports a missing file", () => {
    /*
      Cloudflare Pages answers an unmatched path with 200 and `text/html`. A
      worker without this test would overwrite a good cached edition with an
      HTML document the moment an edition was withdrawn or renamed, and the
      reader would go offline the next day to a permanent failure screen with
      nothing having reported an error. Acceptance criterion 2, lost silently.
    */
    expect(
      mayCacheResponse({
        ok: true,
        status: 200,
        contentType: "text/html; charset=utf-8",
        kind: "content",
      }),
    ).toBe(false);
  });

  it("keeps a JSON response, including one that declares a charset", () => {
    for (const contentType of [
      "application/json",
      "application/json; charset=utf-8",
      "application/manifest+json",
    ]) {
      expect([
        contentType,
        mayCacheResponse({
          ok: true,
          status: 200,
          contentType,
          kind: "content",
        }),
      ]).toStrictEqual([contentType, true]);
    }
  });

  it("refuses a response the origin did not answer successfully", () => {
    // A 500 or a 404 says nothing about the content, and writing either down
    // would replace a good saved edition with the outage that interrupted it.
    for (const status of [404, 410, 500, 503]) {
      expect([
        status,
        mayCacheResponse({
          ok: false,
          status,
          contentType: "application/json",
          kind: "content",
        }),
      ]).toStrictEqual([status, false]);
    }
  });

  it("refuses a partial response, which is half a document", () => {
    expect(
      mayCacheResponse({
        ok: true,
        status: 206,
        contentType: "application/json",
        kind: "content",
      }),
    ).toBe(false);
  });

  it("refuses to write anything but content, so the shell stays what the build listed", () => {
    // The shell is written once, during install, from the list the build
    // computed. A runtime write into it would put a file there that no build id
    // accounts for, and that no cleanup would ever be able to reason about.
    for (const kind of ["shell", "navigation", "ignore"]) {
      expect([
        kind,
        mayCacheResponse({
          ok: true,
          status: 200,
          contentType: "application/json",
          kind,
        }),
      ]).toStrictEqual([kind, false]);
    }
  });
});

describe("what a new build deletes", () => {
  it("deletes the previous build's shell and keeps this one's", () => {
    expect(
      planCacheCleanup(
        [
          "aaj-bas-shell-aaaaaaaa",
          "aaj-bas-shell-bbbbbbbb",
          "aaj-bas-content-v1",
        ],
        ["aaj-bas-shell-bbbbbbbb", "aaj-bas-content-v1"],
      ),
    ).toEqual(["aaj-bas-shell-aaaaaaaa"]);
  });

  it("keeps the content cache, so a deploy never deletes a reader's editions", () => {
    /*
      Acceptance criterion 2 read as a deploy rather than as a failure: the
      content cache is not named for a build, so every activation must find it
      in `keep`. A cleanup that swept everything but the current shell would
      delete every saved edition on every deploy -- and would look like correct
      housekeeping in review.
    */
    const removed = planCacheCleanup(
      ["aaj-bas-content-v1", "aaj-bas-shell-bbbbbbbb"],
      ["aaj-bas-shell-bbbbbbbb", "aaj-bas-content-v1"],
    );

    expect(removed).toEqual([]);
  });

  it("never deletes a cache this product did not create", () => {
    // An origin can hold caches from anything else ever served from it. The
    // prefix test is what keeps a cleanup pass from deleting someone else's
    // data, and it is enforced on the names rather than trusted of the caller.
    expect(
      planCacheCleanup(
        ["workbox-precache-v2", "some-other-app", "aaj-bas-shell-aaaaaaaa"],
        [],
      ),
    ).toEqual(["aaj-bas-shell-aaaaaaaa"]);
  });
});

describe("which saved editions a new one displaces", () => {
  const paths = (...dates: readonly string[]) =>
    dates.map((date) => `/content/editions/${date}.json`);

  it("keeps the edition just written even when it is the oldest one held", () => {
    /*
      A reader opening an archive edition writes the oldest date in the cache.
      Eviction by date alone would delete it immediately -- so the one edition
      they are reading right now is the one that never survives, and the failure
      only appears offline.
    */
    const evicted = planEditionEviction(
      paths("2026-07-21", "2026-07-20", "2026-01-01"),
      "/content/editions/2026-01-01.json",
      2,
    );

    expect(evicted).toEqual(paths("2026-07-20"));
  });

  it("drops the oldest first, so yesterday survives an archive visit", () => {
    const evicted = planEditionEviction(
      paths("2026-07-21", "2026-07-20", "2026-07-19"),
      "/content/editions/2026-07-21.json",
      2,
    );

    expect(evicted).toEqual(paths("2026-07-19"));
  });

  it("evicts nothing while there is room", () => {
    expect(
      planEditionEviction(
        paths("2026-07-21", "2026-07-20"),
        "/content/editions/2026-07-21.json",
        MAX_CACHED_EDITIONS,
      ),
    ).toEqual([]);
  });

  it("never evicts the pointer, or anything else it has no rule for", () => {
    // `/content/latest.json` is the first request every load makes and is one
    // small document. A function that evicted paths it does not recognise would
    // be the worker discarding content nobody planned to discard.
    const evicted = planEditionEviction(
      ["/content/latest.json", ...paths("2026-07-21", "2026-07-20")],
      "/content/latest.json",
      1,
    );

    expect(evicted).toEqual(paths("2026-07-20"));
  });

  it("keeps the entry just written even when there is no room at all", () => {
    // The degenerate case, asserted because the arithmetic could go negative
    // and take a slice of the whole list with it.
    expect(
      planEditionEviction(
        paths("2026-07-21"),
        "/content/editions/2026-07-21.json",
        0,
      ),
    ).toEqual([]);
  });
});
