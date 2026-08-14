import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localStateV1Schema } from "./local-state";

/**
 * The device half: one key, and the four ways a browser can refuse.
 *
 * Every test loads the module fresh, because the store suppresses a repeated
 * warning for the life of a page load and a shared instance would let one test
 * silence the next one's assertion. Resetting the registry is also how the
 * blocked-property-access test proves the module can be *evaluated* in a
 * browser that throws on `window.localStorage`, which is the failure that would
 * otherwise take down the whole application at import time.
 */

type Store = typeof import("./local-state-store");

const KEY = "aaj-bas.local-state";
const EDITION = "2026-07-21";

async function freshStore(): Promise<Store> {
  vi.resetModules();

  return import("./local-state-store");
}

/** Sequential edition dates from 2026-01-01, in UTC so the host zone cannot move them. */
function editionDates(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
  );
}

function storedDocument(): unknown {
  const raw = localStorage.getItem(KEY);
  if (raw === null) {
    throw new Error("nothing was stored");
  }

  return JSON.parse(raw);
}

/**
 * jsdom defines `localStorage` as an own configurable accessor on `window`, not
 * as a getter on `Window.prototype`, so a replacement has to be undone by
 * putting the original descriptor back. Deleting the property instead removes
 * storage for every test that follows, and `vi.spyOn(window, "localStorage")`
 * does not intercept the access at all.
 */
const realStorageAccess = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

/** Makes the property access itself throw, as Safari private mode does. */
function blockStorageAccess(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("storage is blocked", "SecurityError");
    },
  });
}

function spyOnWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

/**
 * Every warning this file provokes, from the first line of every test.
 *
 * One spy, installed once and never re-created. `vi.spyOn` on an
 * already-spied method hands back a fresh mock with empty history, so a test
 * that re-spied mid-body could only ever inspect what it emitted AFTER that
 * point — and the reads a store test does first are exactly what it would then
 * be blind to. Holding the module-level spy is what lets the sweep below see
 * the read path and the write path alike.
 */
let warn: ReturnType<typeof spyOnWarn>;

beforeEach(() => {
  // Several of these tests provoke a warning on purpose; silencing it keeps the
  // suite output readable, and the tests that care re-use this same spy.
  warn = spyOnWarn();
});

afterEach(() => {
  /*
    The privacy claim, applied to every line this file caused rather than to
    the one line a single test happened to look at.

    Section 38, and the reason it bites here specifically: which stories a
    reader opened, and on which day, is the record this product does not keep,
    and a console line is still keeping it. The store's own comment says the
    field vocabulary is closed and excludes both — this is the executable half
    of that sentence, and it holds on the read path, the write path, and any
    path a later edit adds, because it is not attached to a scenario.

    Story ids are kebab-case and edition dates are ISO, so the whole document
    is greppable by shape: `story-` and `NNNN-NN-NN`. A future id convention
    that this pattern misses is the maintenance cost, and it is the right one
    to pay — the alternative is asserting an allowlist of fields, which passes
    happily when a new field is added carrying a date inside it.
  */
  for (const call of warn.mock.calls) {
    expect(JSON.stringify(call)).not.toMatch(/story-|\d{4}-\d{2}-\d{2}/);
  }

  if (realStorageAccess !== undefined) {
    Object.defineProperty(window, "localStorage", realStorageAccess);
  }
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("a device with nothing stored", () => {
  it("reads an empty set and writes nothing at all", async () => {
    const store = await freshStore();

    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set());
    // Merely opening an edition must leave no trace; the first byte is written
    // when the reader expands their first story.
    expect(localStorage.length).toBe(0);
  });
});

describe("remembering an expanded story", () => {
  it("survives a reload", async () => {
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");

    // A second module instance can only see this through the device.
    const afterReload = await freshStore();

    expect(afterReload.readViewedStoryIds(EDITION)).toEqual(
      new Set(["story-a"]),
    );
  });

  it("keeps other editions' entries, because it reads before it writes", async () => {
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");
    store.rememberViewed("2026-07-20", "story-b");
    store.rememberViewed(EDITION, "story-c");

    expect(store.readViewedStoryIds(EDITION)).toEqual(
      new Set(["story-a", "story-c"]),
    );
    expect(store.readViewedStoryIds("2026-07-20")).toEqual(
      new Set(["story-b"]),
    );
  });

  it("writes exactly one key, and it is the documented one", async () => {
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");

    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(KEY);
    expect(store.LOCAL_STATE_KEY).toBe(KEY);
  });

  it("still holds thirty editions after thirty-one were written", async () => {
    const store = await freshStore();
    for (const date of editionDates(31)) {
      store.rememberViewed(date, "story-a");
    }

    const document = localStateV1Schema.parse(storedDocument());

    expect(Object.keys(document.viewedByEdition)).toHaveLength(30);
    expect(document.viewedByEdition["2026-01-01"]).toBeUndefined();
    expect(document.viewedByEdition["2026-01-31"]).toEqual(["story-a"]);
  });
});

describe("remembering that an edition was ended", () => {
  it("survives a reload", async () => {
    const store = await freshStore();
    store.rememberEnded(EDITION);

    // A second module instance can only see this through the device.
    const afterReload = await freshStore();

    expect(afterReload.readEditionEnded(EDITION)).toBe(true);
    expect(afterReload.readEditionEnded("2026-07-20")).toBe(false);
  });

  it("writes exactly one key, and it is the documented one", async () => {
    const store = await freshStore();
    store.rememberEnded(EDITION);

    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe(KEY);
  });

  it("keeps the viewed sets, because it reads before it writes", async () => {
    // The two fields live in one document, so a blind write from either side
    // would drop the other. This is that, from the ending side.
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");

    store.rememberEnded(EDITION);

    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set(["story-a"]));

    const document = localStateV1Schema.parse(storedDocument());
    expect(document.viewedByEdition[EDITION]).toEqual(["story-a"]);
    expect(document.endedEditions).toEqual([EDITION]);
  });

  it("still holds thirty ended editions after thirty-one were written", async () => {
    const store = await freshStore();
    for (const date of editionDates(31)) {
      store.rememberEnded(date);
    }

    const document = localStateV1Schema.parse(storedDocument());

    expect(document.endedEditions).toHaveLength(30);
    expect(store.readEditionEnded("2026-01-01")).toBe(false);
    expect(store.readEditionEnded("2026-01-31")).toBe(true);
  });

  const rejectedDates = [
    { label: "a date that is not on the calendar", date: "2026-02-30" },
    { label: "a date that is not a date", date: "not-a-date" },
    { label: "an empty date", date: "" },
    {
      label: "a date naming a property of Object.prototype",
      date: "__proto__",
    },
  ];

  it.each(rejectedDates)("refuses $label", async ({ date }) => {
    // One rejected date inside `endedEditions` would fail the whole document's
    // next read, which reads as `replaceable`, which the write after that
    // overwrites — costing the reader every viewed set they had accumulated.
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");
    const before = localStorage.getItem(KEY);

    expect(() => store.rememberEnded(date)).not.toThrow();

    expect(localStorage.getItem(KEY)).toBe(before);
    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set(["story-a"]));
    expect(warn).toHaveBeenCalledTimes(1);
    // The reason, and neither value: `afterEach` sweeps this call for dates.
    expect(warn.mock.calls[0]?.[2]).toEqual({ reason: "unwritable-values" });
  });
});

