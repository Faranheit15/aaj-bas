import type { EditionIndex } from "@aaj-bas/schemas";
import { invalidEditions, validEdition } from "@aaj-bas/test-fixtures";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_SOURCE_HEADER,
  type EditionFailureReason,
  editionRepository,
} from "./edition-repository";

const INDEX_URL = "/content/latest.json";

/** An RFC 7231 date, as a host sends it, and its ISO equivalent. */
const SENT_AT = "Tue, 21 Jul 2026 01:42:00 GMT";
const SENT_AT_ISO = "2026-07-21T01:42:00.000Z";
const EDITION_URL = "/content/editions/2026-08-13.json";

const index: EditionIndex = {
  schemaVersion: 1,
  contentSet: "published",
  latest: "2026-08-13",
  editions: ["2026-08-13", "2026-08-12"],
};

function jsonResponse(
  body: unknown,
  contentType = "application/json",
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function textResponse(
  body: string,
  status = 200,
  contentType = "text/html; charset=utf-8",
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

/**
 * A response as the service worker hands one back out of its cache.
 *
 * The tag and the `date` header are what the page has to read it from: the
 * worker sets the first, and the second is the origin's own, preserved by the
 * Cache API since the day the copy was stored. Nothing about this response
 * differs from a live one in any way a page could otherwise detect.
 */
function cachedResponse(
  body: unknown,
  date: string | null = SENT_AT,
): Response {
  const headers = new Headers({
    "content-type": "application/json",
    [CACHE_SOURCE_HEADER]: "1",
  });
  if (date !== null) {
    headers.set("date", date);
  }

  return new Response(JSON.stringify(body), { status: 200, headers });
}

function stubFetch(
  ...responses: (Response | Error)[]
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) {
      throw new Error("fetch was called more times than the test staged");
    }
    // Duck-typed rather than `instanceof Error`: a real abort rejects with a
    // DOMException, which does not inherit from Error in every runtime.
    if (!isResponseLike(next)) {
      throw next;
    }
    return next;
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function isResponseLike(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

beforeEach(() => {
  // The repository logs refused content at error level. Silenced so that the
  // many deliberate failures below do not read as a broken suite.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the request it makes", () => {
  it("asks for the pointer at the published path", async () => {
    const fetchMock = stubFetch(jsonResponse(index));

    await editionRepository.getIndex(signal());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      INDEX_URL,
      expect.objectContaining({
        cache: "no-cache",
        headers: { accept: "application/json" },
      }),
    );
  });

  it("asks for a dated edition at the published path", async () => {
    const fetchMock = stubFetch(jsonResponse(validEdition()));

    await editionRepository.getByDate("2026-08-13", signal());

    expect(fetchMock).toHaveBeenCalledWith(EDITION_URL, expect.anything());
  });

  it("passes the caller's abort signal through", async () => {
    const fetchMock = stubFetch(jsonResponse(index));
    const controller = new AbortController();

    await editionRepository.getIndex(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      INDEX_URL,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe("content that loads", () => {
  it("returns a validated index", async () => {
    stubFetch(jsonResponse(index));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({
      ok: true,
      value: index,
      source: "network",
      copyDate: null,
    });
  });

  it("returns an index that points at nothing", async () => {
    const empty: EditionIndex = {
      schemaVersion: 1,
      contentSet: "sample",
      latest: null,
      editions: [],
    };
    stubFetch(jsonResponse(empty));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({
      ok: true,
      value: empty,
      source: "network",
      copyDate: null,
    });
  });

  it("returns a validated edition", async () => {
    const edition = validEdition();
    stubFetch(jsonResponse(edition));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({
      ok: true,
      value: edition,
      source: "network",
      copyDate: null,
    });
  });

  it("accepts a JSON content type carrying a charset", async () => {
    stubFetch(jsonResponse(index, "application/json; charset=utf-8"));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({
      ok: true,
      value: index,
      source: "network",
      copyDate: null,
    });
  });

  it("accepts a JSON content type whatever its case", async () => {
    // RFC 9110 makes the media type case-insensitive, and hosts do send
    // `Application/JSON`. Reading it as not-JSON would report a perfectly good
    // edition as missing.
    stubFetch(jsonResponse(index, "Application/JSON"));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({
      ok: true,
      value: index,
      source: "network",
      copyDate: null,
    });
  });
});

describe("where the bytes came from", () => {
  it("reports a response the worker tagged as coming from this device", async () => {
    stubFetch(cachedResponse(validEdition()));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toMatchObject({ ok: true, source: "cache" });
  });

  it("reports an ordinary response as network, whatever else it carries", async () => {
    // Including a `date` header, which every response has. Reading the header
    // as evidence of a cache would report every live edition as saved.
    stubFetch(
      new Response(JSON.stringify(validEdition()), {
        status: 200,
        headers: { "content-type": "application/json", date: SENT_AT },
      }),
    );

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toMatchObject({ ok: true, source: "network" });
  });

  it("states when the copy was sent, converted from the header's own format", async () => {
    // PRD section 7.2 asks a returning reader to be told when the cached copy
    // was downloaded. This is where that fact comes from, and it is read off
    // the response rather than stored: nothing new is written to the device,
    // and the instant is deleted with the copy it describes.
    stubFetch(cachedResponse(validEdition()));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toMatchObject({ ok: true, copyDate: SENT_AT_ISO });
  });

  it.each([
    ["carries no date header", null],
    ["carries a date header nothing can parse", "yesterday afternoon"],
  ])("says nothing about when a copy arrived that %s", async (_case, date) => {
    /*
      THE PRIVACY TEST. `copyDate` must be null, and specifically must not be
      the current time.

      A `Date.now()` fallback is the obvious repair — it keeps the sentence on
      the page and looks harmless — and it does two unacceptable things at
      once. It states a download time that is false, under a copy that may be a
      week old. And it mints a timestamp of READING on the device, which is the
      behavioural data ADR-0007 declined to store when it rejected LRU
      eviction. Asserted against the clock as well as against null, because
      `toBeNull` alone would pass if the field were later renamed and the
      fabrication moved one layer up.
    */
    const before = new Date().toISOString();
    stubFetch(cachedResponse(validEdition(), date));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toMatchObject({ ok: true, source: "cache", copyDate: null });
    if (result.ok) {
      expect(result.copyDate).not.toBe(before);
    }
  });

  it("still refuses a cached response that is not an edition", async () => {
    /*
      A cache is not a licence. The single-page shell can be cached exactly as
      an edition can, and the day a worker stores the wrong response for
      `/content/editions/...`, this is what stops the reader being told their
      saved copy is corrupt — or worse, being shown it. Every check the network
      path applies applies here, in the same order.
    */
    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      [CACHE_SOURCE_HEADER]: "1",
      date: SENT_AT,
    });
    stubFetch(new Response("<!doctype html>", { status: 200, headers }));

    const result = await editionRepository.getByDate("2026-01-01", signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a cached document that fails validation", async () => {
    stubFetch(cachedResponse({ ...validEdition(), schemaVersion: 2 }));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("the five failures it distinguishes", () => {
  it("reports a request that never completed as network", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("reports an aborted request as network", async () => {
    stubFetch(new DOMException("The operation was aborted.", "AbortError"));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("reports a body that never arrived as network", async () => {
    const truncated = {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: () => Promise.reject(new TypeError("network error")),
    } as unknown as Response;
    stubFetch(truncated);

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("reports a 404 as unavailable", async () => {
    stubFetch(textResponse("Not found", 404, "text/plain"));

    const result = await editionRepository.getByDate("2026-01-01", signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports the single-page HTML fallback as unavailable, not malformed", async () => {
    // Cloudflare Pages answers a missing file with the application shell and
    // status 200. Read as a body, that is not JSON; read as a fact, it means
    // there is no edition for this date. Telling a reader their archive
    // request is corrupt would be a false statement about published content.
    stubFetch(textResponse("<!doctype html><html><body></body></html>"));

    const result = await editionRepository.getByDate("2026-01-01", signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports a body served as plain text as unavailable", async () => {
    // Asserted as the exact reason, not merely as a failure: the point of this
    // case is which of the five it is. `ok: false` alone would still pass if
    // every distinction below were deleted.
    stubFetch(textResponse("{}", 200, "text/plain"));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports a body with no content type at all as unavailable", async () => {
    // 204 from a host that answers a missing file without a body. Nothing
    // arrived that could be an edition, and nothing says one exists.
    stubFetch(new Response(null, { status: 204 }));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports a 410 as unavailable", async () => {
    stubFetch(textResponse("Gone", 410, "text/plain"));

    const result = await editionRepository.getByDate("2026-01-01", signal());

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([500, 502, 503])(
    "reports a %i as unreachable, never as nothing published",
    async (status) => {
      // The distinction this pins is a claim made to a reader. A failing CDN
      // says nothing about whether an edition was published, so reporting it as
      // `unavailable` would put "Nothing is published at this address yet." in
      // front of every reader during an outage -- a false statement about
      // published content (section 37).
      stubFetch(textResponse("Bad gateway", status, "text/html"));

      const result = await editionRepository.getIndex(signal());

      expect(result).toEqual({ ok: false, reason: "unreachable" });
    },
  );

  it("reports a 429 as unreachable", async () => {
    // Rate limiting is the host declining to answer, not an answer.
    stubFetch(textResponse("Too many requests", 429, "text/plain"));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a body that parsed to null as invalid", async () => {
    stubFetch(textResponse("null", 200, "application/json"));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports a truncated JSON document as malformed", async () => {
    stubFetch(
      textResponse('{"schemaVersion": 1, "edi', 200, "application/json"),
    );

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("reports an empty JSON body as malformed", async () => {
    stubFetch(textResponse("", 200, "application/json"));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("reports a schema version this reader does not understand as invalid", async () => {
    stubFetch(jsonResponse({ ...validEdition(), schemaVersion: 2 }));

    const result = await editionRepository.getByDate("2026-08-13", signal());

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports an index that is not an index as invalid", async () => {
    stubFetch(
      jsonResponse({ ...index, editions: ["2026-08-12", "2026-08-13"] }),
    );

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports an edition served in place of the index as invalid", async () => {
    stubFetch(jsonResponse(validEdition()));

    const result = await editionRepository.getIndex(signal());

    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it.each(Object.keys(invalidEditions))(
    "refuses an edition where %s",
    async (rule) => {
      stubFetch(jsonResponse(invalidEditions[rule]));

      const result = await editionRepository.getByDate("2026-08-13", signal());

      expect(result).toEqual({ ok: false, reason: "invalid" });
    },
  );
});

describe("what it never does", () => {
  it("never rejects, whatever the network returns", async () => {
    // Each case names the reason it must produce. Asserting only `ok: false`
    // would let this sweep pass with every reason collapsed into one, which is
    // the failure it exists to catch.
    const hostile: readonly {
      readonly staged: Response | Error;
      readonly reason: EditionFailureReason;
    }[] = [
      { staged: new TypeError("Failed to fetch"), reason: "network" },
      { staged: textResponse("<!doctype html>"), reason: "unavailable" },
      {
        staged: textResponse("nope", 500, "application/json"),
        reason: "unreachable",
      },
      {
        staged: textResponse("null", 200, "application/json"),
        reason: "invalid",
      },
      { staged: jsonResponse({}), reason: "invalid" },
      { staged: jsonResponse([1, 2, 3]), reason: "invalid" },
    ];

    for (const { staged, reason } of hostile) {
      stubFetch(staged);

      const result = await editionRepository.getByDate("2026-08-13", signal());

      expect(result).toEqual({ ok: false, reason });
      vi.unstubAllGlobals();
    }
  });

  it("logs where content failed but never what it contained", async () => {
    const errors = vi.spyOn(console, "error");
    stubFetch(jsonResponse({ ...validEdition(), schemaVersion: 2 }));

    await editionRepository.getByDate("2026-08-13", signal());

    const logged = JSON.stringify(errors.mock.calls);
    expect(errors).toHaveBeenCalled();
    expect(logged).toContain("schemaVersion");
    expect(logged).not.toContain("Sample development story");
    expect(logged).not.toContain("example.test");
  });
});
