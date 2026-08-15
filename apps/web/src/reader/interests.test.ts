import type { InterestSlug } from "@aaj-bas/schemas";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterestsRead } from "../local-state/local-state-store";
import {
  readInterests,
  rememberInterests,
} from "../local-state/local-state-store";
import type { InterestsStore } from "./interests";
import { useInterestSnapshot, useInterests } from "./interests";

const TODAY = "2026-08-13";
const YESTERDAY = "2026-08-12";

/**
 * jsdom defines `localStorage` as an own configurable accessor on `window`, so
 * a replacement has to be undone by putting the original descriptor back.
 * Deleting the property instead removes storage for every test that follows in
 * this file, and `vi.spyOn(window, "localStorage")` does not intercept the
 * access at all.
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

/** Makes the write, and only the write, fail — quota, as a full device does. */
function refuseWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });
}

beforeEach(() => {
  // Two tests provoke the store's warning on purpose; silencing it keeps the
  // suite output readable.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  if (realStorageAccess !== undefined) {
    Object.defineProperty(window, "localStorage", realStorageAccess);
  }
  vi.restoreAllMocks();
  // jsdom keeps one storage area for the whole file, so without this a stored
  // document outlives the test that wrote it.
  localStorage.clear();
});

/**
 * Puts an answer on the device before the hook runs, through the store's own
 * writer.
 *
 * Deliberately not a hand-written JSON document, for the reason
 * `edition-ended.test.ts` gives: what the stored document looks like is
 * `local-state.ts`'s business, and a test that spelled the field out here would
 * fail the day that layout changed for a reason these hooks do not care about.
 */
function seed(interests: readonly InterestSlug[]): void {
  rememberInterests(interests);
}

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }

  return value;
}

/**
 * The read as of EVERY render, in order.
 *
 * `renderHook().result.current` cannot express the property these hooks exist
 * to have. Testing Library wraps `render` in `act`, which flushes effects
 * before returning, so `result.current` is the state after everything has
 * settled — a hook that started at "unanswered" and loaded the real answer in
 * an effect reads identically through it.
 *
 * The render history cannot be fooled that way, and here a wrong first entry is
 * not a cosmetic flash: an "unanswered" first render is the invitation
 * appearing in front of a reader who answered weeks ago.
 */
function renderedReads(): InterestsRead[] {
  const reads: InterestsRead[] = [];

  function Probe(): null {
    reads.push(useInterests().read);

    return null;
  }

  render(createElement(Probe));

  return reads;
}

/** The snapshot as of EVERY render, for the same reason. */
function renderSnapshots(): {
  readonly snapshots: (readonly InterestSlug[])[];
  readonly rerender: (date: string) => void;
} {
  const snapshots: (readonly InterestSlug[])[] = [];

  function Probe({ date }: { date: string }): null {
    snapshots.push(useInterestSnapshot(date));

    return null;
  }

  const { rerender } = render(createElement(Probe, { date: TODAY }));

  return {
    snapshots,
    rerender: (date) => rerender(createElement(Probe, { date })),
  };
}

/**
 * Both hooks in one component, which is how the reader meets them: the picker
 * and the edition it sits at the bottom of are on the same page.
 */
type Probed = {
  readonly store: InterestsStore;
  readonly snapshot: readonly InterestSlug[];
};

let probed: Probed | null = null;

function BothProbe({ date }: { date: string }): null {
  probed = { store: useInterests(), snapshot: useInterestSnapshot(date) };

  return null;
}

function probe(): Probed {
  return present(probed, "the rendered probe");
}

