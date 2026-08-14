/**
 * The address bar is the route's only copy, so these tests drive the real
 * `window.history` rather than a stand-in. `useSyncExternalStore` is the unit
 * under test and is never mocked: what is asserted is that the hook reports
 * what the browser actually shows, through every way the address can change —
 * an in-product link, the back button, and the first render.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, useRoute } from "./use-route";

const EDITION_PATH = "/edition/2026-07-21";
const OTHER_EDITION_PATH = "/edition/2026-07-20";

/** Sets the starting address without adding a history entry. */
function startAt(pathname: string): void {
  window.history.replaceState(null, "", pathname);
}

beforeEach(() => {
  // jsdom has no layout and warns on window.scrollTo; navigate's scroll to the
  // top of the new view is asserted below rather than left to print.
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useRoute", () => {
  it("reports the route the address bar is already showing", () => {
    startAt(EDITION_PATH);

    const { result } = renderHook(() => useRoute());

    expect(result.current).toEqual({ kind: "edition", date: "2026-07-21" });
  });

  it("reports the root as the latest edition", () => {
    startAt("/");

    const { result } = renderHook(() => useRoute());

    expect(result.current).toEqual({ kind: "latest" });
  });

  it("reports an address the product does not serve rather than resolving it", () => {
    startAt("/archive");

    const { result } = renderHook(() => useRoute());

    expect(result.current).toEqual({ kind: "unknown", path: "/archive" });
  });
});

describe("navigate", () => {
  it("moves the address bar and the route together", () => {
    startAt("/");
    const pushState = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useRoute());

    act(() => {
      navigate(EDITION_PATH);
    });

    expect(window.location.pathname).toBe(EDITION_PATH);
    expect(result.current).toEqual({ kind: "edition", date: "2026-07-21" });
    // pushState, not replaceState: the previous edition stays reachable with
    // the back button.
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(null, "", EDITION_PATH);
    // The reader lands at the top of the edition they asked for, not part-way
    // down it at the old view's scroll position.
    expect(vi.mocked(window.scrollTo)).toHaveBeenCalledWith(0, 0);
  });

  it("notifies every mounted reader of the same route", () => {
    startAt("/");

    const first = renderHook(() => useRoute());
    const second = renderHook(() => useRoute());

    act(() => {
      navigate(EDITION_PATH);
    });

    expect(first.result.current).toEqual(second.result.current);
    expect(second.result.current).toEqual({
      kind: "edition",
      date: "2026-07-21",
    });
  });
});

describe("the back button", () => {
  it("returns the route to the previous edition", async () => {
    startAt(OTHER_EDITION_PATH);

    const { result } = renderHook(() => useRoute());

    act(() => {
      navigate(EDITION_PATH);
    });

    expect(result.current).toEqual({ kind: "edition", date: "2026-07-21" });

    // The browser changes the address and then fires popstate; pushState does
    // not fire it, which is why navigate notifies subscribers itself.
    act(() => {
      window.history.back();
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        kind: "edition",
        date: "2026-07-20",
      }),
    );
    expect(window.location.pathname).toBe(OTHER_EDITION_PATH);
  });
});

describe("the subscription", () => {
  it("is removed on unmount", () => {
    startAt("/");
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useRoute());

    const added = addEventListener.mock.calls
      .filter(([type]) => type === "popstate")
      .map(([, handler]) => handler);
    expect(added.length).toBeGreaterThan(0);

    unmount();

    const removed = removeEventListener.mock.calls
      .filter(([type]) => type === "popstate")
      .map(([, handler]) => handler);
    expect(removed).toEqual(added);
  });

  it("stops re-rendering an unmounted reader", () => {
    startAt("/");
    let renders = 0;

    const { unmount } = renderHook(() => {
      renders += 1;
      return useRoute();
    });

    unmount();
    const rendersAtUnmount = renders;

    act(() => {
      navigate(EDITION_PATH);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(renders).toBe(rendersAtUnmount);
  });
});

describe("navigating to the address already shown", () => {
  /**
   * A duplicate entry would leave the reader pressing back once with nothing
   * appearing to happen, which reads as a broken product.
   */
  it("adds no history entry for the address already shown", () => {
    startAt(EDITION_PATH);
    const pushState = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useRoute());

    act(() => {
      navigate(EDITION_PATH);
    });

    expect(result.current).toEqual({ kind: "edition", date: "2026-07-21" });
    expect(pushState).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(EDITION_PATH);
  });
});
