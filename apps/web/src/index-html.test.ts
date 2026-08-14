/**
 * The document a reader gets before any of this application runs.
 *
 * It is the only user-facing surface in the reader that no component owns, and
 * it has two audiences that must not be shown the same thing: a browser that
 * will run the script sees a placeholder until React mounts, and a browser that
 * will not must be told so instead. Showing both at once is the state section
 * 26 rules out -- a page claiming to be loading something it has already
 * explained it cannot load.
 *
 * Asserted against the file rather than against a rendered page because
 * `<noscript>` is inert wherever scripting is on, which includes every test
 * runner. What can be checked here is that the rule exists and applies to the
 * placeholder, which is the part that was missing.
 *
 * The document is read through the bundler (`?raw`, Vite's own, typed by
 * `vite/client`) rather than through `node:fs`, which would need the ambient
 * Node types this repository deliberately does not install --
 * `scripts/bun-runtime.d.ts` and `packages/test-fixtures` both record that
 * decision. It also resolves relative to this file, so the test does not depend
 * on a working directory.
 */
import { describe, expect, it } from "vitest";
import html from "../index.html?raw";

/** Parsed with scripting disabled, as `DOMParser` always is, so `<noscript>`
 * contents are real elements here rather than text. */
const document = new DOMParser().parseFromString(html, "text/html");

function styleRules(): string {
  return [...document.querySelectorAll("noscript style")]
    .map((element) => element.textContent ?? "")
    .join("")
    .replace(/\s+/g, "");
}

describe("the document served before the application runs", () => {
  it("shows a placeholder to a reader whose browser will run the script", () => {
    const root = document.querySelector("#root");

    expect(root?.textContent?.trim()).toBe("Loading the edition.");
  });

  it("explains itself to a reader whose browser will not", () => {
    const notice = document.querySelector("body noscript");

    expect(notice?.textContent).toContain("needs JavaScript");
    expect(notice?.querySelector("a")).toHaveProperty(
      "href",
      expect.stringContaining("/content/latest.json"),
    );
  });

  it("hides the placeholder from that reader, so the page says one thing", () => {
    // Without this the page claims to be loading an edition immediately above
    // the notice explaining that it cannot load one.
    expect(styleRules()).toContain("#root{display:none");
  });
});
