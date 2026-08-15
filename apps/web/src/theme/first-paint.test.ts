/**
 * The pre-paint script in `index.html`, run against the real store.
 *
 * It is the only code in the reader that is not part of the bundle, and the
 * only code that reads the stored document without going through
 * `local-state.ts`. That duplication is deliberate — nothing in the bundle can
 * run before the first paint, and a module import would defer it past exactly
 * the moment it exists for — but a duplicated reader of a persisted format is
 * the classic way for a format to drift out from under one of its readers, in
 * silence, on devices.
 *
 * SO THIS FILE IS THE DRIFT GUARD, and that is its whole job. The device is
 * seeded through `rememberTheme`, the store's own writer, never a hand-written
 * JSON document: `edition-ended.test.ts` and `interests.test.ts` both state the
 * convention, and here it is not a convention but the mechanism. Renaming the
 * key, renaming the field, or bumping `schemaVersion` changes what the writer
 * produces, the script stops recognising it, and this file goes red — which is
 * the only place that drift can be caught before a reader watches their pinned
 * theme flash to the wrong one on every load.
 *
 * The negative cases below DO write documents by hand, and the difference is
 * the point: they are documents this build's writer cannot produce — a foreign
 * version, an unrecognised value — so there is no writer to seed them with.
 *
 * The script is extracted from the served document rather than copied here,
 * for the same reason. A copy would pass forever.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import {
  LOCAL_STATE_KEY,
  rememberTheme,
} from "../local-state/local-state-store";
import { THEME_ATTRIBUTE } from "./document-theme";

/**
 * The inline script from `<head>`, as text.
 *
 * Parsed with `DOMParser`, which never executes anything it parses, so the
 * source is retrieved without the document around it being built.
 */
function firstPaintScript(): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const inline = [...document.querySelectorAll("head script")].filter(
    (element) => !element.hasAttribute("src"),
  );

  // Exactly one, because "run the first inline script" would quietly start
  // testing something else the day a second one is added.
  expect(inline).toHaveLength(1);

  return inline[0]?.textContent ?? "";
}

const source = firstPaintScript();

/**
 * Runs the script the way the browser would: as a classic script body, in the
 * global scope, with no module wrapper and no imports available to it.
 */
function runFirstPaintScript(): void {
  new Function(source)();
}

/**
 * jsdom defines `localStorage` as an own configurable accessor on `window`, so
 * a replacement has to be undone by putting the original descriptor back;
 * `interests.test.ts` records the same finding.
 */
const realStorageAccess = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

beforeEach(() => {
  localStorage.clear();
  // The attribute is set on a document that outlives each test, so a leftover
  // from the previous one would satisfy the absence assertions below.
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);

  return () => {
    if (realStorageAccess !== undefined) {
      Object.defineProperty(window, "localStorage", realStorageAccess);
    }
    vi.restoreAllMocks();
  };
});

describe("the script that applies the reader's theme before the first paint", () => {
  it("applies what this build's own writer stored", () => {
    rememberTheme("dark");

    runFirstPaintScript();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("reads the key the store owns", () => {
    // The key is a literal in the served document because nothing in `<head>`
    // can import a constant. Asserting the constant appears in that literal is
    // what keeps the two spellings from diverging.
    expect(source).toContain(LOCAL_STATE_KEY);
  });

  it("leaves the OS in charge when the stored value is not one it applies", () => {
    /*
      Hand-written on purpose: no writer of this build produces it. The failure
      mode has to be identical to the fresh-device mode — no attribute, so the
      media query decides — because anything else means a reader with a slightly
      wrong document gets a page their OS did not ask for and their preference
      did not either.
    */
    localStorage.setItem(
      LOCAL_STATE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        viewedByEdition: {},
        theme: "midnight",
      }),
    );

    expect(() => {
      runFirstPaintScript();
    }).not.toThrow();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("reads nothing out of a document from a build it does not understand", () => {
    /*
      ADR-0007's rule, from the side that is easy to miss. The document below
      carries a perfectly readable `theme`, and taking it would look harmless.
      It is not: the store, obeying the same ADR, answers `system` for a foreign
      document, so the script would paint dark and the application would then
      correct it to the OS appearance at mount — manufacturing the exact flash
      this script exists to remove, only inverted and only for the readers the
      ADR is written to protect.
    */
    localStorage.setItem(
      LOCAL_STATE_KEY,
      JSON.stringify({ schemaVersion: 2, theme: "dark" }),
    );

    runFirstPaintScript();

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("survives a device where reaching storage at all throws", () => {
    /*
      Safari in private browsing, a sandboxed frame, and an origin with cookies
      blocked all raise on the PROPERTY ACCESS, before `getItem` is called —
      `device-storage.ts` documents it at length. This is why the single `try`
      wraps the access rather than the parse: an exception here is uncatchable
      by anything downstream and would abort the rest of `<head>`.
    */
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("storage is blocked", "SecurityError");
      },
    });

    expect(() => {
      runFirstPaintScript();
    }).not.toThrow();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("treats an unparseable document as a device with no preference", () => {
    localStorage.setItem(LOCAL_STATE_KEY, "{not json");

    expect(() => {
      runFirstPaintScript();
    }).not.toThrow();
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("does nothing at all on a device that has stored nothing", () => {
    runFirstPaintScript();

    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
});