describe("useInterests", () => {
  it("has the stored answer on the very first render, not after one", () => {
    /*
      Asserted across the render history rather than on `result.current`, which
      is the state after `act` has flushed every effect and would pass for a
      hook that loaded in one.

      It matters more here than it did for AB-203's counter. A wrong first
      render of the viewed count is a number that settles; a wrong first render
      of the interests changes WHICH STORIES ARE ON THE PAGE, and on the way it
      shows the invitation to a reader who has already answered it.
    */
    seed(["sports"]);

    const reads = renderedReads();

    expect(present(reads[0], "the first render's read")).toEqual({
      status: "answered",
      interests: ["sports"],
    });
    expect(reads.map((read) => read.status)).not.toContain("unanswered");
  });

  it("keeps 'never asked' apart from 'chose nothing'", () => {
    /*
      The distinction the whole slice rests on. Flattening both to an empty
      array would make them indistinguishable, and the picker would then need a
      separate dismissal flag to tell them apart — an accumulating record of
      what the reader has been shown, which is what section 3.5 keeps out.
    */
    const { result: unasked } = renderHook(() => useInterests());
    expect(unasked.current.read).toEqual({ status: "unanswered" });

    cleanup();
    seed([]);
    const { result: declined } = renderHook(() => useInterests());

    expect(declined.current.read).toEqual({
      status: "answered",
      interests: [],
    });
  });

  it("says nothing about a device whose state it may not touch", () => {
    // Safari private browsing, blocked cookies, a sandboxed iframe. The picker
    // renders nothing for this read, which is the honest answer: asking would
    // re-ask a reader who has answered, and their answer could not be kept.
    blockStorageAccess();

    const { result } = renderHook(() => useInterests());

    expect(result.current.read).toEqual({ status: "unknown" });
  });

  it("records the choice, and reports that the device took it", () => {
    const { result } = renderHook(() => useInterests());

    let accepted = false;
    act(() => {
      accepted = result.current.chooseInterests(["technology-ai"]);
    });

    expect(accepted).toBe(true);
    expect(result.current.read).toEqual({
      status: "answered",
      interests: ["technology-ai"],
    });
    expect(readInterests()).toEqual({
      status: "answered",
      interests: ["technology-ai"],
    });
    // One key, the documented one, and nothing in `sessionStorage`.
    expect(localStorage.length).toBe(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("writes nothing when the reader only opens the edition", () => {
    // Browsing leaves no trace. The first byte lands when the reader answers,
    // not when the picker is rendered at them.
    renderHook(() => useInterests());
    renderHook(() => useInterestSnapshot(TODAY));

    expect(localStorage.length).toBe(0);
  });

  it("reports a refused write without turning the answer back into a question", () => {
    /*
      Both halves matter, and they pull in opposite directions.

      The boolean is false, because an interest choice — unlike a viewed story
      or an ended edition — has no effect the reader can see right now, so a
      write that did not land is the whole of it, and reporting otherwise would
      be the silent success section 37 forbids.

      The state still moves. A reader who pressed Save has answered, and showing
      them the invitation again because their device is full would re-ask the
      one question the product promises to ask once.
    */
    refuseWrites();
    const { result } = renderHook(() => useInterests());

    let accepted = true;
    act(() => {
      accepted = result.current.chooseInterests(["sports"]);
    });

    expect(accepted).toBe(false);
    expect(result.current.read).toEqual({
      status: "answered",
      interests: ["sports"],
    });
    // And the device really did keep nothing, which is what the `false` said.
    expect(readInterests()).toEqual({ status: "unanswered" });
  });

  it("shows the reader the same answer before and after a reload", () => {
    /*
      Tick order is a record of how the reader used the control rather than of
      what they chose, so the store discards it on the way to the device. This
      hook has to discard it the same way, and that is what is asserted: what
      the picker holds in memory is what the picker will read back tomorrow.

      Get it wrong and nothing breaks — the selection is a set, and every
      consumer treats it as one — except that "Chosen: Sports and Technology &
      AI." silently becomes "Chosen: Technology & AI and Sports." on the next
      visit, for a reader who changed nothing.
    */
    const { result } = renderHook(() => useInterests());

    act(() => {
      result.current.chooseInterests(["technology-ai", "sports"]);
    });

    expect(result.current.read).toEqual(readInterests());
    expect(result.current.read).toEqual({
      status: "answered",
      interests: ["sports", "technology-ai"],
    });
  });

  it("treats choosing the same two topics again as a no-op", () => {
    // The identical object, so re-saving an unchanged selection does not
    // re-render the edition the picker sits at the bottom of. Asserted across
    // the two tick orders, which canonicalising is what makes one answer.
    const { result } = renderHook(() => useInterests());

    act(() => {
      result.current.chooseInterests(["technology-ai", "sports"]);
    });
    const afterFirst = result.current.read;

    act(() => {
      result.current.chooseInterests(["sports", "technology-ai"]);
    });

    expect(result.current.read).toBe(afterFirst);
  });

  it("writes once per choice under StrictMode's double rendering", () => {
    /*
      React double-invokes lazy initialisers and state updaters to surface
      impure ones, and does not double-invoke event handlers. The write lives in
      the handler for exactly that reason.

      Counted, not read back. The write is idempotent, so a second one leaves
      the device holding byte-identical content: asserting what is STORED passes
      whether it happened once or twice, and moving `rememberInterests` inside
      the updater — the impure-updater bug the hook's comment warns against — is
      invisible to it.
    */
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useInterests(), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.chooseInterests(["sports"]);
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readInterests()).toEqual({
      status: "answered",
      interests: ["sports"],
    });
  });
});

describe("useInterestSnapshot", () => {
  it("composes the edition with the stored answer, from the first render", () => {
    seed(["sports"]);

    const { snapshots } = renderSnapshots();

    expect(present(snapshots[0], "the first render's snapshot")).toEqual([
      "sports",
    ]);
    // An empty first render is two stories arriving in a list the reader is
    // already looking at, which is the content and layout shift the lazy
    // initialiser exists to prevent.
    expect(snapshots).not.toContainEqual([]);
  });

  it("adds nothing for a device that was never asked, or cannot be read", () => {
    const { result: unasked } = renderHook(() => useInterestSnapshot(TODAY));
    expect(unasked.current).toEqual([]);

    cleanup();
    blockStorageAccess();
    const { result: unknown } = renderHook(() => useInterestSnapshot(TODAY));

    // The two are a real distinction to the picker and none at all to the
    // composition: both editions are the eight core stories and nothing added.
    expect(unknown.current).toEqual([]);
  });

  it("does not change when the reader saves", () => {
    /*
      The single most important property in this file, and what keeps the picker
      from being a reward.

      The reader is at the bottom of an edition they have read. If the
      composition followed the stored answer live, saving would rewrite the list
      above them: two stories they never saw appear in the middle of it, the
      counter drops back from having viewed everything, and the closing message
      un-says that the edition is over. That is "2 more stories unlocked" paid
      out for answering a question (section 3.2), delivered by rewriting what
      the reader was in the middle of.

      Asserted by identity, not by value: the snapshot must be the SAME array,
      because that is what tells the edition below it that nothing has changed.
    */
    seed(["sports"]);

    render(createElement(BothProbe, { date: TODAY }));
    const composedWith = probe().snapshot;
    expect(composedWith).toEqual(["sports"]);

    act(() => {
      probe().store.chooseInterests(["business-economy"]);
    });

    expect(probe().snapshot).toBe(composedWith);
    // And the picker itself moved, so a component that ignored the press cannot
    // pass this.
    expect(probe().store.read).toEqual({
      status: "answered",
      interests: ["business-economy"],
    });
  });

  it("composes the next edition with the new answer", () => {
    // The other half, and what the picker's own copy promises: "applies to the
    // next edition you open, not to this one".
    seed(["sports"]);

    render(createElement(BothProbe, { date: TODAY }));
    act(() => {
      probe().store.chooseInterests(["business-economy"]);
    });

    render(createElement(BothProbe, { date: YESTERDAY }));

    expect(probe().snapshot).toEqual(["business-economy"]);
  });

  it("has the new date's answer on its first render after a change", () => {
    // The same property one render earlier, where an effect would compose the
    // new edition with the previous one's interests and then correct itself.
    seed(["sports"]);

    const { snapshots, rerender } = renderSnapshots();
    rememberInterests(["business-economy"]);
    snapshots.length = 0;

    rerender(YESTERDAY);

    expect(
      present(snapshots[0], "the first render under the new date"),
    ).toEqual(["business-economy"]);
    expect(snapshots).not.toContainEqual(["sports"]);
  });
});
