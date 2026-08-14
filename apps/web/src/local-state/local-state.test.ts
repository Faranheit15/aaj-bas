import { describe, expect, it } from "vitest";
import {
  EMPTY_LOCAL_STATE,
  LOCAL_STATE_VERSION,
  type LocalStateV1,
  MAX_REMEMBERED_EDITIONS,
  readLocalState,
  toCurrentVersion,
  viewedStoryIds,
  withViewedStory,
} from "./local-state";

/**
 * These are the rules a reader's device is held to, so they are exercised as
 * strings in and strings out. Nothing here touches storage: what a browser does
 * with the result is `local-state-store.test.ts`, and keeping the two apart is
 * what lets the version rule be tested exhaustively rather than sampled.
 */

const EDITION = "2026-07-21";

function usable(raw: string): LocalStateV1 {
  const read = readLocalState(raw);
  if (read.kind !== "usable") {
    throw new Error(`expected a usable document, got ${read.kind}`);
  }

  return read.state;
}

/** Sequential edition dates from 2026-01-01, in UTC so the host zone cannot move them. */
function editionDates(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
  );
}

function withEditions(dates: readonly string[]): LocalStateV1 {
  return dates.reduce(
    (state, date) => withViewedStory(state, date, "story-a"),
    EMPTY_LOCAL_STATE,
  );
}

function editionsIn(state: LocalStateV1): string[] {
  return Object.keys(state.viewedByEdition).sort();
}

describe("reading a stored document", () => {
  it("treats a fresh device as replaceable rather than as a failure", () => {
    expect(readLocalState(null)).toEqual({ kind: "replaceable" });
  });

  it("round-trips a document it wrote", () => {
    const state = withViewedStory(
      withViewedStory(EMPTY_LOCAL_STATE, EDITION, "story-b"),
      EDITION,
      "story-a",
    );

    const read = readLocalState(JSON.stringify(state));

    expect(read).toEqual({ kind: "usable", state });
    expect(viewedStoryIds(usable(JSON.stringify(state)), EDITION)).toEqual(
      new Set(["story-a", "story-b"]),
    );
  });

  it("carries an unrecognised top-level key through a write untouched", () => {
    // The case this protects: a newer build wrote `endedEditions`, and this
    // build — served from a stale edge — must hand it back rather than strip it.
    const stored = JSON.stringify({
      schemaVersion: LOCAL_STATE_VERSION,
      viewedByEdition: { [EDITION]: ["story-a"] },
      endedEditions: [EDITION],
    });

    const written = JSON.stringify(
      withViewedStory(usable(stored), EDITION, "story-b"),
    );

    expect(JSON.parse(written)).toMatchObject({ endedEditions: [EDITION] });
    expect(viewedStoryIds(usable(written), EDITION)).toEqual(
      new Set(["story-a", "story-b"]),
    );
  });

  it("treats a version below the current one as ours to replace", () => {
    expect(readLocalState(JSON.stringify({ schemaVersion: 0 }))).toEqual({
      kind: "replaceable",
    });
  });

  it("treats a version above the current one as foreign, never as corrupt", () => {
    const newer = JSON.stringify({
      schemaVersion: 2,
      viewedByEdition: { [EDITION]: ["story-a"] },
    });

    expect(readLocalState(newer)).toEqual({ kind: "foreign" });
  });

  const corrupt: readonly { readonly label: string; readonly raw: string }[] = [
    { label: "not JSON at all", raw: "{oh no" },
    { label: "the JSON null", raw: "null" },
    { label: "a bare number", raw: "3" },
    { label: "a bare string", raw: '"x"' },
    { label: "an array", raw: "[]" },
    { label: "an object with no version", raw: "{}" },
    {
      label: "a version that is a string",
      raw: '{"schemaVersion":"1","viewedByEdition":{}}',
    },
    {
      label: "viewedByEdition as a string",
      raw: '{"schemaVersion":1,"viewedByEdition":"story-a"}',
    },
    {
      label: "an entry that is not an array",
      raw: '{"schemaVersion":1,"viewedByEdition":{"2026-07-21":"story-a"}}',
    },
    {
      label: "an id that is not an identifier",
      raw: '{"schemaVersion":1,"viewedByEdition":{"2026-07-21":["Story A"]}}',
    },
    {
      label: "a date that is not on the calendar",
      raw: '{"schemaVersion":1,"viewedByEdition":{"2026-02-30":["story-a"]}}',
    },
  ];

  it.each(corrupt)("replaces $label without throwing", ({ raw }) => {
    expect(() => readLocalState(raw)).not.toThrow();
    expect(readLocalState(raw)).toEqual({ kind: "replaceable" });
  });
});

describe("the migration seam", () => {
  it("returns a document that is already at the current version", () => {
    const stored = { schemaVersion: LOCAL_STATE_VERSION, viewedByEdition: {} };

    expect(toCurrentVersion(stored)).toBe(stored);
  });

  it.each([
    { label: "an older version", stored: { schemaVersion: 0 } },
    { label: "a newer version", stored: { schemaVersion: 2 } },
    { label: "no version", stored: {} },
  ])("has nothing to offer for $label", ({ stored }) => {
    expect(toCurrentVersion(stored)).toBeNull();
  });
});

