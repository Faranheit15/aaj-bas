import { describe, expect, it } from "vitest";
import { editionHref, LATEST_HREF, parseRoute } from "./route";

describe("parseRoute", () => {
  it("reads the root as the latest edition", () => {
    expect(parseRoute("/")).toEqual({ kind: "latest" });
    expect(parseRoute("")).toEqual({ kind: "latest" });
  });

  it("reads a dated path as that edition", () => {
    expect(parseRoute("/edition/2026-07-21")).toEqual({
      kind: "edition",
      date: "2026-07-21",
    });
  });

  it("treats one trailing slash as the same address", () => {
    expect(parseRoute("/edition/2026-07-21/")).toEqual({
      kind: "edition",
      date: "2026-07-21",
    });
  });

  it("accepts a well-shaped date that is not a real day", () => {
    // The router checks shape; the calendar is editionDateSchema's job, and
    // duplicating it here would give the product two answers to one question.
    expect(parseRoute("/edition/2026-02-30")).toEqual({
      kind: "edition",
      date: "2026-02-30",
    });
  });

  it("rejects date shapes it does not serve", () => {
    expect(parseRoute("/edition/2026-7-21").kind).toBe("unknown");
    expect(parseRoute("/edition/26-07-21").kind).toBe("unknown");
    expect(parseRoute("/edition/2026-07-21T00:00").kind).toBe("unknown");
    expect(parseRoute("/edition/").kind).toBe("unknown");
    expect(parseRoute("/edition").kind).toBe("unknown");
  });

  it("reports an unserved address rather than resolving it to something else", () => {
    expect(parseRoute("/archive/2026-07-21")).toEqual({
      kind: "unknown",
      path: "/archive/2026-07-21",
    });
  });

  it("does not follow a nested path under an edition", () => {
    expect(parseRoute("/edition/2026-07-21/story-1").kind).toBe("unknown");
  });
});

describe("editionHref", () => {
  it("builds the address parseRoute reads back", () => {
    const href = editionHref("2026-07-21");

    expect(href).toBe("/edition/2026-07-21");
    expect(parseRoute(href)).toEqual({ kind: "edition", date: "2026-07-21" });
  });

  it("round-trips the latest address", () => {
    expect(parseRoute(LATEST_HREF)).toEqual({ kind: "latest" });
  });
});
