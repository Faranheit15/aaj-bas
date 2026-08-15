import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../local-state/local-state";
import { readTheme, rememberTheme } from "../local-state/local-state-store";
import { THEME_ATTRIBUTE } from "../theme/document-theme";
import documentTheme from "../theme/document-theme.ts?raw";
import { useTheme } from "./theme";
import hook from "./theme.ts?raw";

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

/** Makes the write, and only the write, fail — quota, as a full device does. */
function refuseWrites(): void {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  });
}

/** What the document element is currently overridden to, if anything. */
function appliedTheme(): string | null {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE);
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
  // jsdom keeps one storage area and one document for the whole file, so
  // without these two a choice outlives the test that made it.
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

/**
 * Puts an answer on the device before the hook runs, through the store's own
 * writer.
 *
 * Deliberately not a hand-written JSON document, for the reason
 * `interests.test.ts` gives: what the stored document looks like is
 * `local-state.ts`'s business, and a test that spelled the field out here would
 * fail the day that layout changed for a reason this hook does not care about.
 */
function seed(theme: Theme): void {
  rememberTheme(theme);
}

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }

  return value;
}

/**
 * The theme as of EVERY render, in order.
 *
 * `renderHook().result.current` cannot express the property this hook exists to
 * have. Testing Library wraps `render` in `act`, which flushes effects before
 * returning, so `result.current` is the state after everything has settled — a
 * hook that started at the default and loaded the stored answer in an effect
 * reads identically through it, and that hook is exactly the one this file has
 * to fail.
 *
 * The render history cannot be fooled that way. A first render of "system" is a
 * reader who chose dark being shown the appearance their device happens to
 * prefer, for a frame, in a bundle that already knew better.
 */
function renderedThemes(): Theme[] {
  const themes: Theme[] = [];

  function Probe(): null {
    themes.push(useTheme().theme);

    return null;
  }

  render(createElement(Probe));

  return themes;
}

/** Each source file with its comments stripped, for the assertions below. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("useTheme", () => {
  it("has the stored theme on the very first render, not after one", () => {
    /*
      Asserted across the render history rather than on `result.current`, which
      is the state after `act` has flushed every effect and would pass for a
      hook that loaded in one.

      What a wrong first render costs here is a flash of the other palette on
      every load — a white page in front of a reader who chose dark, arriving
      after the inline script in the document had already got it right.
    */
    seed("dark");

    const themes = renderedThemes();

    expect(present(themes[0], "the first render's theme")).toBe("dark");
    expect(themes).not.toContain("system");
  });

  it("keeps the reader's choice across a reload", () => {
    // AB-205's acceptance criterion: the preference persists locally. A hook
    // holding it in memory alone passes every other test in this file.
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.chooseTheme("dark");
    });

    expect(readTheme()).toBe("dark");

    cleanup();
    const { result: afterReload } = renderHook(() => useTheme());

    expect(afterReload.current.theme).toBe("dark");
  });

  it("puts the chosen appearance on the document", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.chooseTheme("dark");
    });

    expect(appliedTheme()).toBe("dark");
  });

  it("leaves the document with no attribute at all when the reader chooses system", () => {
    /*
      The mechanism of the whole slice, asserted as an ABSENCE.

      `dataset.theme = "system"` would be the symmetrical thing to write and
      would break the one behaviour this reader asked for: the palette keys
      dark off `prefers-color-scheme` as well as off this attribute, so taking
      the attribute off hands the question back to the operating system, live.
      A reader who chose system and then switches their device to dark at
      sunset sees the page follow — with no listener, no subscription, and no
      render in which this build's idea of their system appearance is stale.
    */
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.chooseTheme("dark");
    });
    expect(appliedTheme()).toBe("dark");

    act(() => {
      result.current.chooseTheme("system");
    });

    expect(appliedTheme()).toBeNull();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("still changes appearance on a device that refuses the write", () => {
    /*
      Safari private browsing, blocked cookies, a full device. The reader
      pressed the control and the page has already changed colour; reverting it
      because the device would not remember it takes dark away from someone who
      just asked for it, to keep a promise about tomorrow they were never made.

      This is why `rememberTheme` returns nothing, where `rememberInterests`
      returns a boolean: an interest choice has no visible effect to protect,
      so there a refused write is the whole of the story and must be reported.
      Here the report goes to the console, once, and the reader keeps what they
      chose for the session.
    */
    refuseWrites();
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.chooseTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(appliedTheme()).toBe("dark");
    // And the device really did keep nothing, so the next load is the system
    // appearance rather than a lie about what was stored.
    expect(readTheme()).toBe("system");
  });

  it("writes once per choice under StrictMode's double rendering", () => {
    /*
      React double-invokes lazy initialisers and state updaters to surface
      impure ones, and does not double-invoke event handlers. The write lives in
      the handler for exactly that reason.

      Counted, not read back. The write is idempotent, so a second one leaves
      the device holding byte-identical content: asserting what is STORED
      passes whether it happened once or twice.
    */
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const { result } = renderHook(() => useTheme(), { wrapper: StrictMode });

    act(() => {
      result.current.chooseTheme("dark");
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readTheme()).toBe("dark");
  });
});

/**
 * The two files that decide what a reader sees, read as source text.
 *
 * Every assertion above is about what this code DOES, and none of them can
 * catch the refactor that matters most here: resolving "system" in JavaScript.
 * A hook that called `matchMedia("(prefers-color-scheme: dark)")` and wrote
 * `data-theme="dark"` would pass every test in this file — the reader still
 * gets the right palette — while quietly moving the live-following property
 * off the stylesheet and onto this code, which then needs a listener to keep
 * it current, has a render in which it is stale, and cannot answer at all
 * until the script runs.
 *
 * So the absence is what is asserted, in the style
 * `interests-stay-on-device.test.ts` uses for the network. Read through the
 * bundler (`?raw`, Vite's own, typed by `vite/client`) rather than through
 * `node:fs`, which would need the ambient Node types this repository
 * deliberately does not install, and which resolves relative to this file so
 * the test does not depend on a working directory.
 */
const FILES = [
  {
    path: "reader/theme.ts",
    source: hook,
    contains: "export function useTheme",
  },
  {
    path: "theme/document-theme.ts",
    source: documentTheme,
    contains: "export function applyTheme",
  },
] as const;

describe("what the reader's system prefers", () => {
  it("is written by the two files these assertions are about", () => {
    // Every assertion below is an absence, and an empty string — a moved file,
    // a `?raw` import that silently resolved to nothing — satisfies all of
    // them at once.
    for (const { path, source, contains } of FILES) {
      expect(withoutComments(source), path).toContain(contains);
    }
  });

  it("is nothing this code ever asks: no matchMedia, in either file", () => {
    for (const { path, source } of FILES) {
      expect(withoutComments(source), path).not.toMatch(/matchMedia/);
    }
  });
});
