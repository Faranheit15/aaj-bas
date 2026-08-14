import type { Edition, EditionIndex } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "../routing/route";
import { editorialDay } from "./editorial-day";
import { useEdition } from "./use-edition";

const INDEX_URL = "/content/latest.json";

const DAY = 24 * 60 * 60 * 1000;
const today = editorialDay(new Date());
const yesterday = editorialDay(new Date(Date.now() - DAY));

function editionUrl(date: string): string {
  return `/content/editions/${date}.json`;
}

function indexNaming(latest: string | null, ...older: string[]): EditionIndex {
  return {
    schemaVersion: 1,
    contentSet: "published",
    latest,
    editions: latest === null ? [] : [latest, ...older],
  };
}

function editionDated(date: string): Edition {
  return { ...validEdition(), date };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Answers by URL, so a StrictMode double-invoke cannot exhaust a queue. */
function stubFetch(handler: (url: string) => Response) {
  const fetchMock = vi.fn((url: string) => Promise.resolve(handler(url)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function urlsRequested(fetchMock: ReturnType<typeof stubFetch>): string[] {
  return fetchMock.mock.calls.map(([url]) => url);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the latest route", () => {
  it("follows the pointer to the edition it names", async () => {
    const fetchMock = stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today, yesterday))
        : jsonResponse(editionDated(today)),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }));

    expect(result.current.state).toEqual({ status: "loading" });

    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    // Two requests, in order: the pointer, then the edition it names. The
    // pointer is deliberately not a copy of the edition.
    expect(urlsRequested(fetchMock)).toEqual([INDEX_URL, editionUrl(today)]);
  });

  it("reports today's edition as current and names the content set", async () => {
    stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today))
        : jsonResponse(editionDated(today)),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    const state = result.current.state;
    if (state.status !== "ready") throw new Error("expected a ready state");
    expect(state.freshness).toBe("current");
    expect(state.contentSet).toBe("published");
    expect(state.editorialToday).toBe(today);
    expect(state.edition.date).toBe(today);
  });

  it("reports a pointer that has not moved on as stale", async () => {
    // Section 26: yesterday's edition is served, and must not be presented as
    // if it were known to be today's.
    stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(yesterday))
        : jsonResponse(editionDated(yesterday)),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    const state = result.current.state;
    if (state.status !== "ready") throw new Error("expected a ready state");
    expect(state.freshness).toBe("stale");
  });

  it("says nothing is published rather than failing", async () => {
    const fetchMock = stubFetch(() => jsonResponse(indexNaming(null)));

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("none"));

    expect(result.current.state).toEqual({
      status: "none",
      contentSet: "published",
    });
    expect(urlsRequested(fetchMock)).toEqual([INDEX_URL]);
  });
});

describe("a dated route", () => {
  const requested = "2026-07-14";

  it("requests that edition and calls it archived", async () => {
    const fetchMock = stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today, requested))
        : jsonResponse(editionDated(requested)),
    );

    const route: Route = { kind: "edition", date: requested };
    const { result } = renderHook(() => useEdition(route));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(urlsRequested(fetchMock)).toEqual([
      INDEX_URL,
      editionUrl(requested),
    ]);

    const state = result.current.state;
    if (state.status !== "ready") throw new Error("expected a ready state");
    // Deliberately chosen from the archive, so never labelled stale.
    expect(state.freshness).toBe("archived");
  });

  it("refuses a date that is not a real day without asking the network", async () => {
    const fetchMock = stubFetch(() => jsonResponse(indexNaming(today)));

    const route: Route = { kind: "edition", date: "2026-02-30" };
    const { result } = renderHook(() => useEdition(route));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "unavailable",
      priorDate: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed date without asking the network", async () => {
    const fetchMock = stubFetch(() => jsonResponse(indexNaming(today)));

    const route: Route = { kind: "edition", date: "yesterday" };
    const { result } = renderHook(() => useEdition(route));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("an address the product does not serve", () => {
  it("fails as unavailable without asking the network", async () => {
    const fetchMock = stubFetch(() => jsonResponse(indexNaming(today)));

    const route: Route = { kind: "unknown", path: "/archive" };
    const { result } = renderHook(() => useEdition(route));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "unavailable",
      priorDate: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("failures a reader can act on", () => {
  it("carries the reason a request never completed", async () => {
    stubFetch((url) => {
      if (url === INDEX_URL) return jsonResponse(indexNaming(today, yesterday));
      throw new TypeError("Failed to fetch");
    });

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "network",
      // The latest edition is the one that failed, so the prior one is what is
      // left to offer.
      priorDate: yesterday,
    });
  });

  it("offers the newest edition when a dated one is missing", async () => {
    stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today, yesterday))
        : new Response("<!doctype html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
    );

    const route: Route = { kind: "edition", date: "2020-01-01" };
    const { result } = renderHook(() => useEdition(route));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "unavailable",
      priorDate: today,
    });
  });

  it("carries a failing host as its own reason, not as nothing published", async () => {
    // The whole chain, not just the repository: a 502 on the pointer must
    // reach the component as `unreachable`, because the state it renders is
    // what tells a reader whether anything was published today.
    stubFetch(
      () =>
        new Response("Bad gateway", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "unreachable",
      priorDate: null,
    });
  });

  it("offers nothing when the pointer itself could not be read", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    expect(result.current.state).toEqual({
      status: "failed",
      reason: "network",
      priorDate: null,
    });
  });

  it("refuses an edition that fails validation rather than rendering part of it", async () => {
    stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today))
        : jsonResponse({ ...editionDated(today), schemaVersion: 2 }),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    const state = result.current.state;
    if (state.status !== "failed") throw new Error("expected a failed state");
    expect(state.reason).toBe("invalid");
  });
});

describe("retry", () => {
  it("asks again and recovers", async () => {
    let failing = true;
    const fetchMock = stubFetch((url) => {
      if (url === INDEX_URL) return jsonResponse(indexNaming(today));
      if (failing) throw new TypeError("Failed to fetch");
      return jsonResponse(editionDated(today));
    });

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    const before = fetchMock.mock.calls.length;
    failing = false;
    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("returns to loading while the second request is in flight", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const { result } = renderHook(() => useEdition({ kind: "latest" }));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    act(() => {
      result.current.retry();
    });

    expect(result.current.state).toEqual({ status: "loading" });
  });
});

describe("requests nobody is waiting for", () => {
  it("resolves once under StrictMode's double invocation", async () => {
    const fetchMock = stubFetch((url) =>
      url === INDEX_URL
        ? jsonResponse(indexNaming(today))
        : jsonResponse(editionDated(today)),
    );

    const { result } = renderHook(() => useEdition({ kind: "latest" }), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(urlsRequested(fetchMock)).toContain(editionUrl(today));
  });

  it("does not settle after the reader has gone", async () => {
    // Held on an object rather than in a `let`, because a closure assignment
    // is invisible to narrowing and the binding would be read back as `never`.
    const pending: { send: ((response: Response) => void) | null } = {
      send: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === INDEX_URL) {
          return Promise.resolve(jsonResponse(indexNaming(today)));
        }
        return new Promise<Response>((resolve) => {
          pending.send = resolve;
        });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useEdition({ kind: "latest" }),
    );
    await waitFor(() => expect(pending.send).not.toBeNull());

    unmount();
    pending.send?.(jsonResponse(editionDated(today)));
    await Promise.resolve();

    expect(result.current.state).toEqual({ status: "loading" });
  });
});