describe("a document written by a newer build", () => {
  it("is neither read from nor written over", async () => {
    const foreign = JSON.stringify({
      schemaVersion: 2,
      viewedByEdition: { [EDITION]: ["story-a"] },
      somethingThisBuildHasNeverHeardOf: true,
    });
    localStorage.setItem(KEY, foreign);

    const store = await freshStore();

    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set());

    store.rememberViewed(EDITION, "story-b");

    // Byte-identical. An older bundle served from a stale edge, or later from a
    // service worker, must not destroy the state a newer bundle wrote.
    expect(localStorage.getItem(KEY)).toBe(foreign);
  });

  it("is neither read from nor written over when an edition is ended", async () => {
    const foreign = JSON.stringify({
      schemaVersion: 2,
      endedEditions: [EDITION],
      somethingThisBuildHasNeverHeardOf: true,
    });
    localStorage.setItem(KEY, foreign);

    const store = await freshStore();

    expect(store.readEditionEnded(EDITION)).toBe(false);

    store.rememberEnded(EDITION);

    expect(localStorage.getItem(KEY)).toBe(foreign);
  });

  it("says so once, naming the version and nothing else", async () => {
    // Refusing to read and refusing to write are both correct and both
    // invisible, so the developer-facing report is the only evidence the
    // condition was noticed at all rather than silently swallowed (section
    // 37). The version is the one field worth naming: it says the bundle is
    // older than the document, which is a caching problem, not a bug here.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        schemaVersion: 2,
        viewedByEdition: { [EDITION]: ["story-a"] },
      }),
    );

    const store = await freshStore();
    store.readViewedStoryIds(EDITION);
    store.rememberViewed(EDITION, "story-b");

    // Once for the page load, however many cards the reader expands.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[2]).toEqual({
      reason: "foreign-version",
      storedVersion: 2,
    });
  });
});

describe("a corrupt document", () => {
  it("reads as empty and is replaced by the next write", async () => {
    localStorage.setItem(KEY, "{not json at all");

    const store = await freshStore();

    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set());

    store.rememberViewed(EDITION, "story-a");

    const document = localStateV1Schema.parse(storedDocument());
    expect(document.viewedByEdition[EDITION]).toEqual(["story-a"]);
  });

  it("says so once, without quoting the document it could not read", async () => {
    // Reading a corrupt document as empty is indistinguishable, from the
    // outside, from a device that has nothing — so without this the difference
    // between "nothing stored" and "something stored that we threw away" is
    // reported nowhere at all (section 37).
    localStorage.setItem(KEY, `{"viewedByEdition":{"${EDITION}":["story-a"]}}`);

    const store = await freshStore();
    store.readViewedStoryIds(EDITION);
    store.rememberViewed(EDITION, "story-b");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[2]).toEqual({ reason: "unreadable-document" });
  });
});