describe("recording that a story was expanded", () => {
  it("is idempotent", () => {
    const once = withViewedStory(EMPTY_LOCAL_STATE, EDITION, "story-a");
    const twice = withViewedStory(once, EDITION, "story-a");

    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("leaves EMPTY_LOCAL_STATE unchanged", () => {
    withViewedStory(EMPTY_LOCAL_STATE, EDITION, "story-a");

    expect(EMPTY_LOCAL_STATE).toEqual({
      schemaVersion: LOCAL_STATE_VERSION,
      viewedByEdition: {},
    });
  });

  it("sorts ids, so the same set is the same bytes whatever order it was read in", () => {
    const opened = ["story-c", "story-a", "story-b"].reduce(
      (state, id) => withViewedStory(state, EDITION, id),
      EMPTY_LOCAL_STATE,
    );
    const openedDifferently = ["story-b", "story-c", "story-a"].reduce(
      (state, id) => withViewedStory(state, EDITION, id),
      EMPTY_LOCAL_STATE,
    );

    expect(JSON.stringify(opened)).toBe(JSON.stringify(openedDifferently));
    // Sorted, so the document does not record the order the reader worked in.
    expect(opened.viewedByEdition[EDITION]).toEqual([
      "story-a",
      "story-b",
      "story-c",
    ]);
  });
});

describe("bounding how many editions are remembered", () => {
  it("drops exactly the oldest edition when one more is written", () => {
    const dates = editionDates(MAX_REMEMBERED_EDITIONS + 1);
    const full = withEditions(dates.slice(0, MAX_REMEMBERED_EDITIONS));

    expect(editionsIn(full)).toHaveLength(MAX_REMEMBERED_EDITIONS);

    const overflowed = withViewedStory(
      full,
      dates[MAX_REMEMBERED_EDITIONS] ?? "",
      "story-a",
    );

    expect(editionsIn(overflowed)).toEqual(dates.slice(1));
  });

  it("keeps an archive edition being written, and drops the oldest other one", () => {
    // A reader opening a story in an old edition must not have the entry
    // discarded by the write that created it.
    const dates = editionDates(MAX_REMEMBERED_EDITIONS);
    const archive = "2025-01-01";

    const written = withViewedStory(withEditions(dates), archive, "story-a");

    expect(editionsIn(written)).toEqual([archive, ...dates.slice(1)]);
    expect(viewedStoryIds(written, archive)).toEqual(new Set(["story-a"]));
  });

  it("never trims the ids inside an entry", () => {
    const dates = editionDates(MAX_REMEMBERED_EDITIONS + 5);
    const state = dates.reduce(
      (carried, date) =>
        ["story-a", "story-b", "story-c"].reduce(
          (inner, id) => withViewedStory(inner, date, id),
          carried,
        ),
      EMPTY_LOCAL_STATE,
    );

    for (const ids of Object.values(state.viewedByEdition)) {
      expect(ids).toHaveLength(3);
    }
  });

  it("serialises identically whichever order the same editions were written in", () => {
    // The last write is held fixed on purpose: the entry being written is
    // always kept, so which old edition survives genuinely depends on what was
    // written last. What must not depend on order is the stored key order.
    const dates = editionDates(40);
    const newest = dates[dates.length - 1] ?? "";
    const earlier = dates.slice(0, -1);

    const ascending = withViewedStory(withEditions(earlier), newest, "story-a");
    const descending = withViewedStory(
      withEditions([...earlier].reverse()),
      newest,
      "story-a",
    );

    expect(JSON.stringify(ascending)).toBe(JSON.stringify(descending));
    expect(editionsIn(ascending)).toHaveLength(MAX_REMEMBERED_EDITIONS);
  });

  it("serialises identically when the same editions end on a different write", () => {
    /*
      The test above holds the last write fixed, which is what makes it blind
      to the output sort: the entry being written is placed first and the rest
      follow in descending date order, so `[alwaysKeep, ...others]` is already
      insertion-order-deterministic without sorting it. Removing the sort
      passes it.

      The sort's actual job is byte-equality across a DIFFERENT last write, so
      that is what this varies. Thirty editions either way — under the bound,
      so nothing is evicted and both key SETS are identical — but one sequence
      ends on the newest date and the other on the oldest. Unsorted, that is
      `[d30, d29, …, d1]` against `[d1, d30, d29, …, d2]`: the same document,
      two different strings, and a needless write on every load.
    */
    const dates = editionDates(MAX_REMEMBERED_EDITIONS);
    const oldest = dates[0] ?? "";

    const endingOnTheNewest = withEditions(dates);
    const endingOnTheOldest = withViewedStory(
      withEditions(dates.slice(1)),
      oldest,
      "story-a",
    );

    expect(editionsIn(endingOnTheOldest)).toEqual(
      editionsIn(endingOnTheNewest),
    );
    expect(JSON.stringify(endingOnTheOldest)).toBe(
      JSON.stringify(endingOnTheNewest),
    );
  });
});

describe("an edition date that names something on Object.prototype", () => {
  /*
    A plain `entries[date] ?? []` lookup resolves through the prototype chain,
    so these four names yield a function or an object rather than `undefined`,
    `??` keeps the value because it is not nullish, and the caller then spreads
    it or hands it to `new Set` — which throws out of a render.

    Not reachable from today's product, where dates come from a validated
    edition. It is asserted because the module's promise is that no refused
    write becomes a rendering decision, and an exception thrown from the lazy
    initialiser of `useViewedStories` reaches an error boundary instead.
  */
  const inherited = ["constructor", "toString", "valueOf", "__proto__"];

  it.each(inherited)("reads %s as an edition with nothing stored", (name) => {
    expect(() => viewedStoryIds(EMPTY_LOCAL_STATE, name)).not.toThrow();
    expect(viewedStoryIds(EMPTY_LOCAL_STATE, name)).toEqual(new Set());
  });

  it.each(inherited)("records against %s without throwing", (name) => {
    expect(() =>
      withViewedStory(EMPTY_LOCAL_STATE, name, "story-a"),
    ).not.toThrow();
  });
});

describe("reading one edition's viewed stories", () => {
  it("is empty for an edition that was never opened", () => {
    expect(viewedStoryIds(EMPTY_LOCAL_STATE, EDITION)).toEqual(new Set());
  });
});
