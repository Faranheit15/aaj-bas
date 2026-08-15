/**
 * The web app manifest, and the file where it is argued.
 *
 * JSON carries no comments, so every decision the manifest encodes has to be
 * written down somewhere else or not at all. This is that place, and the
 * decisions are asserted immediately below each explanation rather than only
 * described.
 *
 * **`display: "minimal-ui"`, not `standalone`.** The installed application
 * keeps the browser's back and reload controls. That is a product call and it
 * is load-bearing for this slice specifically: everything AB-206 adds is a
 * cache in front of the reader, and the recovery story for a cached shell that
 * is wrong — a half-written precache, a bundle a worker refuses to replace — is
 * that the reader reloads. `standalone` deletes the control that does it and
 * leaves them with an application they can only uninstall.
 *
 * **No `icons` array, and that is the mechanism rather than an omission.**
 * Section 27 rules out images that earn nothing, and this application ships
 * zero image bytes today: the masthead is text, the story list needs no
 * artwork, and an icon set exists only to be installed with. Leaving it out
 * also makes the manifest non-installable in Chromium BY CONSTRUCTION — the
 * installability criteria require an icon — so "this slice adds no install
 * prompt" is a fact about the file rather than a promise about our restraint.
 * Adding icons is therefore the same edit as deciding to be installable, which
 * is the right place for that decision to be made.
 *
 * **One `theme_color` where the document carries two.** AB-205 shipped two
 * `<meta name="theme-color">` values keyed on `prefers-color-scheme`, because
 * a single value paints cream chrome above a dark page; a manifest has one
 * field and no media query, so it cannot express that. Three facts make the
 * single value harmless, and they are the answer to "why did AB-205 argue for
 * two":
 *
 * 1. the document's metas override the manifest's value whenever a document is
 *    loaded, so this value never colours a page a reader is reading;
 * 2. what is left is the splash screen and the task switcher, before the
 *    document has parsed — the only moments the manifest is the sole source;
 * 3. `background_color` is set to the same value, so the splash background and
 *    the chrome above it are one colour rather than two that disagree.
 *
 * The light `--surface` is the one chosen, and it is read from the palette here
 * rather than trusted, which is the drift guard AB-205 established: retuning
 * the page background must not leave a stale colour behind in a file nobody
 * thinks to open.
 *
 * Read through the bundler (`?raw`, typed by `vite/client`) rather than through
 * `node:fs`, for the reason `index-html.test.ts` and `palette.test.ts` record:
 * the ambient Node types this repository deliberately does not install.
 */
import palette from "@aaj-bas/ui/palette.css?raw";
import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import manifestSource from "../public/manifest.webmanifest?raw";

const manifest: Record<string, unknown> = JSON.parse(manifestSource) as Record<
  string,
  unknown
>;

/**
 * The page background of the light appearance, taken from the palette itself.
 *
 * The unconditional `:root` block is matched by requiring the brace to follow
 * the selector directly, which `:root:not(...)` and `:root[data-theme="dark"]`
 * both fail, so this needs no assumption about the order blocks appear in.
 * `palette.test.ts` is where the palette's own consistency is enforced; this
 * only needs the one value the manifest has room for.
 */
function lightSurface(): string {
  const declarations = palette.replace(/\/\*[\s\S]*?\*\//g, "");
  const base = /:root\s*\{([^}]*)\}/.exec(declarations)?.[1] ?? "";
  const surface = /--surface:\s*(#[0-9a-f]{3,8})/i.exec(base)?.[1];

  if (surface === undefined) {
    throw new Error("the palette no longer defines a light page surface");
  }

  return surface;
}

describe("the web app manifest", () => {
  it("names the product the way the masthead does", () => {
    expect(manifest.name).toBe("Aaj, Bas.");
    expect(manifest.short_name).toBe("Aaj, Bas.");
  });

  it("opens at today's edition and claims the whole origin", () => {
    // `start_url` is `/`, which is the latest edition — never a dated archive
    // address, which would install a reader into one day forever.
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("keeps the browser's own controls in the installed application", () => {
    /*
      `standalone` is the value this would drift to, and it is the one that
      breaks the recovery path: with no reload control, a reader holding a bad
      cached shell has no way to ask for a fresh one. Asserted as an equality
      rather than as "not standalone", so `fullscreen` — which removes more
      still — fails here too.
    */
    expect(manifest.display).toBe("minimal-ui");
  });

  it("colours the splash and the chrome with one page background", () => {
    // Read from the palette rather than written down twice: this file is
    // exactly the kind of place a retuned background gets forgotten, and the
    // reader would meet the stale colour on every cold start.
    const surface = lightSurface();

    expect(manifest.theme_color).toBe(surface);
    expect(manifest.background_color).toBe(surface);
  });

  it("declares no icons, which is what makes it non-installable", () => {
    /*
      THE ABSENCE IS THE FEATURE. Chromium's installability criteria require an
      icon, so a manifest without one cannot trigger an install prompt — this
      slice's "no install prompt" is enforced by the file rather than by
      remembering not to add one. Section 27 supplies the second reason: the
      application ships no image bytes at all today, and an icon set would be
      the first, paid for by nothing a reader reads.

      `toBeUndefined` rather than a length check, so an empty array — the
      plausible "tidy it up" edit — fails here as well.
    */
    expect(manifest.icons).toBeUndefined();
    expect(Object.keys(manifest)).not.toContain("icons");
  });

  it("says nothing about how a reader should be prompted to install it", () => {
    // `prefer_related_applications` and `related_applications` point at native
    // stores the product does not have, and `shortcuts` is a second entry
    // point into a product with one page. Absent, not empty.
    expect(manifest.related_applications).toBeUndefined();
    expect(manifest.prefer_related_applications).toBeUndefined();
    expect(manifest.shortcuts).toBeUndefined();
  });
});

describe("the document that carries the manifest", () => {
  const document = new DOMParser().parseFromString(html, "text/html");

  it("links it, or the file is served and read by nobody", () => {
    const links = [...document.querySelectorAll('link[rel="manifest"]')];

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/manifest.webmanifest");
  });

  it("still carries both theme colours of its own", () => {
    /*
      The manifest's single `theme_color` must not be read as permission to
      collapse the document's two into one. The metas are what colour the
      chrome of a loaded page, and `index-html.test.ts` asserts they match the
      palette; this asserts only that there are still two of them, from the
      file that introduced the temptation to have one.
    */
    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(
      2,
    );
  });
});
