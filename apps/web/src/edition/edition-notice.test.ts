/**
 * The six things this product may say about the edition on screen.
 *
 * Six is the whole input space — three freshnesses times two sources — which is
 * why this file can do something component tests cannot: sweep every sentence
 * the reader could ever be shown and assert what none of them contains. That is
 * only possible because the function is pure and its inputs are two closed
 * unions, and it is the reason the composition lives in a module of its own
 * rather than inside `EditionView`.
 *
 * Each test below is named for the mutation it kills.
 */
import { describe, expect, it } from "vitest";
import type { EditionFreshness } from "./edition-freshness";
import { editionNotice } from "./edition-notice";
import type { EditionSource } from "./edition-repository";

/** A download instant, deliberately not the fixture edition's publication one. */
const DOWNLOADED = "2026-07-21T07:12:00+05:30";

const FRESHNESSES: readonly EditionFreshness[] = [
  "current",
  "stale",
  "archived",
];
const SOURCES: readonly EditionSource[] = ["network", "cache"];

describe("an edition fetched over the network", () => {
  it("says exactly what it said before this slice, in all three cells", () => {
    /*
      Byte for byte, because the plausible regression is a cache notice shown
      to every reader: a single sentence appended unconditionally, or a source
      test written the wrong way round, changes nothing a "contains" assertion
      would catch. `current` is asserted as null rather than as an empty
      notice — the state where the product says nothing at all is the one worth
      protecting, since a daily line saying "this is today's edition" is a line
      every reader reads every day for no information.
    */
    expect(editionNotice("current", "network", null)).toBeNull();
    expect(editionNotice("stale", "network", null)).toEqual({
      text: "Today's edition is not published yet. This is the most recent edition.",
      copyDate: null,
    });
    expect(editionNotice("archived", "network", null)).toEqual({
      text: "This is a past edition.",
      copyDate: null,
    });
  });

  it("states no download time even when one is known", () => {
    // "Downloaded 7:12 am" under an edition fetched a second ago is noise at
    // best, and at worst is read as the publication time on the line below.
    for (const freshness of FRESHNESSES) {
      expect(
        editionNotice(freshness, "network", DOWNLOADED)?.copyDate ?? null,
      ).toBeNull();
    }
  });
});

describe("an edition served from this device", () => {
  it("names today's saved copy as today's, not as out of date", () => {
    /*
      Kills collapsing source into freshness. A model with one "offline" state
      has to call this either current or stale; stale is the tempting choice
      because the bytes are old, and it is a false statement about the content —
      the edition is dated today, and the date is what makes an edition today's.
    */
    const notice = editionNotice("current", "cache", DOWNLOADED);

    expect(notice?.text).toBe("This is today's edition, saved on this device.");
    expect(notice?.text).not.toMatch(/most recent|not today's|past edition/i);
  });

  it("does not reuse the online wording for a stale saved copy", () => {
    /*
      Kills the copy-paste. Online, `stale` means the pointer we just fetched
      still names an older day, which is evidence today's edition is not
      published yet. From a cache no pointer was fetched at all, so the same
      sentence would be a claim about published content made on no evidence.
    */
    const notice = editionNotice("stale", "cache", DOWNLOADED);

    expect(notice?.text).toBe(
      "This is the most recent edition saved on this device. It is not today's edition.",
    );
    expect(notice?.text).not.toMatch(/not published yet/i);
    expect(notice?.text).not.toMatch(/Today's edition is/i);
  });

  it("says a past edition is a past edition, and that it is saved", () => {
    expect(editionNotice("archived", "cache", DOWNLOADED)?.text).toBe(
      "This is a past edition, saved on this device.",
    );
  });

  it("states the download instant when it is known", () => {
    for (const freshness of FRESHNESSES) {
      expect(editionNotice(freshness, "cache", DOWNLOADED)?.copyDate).toBe(
        DOWNLOADED,
      );
    }
  });

  it("drops the download sentence when the instant is not known", () => {
    /*
      THE PRIVACY-LOAD-BEARING CASE, and the one a plausible "fix" breaks.

      The instant is read off the cached response's own `date` header, so a
      response that carried none leaves nothing to state. The repair that
      suggests itself — fall back to `Date.now()`, or to the moment of render —
      would fabricate a download time AND would be the first reading timestamp
      this product has ever produced, which is the thing ADR-0007 rejected LRU
      eviction to avoid. The notice keeps its text and simply says less.
    */
    for (const freshness of FRESHNESSES) {
      const notice = editionNotice(freshness, "cache", null);

      expect(notice?.copyDate).toBeNull();
      expect(notice?.text).toContain("saved on this device");
    }
  });
});

describe("the vocabulary, across every notice this product can produce", () => {
  /** Every reachable notice: six cells, each with and without an instant. */
  const everyNotice = FRESHNESSES.flatMap((freshness) =>
    SOURCES.flatMap((source) =>
      [DOWNLOADED, null].map((copyDate) => ({
        label: `${freshness} from ${source}${copyDate === null ? " with no instant" : ""}`,
        notice: editionNotice(freshness, source, copyDate),
      })),
    ),
  );

  it("was actually enumerated, so the sweep below measures something", () => {
    // Non-vacuous: a sweep over an empty list passes by checking nothing, and
    // eleven of the twelve cells carry text.
    expect(everyNotice).toHaveLength(12);
    expect(everyNotice.filter(({ notice }) => notice !== null)).toHaveLength(
      10,
    );
  });

  it.each(everyNotice)(
    "says nothing forbidden in the $label case",
    ({ notice }) => {
      /*
        One assertion standing in for eight product rules, and it is exhaustive
        rather than representative — which is the whole reason this function is
        pure with a finite input space.

        "offline" and "connection": claims about the reader's device that nothing
        here can support. `navigator.onLine` is true on a captive portal, and an
        edition is on the screen regardless. "You appear to be offline" stays on
        `EditionUnavailable`, where it is the reason there is nothing to show.

        "check your", "reconnect": instructions to go and fix something before
        reading today's news (section 3.2).

        "try again", "refresh", "update available": controls this screen must not
        grow. PRD section 8 excludes user-triggered fetching from v1, and a toast
        offering an update is an interruption carrying a task (section 3.5).

        "incomplete", "missing": false. A cached edition is the whole validated
        file, and telling a reader part of it might be absent would make them
        distrust content that is entirely intact.
      */
      expect(notice?.text ?? "").not.toMatch(
        /check your|connection|reconnect|offline|try again|refresh|update available|incomplete|missing/i,
      );
    },
  );

  it("carries no badge, icon, or mode, only a sentence", () => {
    // Section 25: information carried by an icon or a colour alone is
    // information some readers never receive. The notice is prose, and the
    // structured value has room for nothing else.
    for (const { notice } of everyNotice) {
      if (notice === null) {
        continue;
      }
      expect(Object.keys(notice).sort()).toEqual(["copyDate", "text"]);
      expect(notice.text).not.toMatch(/[\p{Extended_Pictographic}]/u);
      expect(notice.text).not.toMatch(/mode/i);
    }
  });

  it("ends every sentence it starts", () => {
    // Cheap, and it catches the half-written cell a table edit leaves behind.
    for (const { notice } of everyNotice) {
      if (notice === null) {
        continue;
      }
      expect(notice.text.trim()).toBe(notice.text);
      expect(notice.text.endsWith(".")).toBe(true);
    }
  });
});
