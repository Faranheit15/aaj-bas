/**
 * The document a visitor gets before this application runs.
 *
 * The reader has had a file like this since AB-205. The landing page had none,
 * and its browser chrome was one careless edit from the bug ADR-0009 records
 * as fixed with nothing failing anywhere: deleting both `theme-color` metas
 * restored the pre-slice state exactly, and swapping the two values produced
 * something worse than the original — dark chrome sitting above a cream page.
 *
 * ADR-0009 states the chrome consequence for the product, not for one
 * application, so it needs asserting in both. This file is the landing half,
 * and it mirrors the reader's `index-html.test.ts` rather than inventing a
 * second idiom: the values are read out of `palette.css` and compared, never
 * written down here, so retuning a page background cannot leave the chrome
 * behind. That was the original bug and it went unnoticed precisely because
 * nothing connected the two files.
 *
 * There is no pre-paint script to assert, and its absence is correct rather
 * than missing. This application stores nothing on a device and offers no
 * appearance control — the two Cloudflare Pages projects are separate origins,
 * so a control here could not read the reader's answer — so the operating
 * system is the only opinion there is, and the media queries answer it with no
 * script involved.
 *
 * The document is read through the bundler (`?raw`, Vite's own, typed by
 * `vite/client`) rather than through `node:fs`, which would need the ambient
 * Node types this repository deliberately does not install. It also resolves
 * relative to this file, so the test does not depend on a working directory.
 */
import palette from "@aaj-bas/ui/palette.css?raw";
import { describe, expect, it } from "vitest";
import html from "../index.html?raw";

/** `DOMParser` never executes what it parses, so this builds no page. */
const document = new DOMParser().parseFromString(html, "text/html");

/** The palette with its comments removed; they name values they do not set. */
const paletteDeclarations = palette.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The page background of each appearance, taken from the palette itself.
 *
 * The unconditional `:root` block is matched by requiring the brace to follow
 * the selector directly, which `:root:not(...)` and `:root[data-theme="dark"]`
 * both fail -- so this needs no assumption about the order blocks appear in.
 * Everything else that sets `--surface` is an override, and the palette permits
 * exactly one distinct value across them; the reader's `palette.test.ts` is
 * where that agreement is enforced, and here it is relied on and checked.
 */
function paletteSurfaces(): { readonly light: string; readonly dark: string } {
  const base = /:root\s*\{([^}]*)\}/.exec(paletteDeclarations)?.[1] ?? "";
  const light = /--surface:\s*(#[0-9a-f]{3,8})/i.exec(base)?.[1];
  const all = [
    ...paletteDeclarations.matchAll(/--surface:\s*(#[0-9a-f]{3,8})/gi),
  ].map((match) => match[1]);
  const overrides = [...new Set(all)].filter((value) => value !== light);

  if (
    light === undefined ||
    overrides.length !== 1 ||
    overrides[0] === undefined
  ) {
    throw new Error("the palette no longer defines exactly two page surfaces");
  }

  return { light, dark: overrides[0] };
}

describe("the appearance the landing document carries", () => {
  /** Every `<meta name="theme-color">`, in document order. */
  const chrome = [...document.querySelectorAll('meta[name="theme-color"]')];

  it("colours the browser chrome to match each page background", () => {
    /*
      Three failures in one assertion, and all three were green before it.

      Deleting both metas restores the single-value state ADR-0009 says this
      slice fixed: cream chrome above a #181b18 page for every visitor on a
      dark device. Swapping the two `media` conditions is worse than the
      original, because it is wrong in both directions at once. And changing a
      value so it no longer matches `--surface` is the drift the metas exist to
      be held against — which is why the values are compared to the palette
      rather than written down a second time here.

      These follow the OPERATING SYSTEM, and on this page that is the whole
      story: there is no stored preference here to disagree with it.
    */
    const { light, dark } = paletteSurfaces();
    const byQuery = new Map(
      chrome.map((meta) => [
        meta.getAttribute("media"),
        meta.getAttribute("content"),
      ]),
    );

    expect(chrome).toHaveLength(2);
    expect(byQuery.get("(prefers-color-scheme: light)")).toBe(light);
    expect(byQuery.get("(prefers-color-scheme: dark)")).toBe(dark);
  });

  it("animates nothing, in the one place no stylesheet test can see", () => {
    /*
      `styles.test.ts` forbids motion in `styles.css` and `palette.test.ts`
      forbids it in the palette, which between them cover every stylesheet this
      application ships -- and leave the document itself. A `<style>` block here
      is CSS that no no-motion assertion reads, and the reader's document
      already ships one for its `noscript` rule, so it is an established place
      to put CSS rather than a hypothetical one.

      ADR-0009 claims there is no motion anywhere in this product. This is one
      of the two files that has to be read for that to be a fact.

      There is no `<style>` in this document today, so this asserts an absence
      over an empty string. That is the assertion: it fails on the day one is
      added carrying motion, which is the only day it could ever matter.
    */
    const inline = [...document.querySelectorAll("style")]
      .map((element) => element.textContent ?? "")
      .join("");

    expect(inline).not.toMatch(/@keyframes/i);
    expect(inline).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(inline).not.toMatch(/\btransition[a-z-]*\s*:/i);
    expect(inline).not.toMatch(/scroll-behavior\s*:\s*smooth/i);
  });
});
