/**
 * The document a reader gets before any of this application runs.
 *
 * It is the only user-facing surface in the reader that no component owns, and
 * it does two jobs no component can do.
 *
 * The first is to address two audiences that must not be shown the same thing:
 * a browser that will run the script sees a placeholder until React mounts, and
 * a browser that will not must be told so instead. Showing both at once is the
 * state section 26 rules out -- a page claiming to be loading something it has
 * already explained it cannot load.
 *
 * The second arrived with AB-205 and is a matter of timing rather than
 * audience. The reader's stored appearance has to be on the document element
 * BEFORE the first paint, and every line of the bundle runs after it, so the
 * pre-paint script and the two `theme-color` metas live here and can live
 * nowhere else. What this file asserts about them is their SHAPE -- a classic
 * synchronous script, and chrome colours that match the palette. Their
 * behaviour is asserted in `theme/first-paint.test.ts`, which runs the script;
 * the two halves are separate because the shape is what a well-meant tidy-up
 * would change, and a tidy-up that turns the script into a module breaks
 * nothing a behavioural test can see.
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
import palette from "@aaj-bas/ui/palette.css?raw";
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

  it("animates nothing, in the one place no stylesheet test can see", () => {
    /*
      `styles.test.ts` forbids motion in `styles.css` and `palette.test.ts`
      forbids it in the palette, which between them cover every stylesheet the
      reader ships -- and leave the document itself. The `<style>` above proves
      this file is already a home for CSS, so `transition: all 300ms` written
      into a second one is not a hypothetical: it is the shortest way to put
      motion into this product past every assertion that exists to keep it out.

      ADR-0009 claims there is no motion anywhere in this product. This is one
      of the two files that has to be read for that to be a fact; the landing
      page's `index-html.test.ts` is the other.

      Every `<style>` in the document, not only the `noscript` one the assertion
      above reads: a block added outside `<noscript>` would be the more likely
      placement and the one the existing helper cannot see.
    */
    const inline = [...document.querySelectorAll("style")]
      .map((element) => element.textContent ?? "")
      .join("");

    // Non-vacuous: the `noscript` rule is in here, so an empty string means
    // the document was not read rather than that it declares no motion.
    expect(inline).toContain("#root");
    expect(inline).not.toMatch(/@keyframes/i);
    expect(inline).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(inline).not.toMatch(/\btransition[a-z-]*\s*:/i);
    expect(inline).not.toMatch(/scroll-behavior\s*:\s*smooth/i);
  });
});

/** The palette with its comments removed; they name values they do not set. */
const paletteDeclarations = palette.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The page background of each appearance, taken from the palette itself.
 *
 * The unconditional `:root` block is matched by requiring the brace to follow
 * the selector directly, which `:root:not(...)` and `:root[data-theme="dark"]`
 * both fail -- so this needs no assumption about the order blocks appear in.
 * Everything else that sets `--surface` is an override, and the palette permits
 * exactly one distinct value across them; `palette.test.ts` is where that
 * agreement is enforced, and here it is relied on and checked.
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

describe("the appearance the document carries before the bundle runs", () => {
  /** Every `<meta name="theme-color">`, in document order. */
  const chrome = [...document.querySelectorAll('meta[name="theme-color"]')];

  it("colours the browser chrome to match each page background", () => {
    /*
      This was a single `content="#f7f4ef"` and it was wrong for every reader on
      a dark device: cream chrome sitting directly above a #181b18 page. The
      values are asserted against the palette rather than written down twice, so
      retuning a page background cannot leave the chrome behind -- which is
      precisely the bug being fixed here, and it went unnoticed because nothing
      connected the two files.

      These follow the OPERATING SYSTEM, not `data-theme`. A reader who pins
      dark on a light OS still gets cream chrome. Closing that would take a
      `matchMedia` subscription maintained for the chrome alone, reintroducing
      the listener that "system means no attribute" was designed to delete, and
      it is chrome rather than content: visibly imperfect, never misleading.
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

  it("applies the stored appearance from a classic synchronous script", () => {
    /*
      THE SHAPE IS THE ASSERTION. The stylesheet is render-blocking but the
      bundle is a module, and modules are deferred, so the page paints with the
      OS appearance while the module waits -- a reader who pinned the other one
      watches it repaint. Only a classic script in `<head>` runs early enough.

      `type="module"`, `defer` and `async` each move it back past the paint and
      restore that flash, and none of them changes what the script DOES, so
      `first-paint.test.ts` would stay green through all three. Making the
      script a module is the natural tidy-up for someone standardising the
      file; this is the assertion that stops it.
    */
    const inline = [...document.querySelectorAll("head script")].filter(
      (element) => !element.hasAttribute("src"),
    );

    expect(inline).toHaveLength(1);
    const script = inline[0];
    expect(script?.hasAttribute("type")).toBe(false);
    expect(script?.hasAttribute("defer")).toBe(false);
    expect(script?.hasAttribute("async")).toBe(false);
    // Non-empty, so none of the above can be satisfied by an empty tag.
    expect(script?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("runs before anything that could paint the wrong appearance first", () => {
    // Document order matters as much as the script's shape: placed after the
    // bundle's own tag it would still be classic and still be too late.
    const nodes = [
      ...document.querySelectorAll("script, link[rel=stylesheet]"),
    ];
    const inlineAt = nodes.findIndex((node) => !node.hasAttribute("src"));
    const bundleAt = nodes.findIndex((node) => node.hasAttribute("src"));

    expect(inlineAt).toBeGreaterThanOrEqual(0);
    expect(bundleAt).toBeGreaterThan(inlineAt);
  });
});
