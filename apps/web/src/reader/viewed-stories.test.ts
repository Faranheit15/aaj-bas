import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useViewedStories } from "./viewed-stories";

const TODAY = "2026-08-13";
const YESTERDAY = "2026-08-12";

afterEach(() => {
  cleanup();
});

function renderStore(editionDate = TODAY) {
  return renderHook(({ date }: { date: string }) => useViewedStories(date), {
    initialProps: { date: editionDate },
  });
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

  it("does not persist anything to browser storage", () => {
    // Executable proof that AB-301 has not been started early here. Section 17
    // requires persisted state to be versioned, validated and migratable, so an
    // unversioned key written now would become a legacy format on readers'
    // devices before AB-301 exists to migrate it.
    const { result } = renderStore();

    act(() => {
      result.current.markViewed("story-0");
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
