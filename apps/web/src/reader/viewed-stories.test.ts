import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localStateV1Schema } from "../local-state/local-state";
import { LOCAL_STATE_KEY } from "../local-state/local-state-store";
import { useViewedStories } from "./viewed-stories";

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

beforeEach(() => {
  // One test provokes the store's warning on purpose; silencing it keeps the
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

/** A document as this build writes it, put on the device before the hook runs. */
function seed(entries: Record<string, readonly string[]>): void {
  localStorage.setItem(
    LOCAL_STATE_KEY,
    JSON.stringify({ schemaVersion: 1, viewedByEdition: entries }),
  );
}

/** What the device holds for one edition, read back through the real schema. */
function storedIdsFor(editionDate: string): readonly string[] {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (raw === null) {
    return [];
  }

  const document = localStateV1Schema.parse(JSON.parse(raw));

  return document.viewedByEdition[editionDate] ?? [];
}

function renderStore(editionDate = TODAY) {
  return renderHook(({ date }: { date: string }) => useViewedStories(date), {
    initialProps: { date: editionDate },
  });
}

/**
 * The size of the viewed set as of EVERY render, in order.
 *
 * `renderHook().result.current` cannot express the property this file is meant
 * to protect. Testing Library wraps `render` in `act`, which flushes effects
 * before returning, so `result.current` is the state after everything has
 * settled and never the value the first render produced. A hook that started
 * empty and loaded in an effect reads identically through it — which is
 * precisely the implementation the comment at the top of `viewed-stories.ts`
 * says this one is not.
 *
 * Recording from inside the render body is the way to see underneath that.
 * Pushing during render is a side effect, and here it is the point: the array
 * IS the render history, and `[0, 2]` where `[2]` is expected is the flash a
 * reader would see.
 */
function renderedSizes(editionDate = TODAY): number[] {
  const sizes: number[] = [];

  function Probe({ date }: { date: string }): null {
    sizes.push(useViewedStories(date).viewed.storyIds.size);
    return null;
  }

  render(createElement(Probe, { date: editionDate }));

  return sizes;
}

describe("useViewedStories", () => {
  it("starts with nothing viewed", () => {
    const { result } = renderStore();

    expect(result.current.viewed.editionDate).toBe(TODAY);
    expect(result.current.viewed.storyIds.size).toBe(0);
    expect(result.current.viewed.storyIds.has("story-0")).toBe(false);
  });

  it("records the story that was marked, and only that one", () => {
    // Read straight off `viewed`, which is the whole read surface: the store
    // exports no `isViewed`, because nothing in the product asks about a single
    // story. AB-203 adds whatever accessor its ending summary actually needs.
    const { result } = renderStore();

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(result.current.viewed.storyIds.has("story-0")).toBe(true);
    expect(result.current.viewed.storyIds.has("story-1")).toBe(false);
  });

  it("treats a second mark of the same story as a no-op", () => {
    const { result } = renderStore();

    act(() => {
      result.current.markViewed("story-0");
    });
    const afterFirst = result.current.viewed;

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(result.current.viewed.storyIds.size).toBe(1);
    expect(result.current.viewed).toBe(afterFirst);
  });

  it("empties the set when the edition date changes", () => {
    // The property that makes the seam real: yesterday's viewed stories can
    // never be counted against today's edition, whichever way the reader
    // navigates between them.
    const { result, rerender } = renderStore();

    act(() => {
      result.current.markViewed("story-0");
    });
    rerender({ date: YESTERDAY });

    expect(result.current.viewed.editionDate).toBe(YESTERDAY);
    expect(result.current.viewed.storyIds.size).toBe(0);
    expect(result.current.viewed.storyIds.has("story-0")).toBe(false);
  });
});

describe("the device-backed half", () => {
  it("records the marked story on the device, under this edition's date", () => {
    /*
      The positive counterpart of the assertion this file used to carry. Until
      AB-301 landed, "does not persist anything to browser storage" was the
      executable statement that the durable half had not been built; replacing
      it with "now, and exactly this" is the seam closing correctly rather than
      a guarantee being dropped. What has NOT changed is the hook's signature,
      which every test above still exercises unaltered.
    */
    const { result } = renderStore();

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(storedIdsFor(TODAY)).toEqual(["story-0"]);
    // One key, the documented one, and nothing in `sessionStorage`.
    expect(localStorage.length).toBe(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("reflects a stored set on the very first render", () => {
    /*
      Asserted BEFORE any `act`, which is the point: the read is synchronous,
      so the lazy initialiser makes the first render already correct. A hook
      that loaded in an effect would pass an assertion made after a render
      cycle while still flashing an empty set at the reader, and AB-203's
      counter would settle from a wrong number to the right one.
    */
    seed({ [TODAY]: ["story-0", "story-3"] });

    const { result } = renderStore();

    expect(result.current.viewed.editionDate).toBe(TODAY);
    expect([...result.current.viewed.storyIds]).toEqual(["story-0", "story-3"]);
  });

  it("has the stored set already on the first render, not after one", () => {
    /*
      The assertion above is weaker than it reads, and this is the one that
      carries the claim. `render` is wrapped in `act`, so by the time `result`
      can be inspected the effects have run and a hook that started empty and
      filled itself in an effect passes it unchanged.

      The render history cannot be fooled that way: this hook renders once,
      with two, and an effect-loading one renders twice, showing zero first.
      That first value is what AB-203's "6 of 10" counter would put on screen
      before correcting itself, and ADR-0007's claim that section 26 does not
      apply here — no loading state, because there is no render in which the
      number is wrong — is exactly this array having no wrong entry in it.
    */
    seed({ [TODAY]: ["story-0", "story-3"] });

    const sizes = renderedSizes();

    expect(sizes[0]).toBe(2);
    expect(sizes).not.toContain(0);
  });

  it("has the new date's stored set on its first render after a change", () => {
    // The same property across a prop change, where an effect would show the
    // PREVIOUS edition's count under the new date rather than an empty one.
    seed({ [TODAY]: ["story-0", "story-3"], [YESTERDAY]: ["story-7"] });

    const sizes: number[] = [];
    function Probe({ date }: { date: string }): null {
      sizes.push(useViewedStories(date).viewed.storyIds.size);
      return null;
    }

    const { rerender } = render(createElement(Probe, { date: TODAY }));
    sizes.length = 0;
    rerender(createElement(Probe, { date: YESTERDAY }));

    expect(sizes[0]).toBe(1);
    expect(sizes).not.toContain(2);
  });

  it("loads the new date's stored set when the edition date changes", () => {
    seed({ [TODAY]: ["story-0"], [YESTERDAY]: ["story-7", "story-9"] });

    const { result, rerender } = renderStore();
    expect([...result.current.viewed.storyIds]).toEqual(["story-0"]);

    rerender({ date: YESTERDAY });

    expect(result.current.viewed.editionDate).toBe(YESTERDAY);
    expect([...result.current.viewed.storyIds]).toEqual(["story-7", "story-9"]);
  });

  it("is empty for an edition the device has nothing stored for", () => {
    seed({ [TODAY]: ["story-0"] });

    const { result, rerender } = renderStore();
    rerender({ date: "2026-08-01" });

    expect(result.current.viewed.editionDate).toBe("2026-08-01");
    expect(result.current.viewed.storyIds.size).toBe(0);
  });

  it("writes once per mark under StrictMode's double rendering", () => {
    /*
      React double-invokes lazy initialisers and state updaters to surface
      impure ones, and does not double-invoke event handlers. The write lives
      in the handler for exactly that reason.

      Counted, not just read back. The write is idempotent, so a second one
      leaves byte-identical content behind: asserting what is STORED passes
      whether the write happened once or twice, and moving `rememberViewed`
      inside the updater — the impure-updater bug the comment in the hook
      warns against — is invisible to it. The call count is the only thing
      that can tell the two apart, and it is what a device with a slow disk
      and a reader opening eight cards actually pays.
    */
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useViewedStories(TODAY), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(storedIdsFor(TODAY)).toEqual(["story-0"]);
    expect(result.current.viewed.storyIds.size).toBe(1);
  });

  it("writes nothing when the reader only opens the edition", () => {
    // Browsing leaves no trace: the first byte lands when the reader expands
    // their first story, not when they arrive.
    renderStore();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("still records in memory when storage cannot be reached", () => {
    // Safari private browsing, blocked cookies, a sandboxed iframe: the
    // property access throws before any method is called. The reader's edition
    // behaves exactly as it did before persistence existed.
    blockStorageAccess();

    const { result } = renderStore();
    expect(result.current.viewed.storyIds.size).toBe(0);

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(result.current.viewed.editionDate).toBe(TODAY);
    expect(result.current.viewed.storyIds.has("story-0")).toBe(true);
  });
});
