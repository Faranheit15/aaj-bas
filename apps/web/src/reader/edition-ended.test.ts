import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readEditionEnded,
  rememberEnded,
} from "../local-state/local-state-store";
import { useEditionEnded } from "./edition-ended";

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

/**
 * Puts an ended edition on the device before the hook runs, through the store's
 * own writer.
 *
 * Deliberately not a hand-written JSON document. What the stored document looks
 * like is `local-state.ts`'s business, and a test that spelled the field out
 * here would fail the day that layout changes for a reason this hook does not
 * care about. Writing through `rememberEnded` seeds exactly what a previous
 * session would have left behind.
 */
function seedEnded(editionDate: string): void {
  rememberEnded(editionDate);
}

function renderStore(editionDate = TODAY) {
  return renderHook(({ date }: { date: string }) => useEditionEnded(date), {
    initialProps: { date: editionDate },
  });
}

/**
 * `hasEnded` as of EVERY render, in order.
 *
 * `renderHook().result.current` cannot express the property this file is meant
 * to protect. Testing Library wraps `render` in `act`, which flushes effects
 * before returning, so `result.current` is the state after everything has
 * settled and never the value the first render produced. A hook that started
 * `false` and loaded in an effect reads identically through it.
 *
 * Recording from inside the render body is the way to see underneath that.
 * Pushing during render is a side effect, and here it is the point: the array
 * IS the render history, and a leading `false` where `true` is expected is the
 * end-edition control flashing back at a reader who already ended.
 */
function renderedFlags(editionDate = TODAY): boolean[] {
  const flags: boolean[] = [];

  function Probe({ date }: { date: string }): null {
    flags.push(useEditionEnded(date).hasEnded);
    return null;
  }

  render(createElement(Probe, { date: editionDate }));

  return flags;
}

describe("useEditionEnded", () => {
  it("has not ended on a device that has never seen this edition", () => {
    const { result } = renderStore();

    expect(result.current.hasEnded).toBe(false);
  });

  it("ends the edition when the reader asks, and remembers it", () => {
    const { result } = renderStore();

    act(() => {
      result.current.endEdition();
    });

    expect(result.current.hasEnded).toBe(true);
    expect(readEditionEnded(TODAY)).toBe(true);
    // One key, the documented one, and nothing in `sessionStorage`.
    expect(localStorage.length).toBe(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("stays ended across a second press", () => {
    const { result } = renderStore();

    act(() => {
      result.current.endEdition();
    });
    act(() => {
      result.current.endEdition();
    });

    expect(result.current.hasEnded).toBe(true);
    expect(readEditionEnded(TODAY)).toBe(true);
  });

  it("reflects a stored ended edition on the very first render", () => {
    /*
      Asserted BEFORE any `act`, which is the point: the read is synchronous,
      so the lazy initialiser makes the first render already correct.
    */
    seedEnded(TODAY);

    const { result } = renderStore();

    expect(result.current.hasEnded).toBe(true);
  });

  it("has the stored ending already on the first render, not after one", () => {
    /*
      The assertion above is weaker than it reads, and this is the one that
      carries the claim. `render` is wrapped in `act`, so by the time `result`
      can be inspected the effects have run, and a hook that started `false`
      and filled itself in an effect passes it unchanged while still showing
      the reader the end-edition control for one frame before withdrawing it.

      That flash is what "state persists on reload" fails to mean if it is only
      eventually true, so the render history is asserted rather than the
      settled value.
    */
    seedEnded(TODAY);

    const flags = renderedFlags();

    expect(flags[0]).toBe(true);
    expect(flags).not.toContain(false);
  });

  it("keeps one edition's ending out of another", () => {
    // Ending is a fact about one edition. Nothing here accumulates across
    // dates, which is what keeps it from becoming a record of how many
    // editions the reader finished.
    const { result, rerender } = renderStore();

    act(() => {
      result.current.endEdition();
    });
    rerender({ date: YESTERDAY });

    expect(result.current.hasEnded).toBe(false);
    expect(readEditionEnded(YESTERDAY)).toBe(false);
    expect(readEditionEnded(TODAY)).toBe(true);
  });

  it("re-reads the device when the edition date changes", () => {
    seedEnded(YESTERDAY);

    const { result, rerender } = renderStore();
    expect(result.current.hasEnded).toBe(false);

    rerender({ date: YESTERDAY });

    expect(result.current.hasEnded).toBe(true);
  });

  it("has the new date's stored state on its first render after a change", () => {
    // The same no-flash property across a prop change, where an effect would
    // show the PREVIOUS edition's ending under the new date — an archive
    // edition the reader has never opened appearing already finished.
    seedEnded(TODAY);

    const flags: boolean[] = [];
    function Probe({ date }: { date: string }): null {
      flags.push(useEditionEnded(date).hasEnded);
      return null;
    }

    const { rerender } = render(createElement(Probe, { date: TODAY }));
    flags.length = 0;
    rerender(createElement(Probe, { date: YESTERDAY }));

    expect(flags[0]).toBe(false);
    expect(flags).not.toContain(true);
  });

  it("writes nothing when the reader only opens the edition", () => {
    // Browsing leaves no trace: the first byte lands when the reader presses
    // the control, not when they arrive.
    renderStore();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("still ends in memory when storage cannot be reached", () => {
    // Safari private browsing, blocked cookies, a sandboxed iframe: the
    // property access throws before any method is called. The reader's edition
    // ends exactly as it does for everyone else, and nothing about the refused
    // write reaches the screen.
    blockStorageAccess();

    const { result } = renderStore();
    expect(result.current.hasEnded).toBe(false);

    act(() => {
      result.current.endEdition();
    });

    expect(result.current.hasEnded).toBe(true);
  });

  it("writes once per press under StrictMode's double rendering", () => {
    /*
      React double-invokes lazy initialisers and state updaters to surface
      impure ones, and does not double-invoke event handlers. The write lives
      in the handler for exactly that reason.

      Counted, not just read back. The write is idempotent, so a second one
      leaves byte-identical content behind: asserting what is STORED passes
      whether the write happened once or twice, and moving `rememberEnded`
      inside the updater — the impure-updater bug the comment in the hook warns
      against — is invisible to it. The call count is the only thing that can
      tell the two apart.
    */
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useEditionEnded(TODAY), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.endEdition();
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current.hasEnded).toBe(true);
    expect(readEditionEnded(TODAY)).toBe(true);
  });
});