describe("a write whose values could not survive their own read", () => {
  /*
    `viewedByEdition` is keyed BY the edition date, so a key the schema rejects
    does not cost one entry — it makes the whole document fail validation on
    the next load, which reads as `replaceable`, which the write after that
    overwrites. One bad date discards every edition the reader had
    accumulated.

    Not reachable from today's product, where both values come from an edition
    that passed the published content schemas. It is asserted because that is a
    fact about today's CALLERS and not about this function, and AB-204 changes
    it: its keys come from what the reader chose, not from a published edition.
  */
  const rejected = [
    { label: "a date that is not on the calendar", date: "2026-02-30" },
    { label: "a date that is not a date", date: "not-a-date" },
    { label: "an empty date", date: "" },
    {
      label: "a date naming a property of Object.prototype",
      date: "__proto__",
    },
  ];

  it.each(rejected)("refuses $label", async ({ date }) => {
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");
    const before = localStorage.getItem(KEY);

    expect(() => store.rememberViewed(date, "story-b")).not.toThrow();

    expect(localStorage.getItem(KEY)).toBe(before);
    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set(["story-a"]));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[2]).toEqual({ reason: "unwritable-values" });
  });

  const badIds = [
    { label: "an id that is not kebab-case", id: "Story A" },
    { label: "an id past the length bound", id: `story-${"a".repeat(200)}` },
    { label: "an empty id", id: "" },
  ];

  it.each(badIds)("refuses $label", async ({ id }) => {
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");
    const before = localStorage.getItem(KEY);

    expect(() => store.rememberViewed(EDITION, id)).not.toThrow();

    expect(localStorage.getItem(KEY)).toBe(before);
    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set(["story-a"]));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[2]).toEqual({ reason: "unwritable-values" });
  });

  it("leaves a document written before it entirely readable", async () => {
    // The failure this exists to stop, stated as the reader would feel it: a
    // month of archive browsing is still there after a refused write.
    const store = await freshStore();
    store.rememberViewed(EDITION, "story-a");
    store.rememberViewed("2026-07-20", "story-b");

    store.rememberViewed("2026-02-30", "story-c");

    const afterReload = await freshStore();
    expect(afterReload.readViewedStoryIds(EDITION)).toEqual(
      new Set(["story-a"]),
    );
    expect(afterReload.readViewedStoryIds("2026-07-20")).toEqual(
      new Set(["story-b"]),
    );
  });
});

describe("storage that cannot be reached", () => {
  it("reads empty and writes nothing when the property access throws", async () => {
    blockStorageAccess();

    // Importing under a throwing getter is half the assertion: a reference
    // captured at module scope would fail here, before any test could run.
    const store = await freshStore();

    expect(() => store.readViewedStoryIds(EDITION)).not.toThrow();
    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set());
    expect(() => store.rememberViewed(EDITION, "story-a")).not.toThrow();
  });

  it("reads empty and writes nothing when getItem throws", async () => {
    const store = await freshStore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage is blocked", "SecurityError");
    });

    expect(() => store.readViewedStoryIds(EDITION)).not.toThrow();
    expect(store.readViewedStoryIds(EDITION)).toEqual(new Set());
    // A read that failed says nothing about what is under the key, so a write
    // could be overwriting a newer build's document. It does not happen.
    expect(() => store.rememberViewed(EDITION, "story-a")).not.toThrow();
    expect(localStorage.length).toBe(0);
  });
});

describe("a write the browser refuses", () => {
  // jsdom enforces no quota, so throwing is the only honest simulation. Both
  // names are exercised to show the code does not branch on either.
  it.each(["QuotaExceededError", "SecurityError"])(
    "leaves the stored document alone and warns once, on %s",
    async (name) => {
      const store = await freshStore();
      store.rememberViewed(EDITION, "story-a");
      const before = localStorage.getItem(KEY);

      // The file-wide spy, deliberately not a fresh one. Re-spying here would
      // discard the history of everything emitted above and leave the sweep in
      // `afterEach` inspecting only this scenario's tail.
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("refused", name);
      });

      expect(() => store.rememberViewed(EDITION, "story-b")).not.toThrow();
      expect(() => store.rememberViewed(EDITION, "story-c")).not.toThrow();

      expect(localStorage.getItem(KEY)).toBe(before);
      expect(store.readViewedStoryIds(EDITION)).toEqual(new Set(["story-a"]));

      // Once for the whole page load, however many cards the reader expands.
      expect(warn).toHaveBeenCalledTimes(1);

      // The reason, and nothing else: `afterEach` sweeps this call — and every
      // other one this file causes — for ids and dates.
      expect(warn.mock.calls[0]?.[2]).toEqual({ reason: "write-refused" });
    },
  );
});
