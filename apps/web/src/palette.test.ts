/**
 * The palette, read as source text, and the contrast verification standing in
 * for an accessibility tool this repository does not have.
 *
 * AGENTS.md section 5 lists axe-core as not installed, and adding it needs an
 * ADR. That would be the conventional way to check colour contrast, and it was
 * declined here for a reason that outlives the dependency question: axe checks
 * the colours a rendered page HAPPENS to produce, so it can only see the theme
 * jsdom is in and only the pairs some component happened to render. What has to
 * hold is a property of the palette itself — every appearance it defines, every
 * pairing the applications rely on, including the ones no test renders. That is
 * a property of four hex values and is checkable exactly, in ten lines, with no
 * dependency and no browser.
 *
 * So the ratios below are computed from WCAG 2.2's own definitions of relative
 * luminance and contrast ratio rather than trusted to a library, and they
 * reproduce the numbers `palette.css`'s own comment records — 3.43:1 for the
 * focus ring against the light hover fill, 2.88:1 for the retired #a84315 that
 * comment exists to explain. If an edit to this file changes those numbers, the
 * implementation is wrong; the thresholds are the specification's and are not
 * the thing to adjust.
 *
 * THE LOOP IS OVER BLOCKS DISCOVERED IN THE FILE, never a list written here.
 * That is what makes this a check rather than a record: a fourth appearance
 * added without contrast clearance fails on the day it is added, in this file,
 * instead of shipping and being noticed by a reader.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install; `styles.test.ts` and
 * `index-html.test.ts` read their files the same way. Vitest blanks CSS
 * imports by extension BEFORE the `?raw` query is considered, so
 * `vite.config.ts` has to name this file — see the positive assertion below,
 * which is what stands between a blanked import and a suite that passes by
 * having nothing to measure.
 */
import palette from "@aaj-bas/ui/palette.css?raw";
import { describe, expect, it } from "vitest";
import { THEMES } from "./local-state/local-state";
import { THEME_ATTRIBUTE } from "./theme/document-theme";

/**
 * The stylesheet with its comments stripped.
 *
 * The comments are where the palette is argued, and they name every construct
 * asserted absent below — `light-dark()`, `[data-theme="light"]`, the retired
 * hex value. Asserting against the raw text would fail on the explanation and
 * say nothing about the declarations.
 */
const source = palette.replace(/\/\*[\s\S]*?\*\//g, "");

/** One declaration block, with the media condition it sits inside if any. */
type Block = {
  /** How this block is named in test output. */
  readonly label: string;
  readonly selector: string;
  readonly media: string | null;
  readonly declarations: ReadonlyMap<string, string>;
};

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let at = open; at < css.length; at += 1) {
    if (css[at] === "{") {
      depth += 1;
    } else if (css[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        return at;
      }
    }
  }

  throw new Error("palette.css has unbalanced braces");
}

function parseDeclarations(body: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const statement of body.split(";")) {
    const colon = statement.indexOf(":");
    if (colon === -1) {
      continue;
    }

    const name = statement.slice(0, colon).trim();
    if (name !== "") {
      found.set(name, statement.slice(colon + 1).trim());
    }
  }

  return found;
}

/**
 * Every declaration block in the file, at-rules descended into.
 *
 * Deliberately a parser rather than a regex per construct: a regex would have
 * to be told what to look for, and being told is exactly what this file must
 * not depend on. Anything that declares custom properties is found, whatever
 * its selector, which is what makes an unreviewed fourth appearance fail below.
 */
function parseBlocks(css: string, media: string | null): Block[] {
  const blocks: Block[] = [];
  let at = 0;

  while (at < css.length) {
    const open = css.indexOf("{", at);
    if (open === -1) {
      break;
    }

    const close = closingBrace(css, open);
    const prelude = css.slice(at, open).trim();
    const body = css.slice(open + 1, close);

    if (prelude.startsWith("@")) {
      blocks.push(...parseBlocks(body, prelude));
    } else {
      blocks.push({
        label: media === null ? prelude : `${prelude} inside ${media}`,
        selector: prelude,
        media,
        declarations: parseDeclarations(body),
      });
    }

    at = close + 1;
  }

  return blocks;
}

const blocks = parseBlocks(source, null);

/**
 * A selector with its negations removed.
 *
 * `[data-theme="light"]` inside a `:not()` says which documents a block
 * REFUSES, which is the opposite of what every question below asks. Matching
 * the raw selector would report the dark media block as a light block and as a
 * dark block at once.
 */
function targets(selector: string): string {
  return selector.replace(/:not\([^)]*\)/g, "");
}

function customProperties(
  declarations: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  return new Map([...declarations].filter(([name]) => name.startsWith("--")));
}

/**
 * The unconditional block, which is the light appearance and the fallback under
 * every other one.
 *
 * The one selector named literally in this file, and it has to be: something
 * must anchor "what a document with no attribute and no matching media query
 * gets". Everything else is derived from it.
 */
const base = blocks.find(
  (block) => block.media === null && block.selector === ":root",
);
if (base === undefined) {
  throw new Error("palette.css declares no unconditional `:root` block");
}

const baseTokens = customProperties(base.declarations);
const overrides = blocks.filter((block) => block !== base);

/** A block resolved against the base, as a browser would resolve it. */
type Appearance = {
  readonly label: string;
  readonly block: Block;
  readonly tokens: ReadonlyMap<string, string>;
};

const appearances: readonly Appearance[] = blocks.map((block) => ({
  label: block.label,
  block,
  tokens: new Map([...baseTokens, ...customProperties(block.declarations)]),
}));

function token(appearance: Appearance, name: string): string {
  const value = appearance.tokens.get(name);
  if (value === undefined) {
    throw new Error(`${appearance.label} resolves no ${name}`);
  }

  // Three-digit shorthand and `rgb()` would both give this arithmetic wrong
  // answers silently, so they fail loudly instead. Widening it is a change to
  // the parsing, not to the palette, and should be made deliberately.
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${name} in ${appearance.label} is not a six-digit hex`);
  }

  return value;
}

/** WCAG 2.2's relative luminance, one channel at a time. */
function channel(hex: string, at: number): number {
  const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

/** WCAG 2.2's contrast ratio. Symmetric, as the specification defines it. */
function contrastRatio(one: string, other: string): number {
  const first = relativeLuminance(one);
  const second = relativeLuminance(other);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("the shared palette", () => {
  it("was actually read, so every ratio below measures something", () => {
    /*
      The positive assertion, and it is the load-bearing one in an
      accessibility check built entirely out of loops. Vitest blanks CSS
      imports by extension before `?raw` is considered, so a missing entry in
      `vite.config.ts` — or a moved file, or a bad merge — makes `palette` the
      empty string. Every block discovery then yields nothing, every `for` over
      it runs zero times, and the whole suite reports success at the exact
      moment it has stopped checking anything. `styles.test.ts` records the
      same requirement for the same reason.
    */
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(baseTokens.size).toBeGreaterThanOrEqual(4);
  });

  it("computes the ratios the palette's own comment records", () => {
    // Not a palette assertion — a check on the arithmetic above, against
    // numbers derived independently. #a84315 is the value `--focus-ring`
    // replaced, and 2.88:1 on the dark surface is the failure that comment
    // exists to explain; if this file ever reproduces it as passing, the
    // luminance implementation is wrong and every ratio below is meaningless.
    expect(contrastRatio("#a84315", "#181b18")).toBeCloseTo(2.88, 2);
    expect(contrastRatio("#b85c2e", "#f7f4ef")).toBeCloseTo(4.15, 2);
  });
});

/*
  One suite per DISCOVERED appearance. Adding a block to `palette.css` adds a
  suite here with no edit to this file, and a block whose colours have not been
  cleared for contrast fails immediately. That is the entire point of
  discovering rather than listing.
*/
describe.each(appearances)("the $label appearance", (appearance) => {
  it("reads body text against the page at 4.5:1 (SC 1.4.3)", () => {
    expect(
      contrastRatio(token(appearance, "--ink"), token(appearance, "--surface")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the focus ring against the page at 3:1 (SC 1.4.11)", () => {
    // A positive `outline-offset` keeps the page background, not the hover
    // fill, adjacent to the ring, so this is the pairing a reader tabbing
    // through the edition actually sees.
    expect(
      contrastRatio(
        token(appearance, "--focus-ring"),
        token(appearance, "--surface"),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("shows the focus ring against an inverted control at 3:1", () => {
    // The hover fill is `--ink`. Asserted so the ring survives the offset
    // above being removed by someone who does not know it is load-bearing.
    expect(
      contrastRatio(
        token(appearance, "--focus-ring"),
        token(appearance, "--ink"),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("reads an inverted control's label at 4.5:1 (SC 1.4.3)", () => {
    /*
      The same number as the first assertion, because the ratio is symmetric
      and the two pairings use the same two tokens today. It is asserted
      separately because it is a different claim about a different surface —
      label on filled button, not text on page — and the day either side of it
      becomes its own token, the two stop agreeing and only one of them is
      still checked by the first assertion.
    */
    expect(
      contrastRatio(token(appearance, "--surface"), token(appearance, "--ink")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("declares an appearance for the controls no stylesheet can paint", () => {
    // Native checkboxes, the caret and scrollbars are the user agent's to
    // colour, and `color-scheme` is the only thing that tells it which way.
    // Without it a reader who pinned dark on a light OS gets light checkboxes
    // on a dark page — see the file's header.
    expect(appearance.block.declarations.has("color-scheme")).toBe(true);
  });
});

describe("what the palette deliberately does not declare", () => {
  it("gives light no block of its own, so the fall-through survives", () => {
    /*
      Completing the set is the tidy-looking change that breaks this. The base
      `:root` already holds the light values and the dark media query is scoped
      away from a pinned-light document, so a `[data-theme="light"]` block would
      be a second copy of values that already apply — and the day the two copies
      drift, a reader who pinned light gets a page assembled out of both.
    */
    expect(
      blocks.some((block) =>
        targets(block.selector).includes('[data-theme="light"]'),
      ),
    ).toBe(false);
  });

  it("names only the appearance that needs a block of its own", () => {
    /*
      Driven by the store's own vocabulary rather than a list here. "light"
      needs no block for the reason above; "system" must never have one,
      because the whole design is that system IS the absence of the attribute —
      a `[data-theme="system"]` block would be a rule that only matches when
      something has written the value the applier is specified never to write.
    */
    for (const theme of THEMES) {
      const declared = blocks.some((block) =>
        targets(block.selector).includes(`[${THEME_ATTRIBUTE}="${theme}"]`),
      );

      expect([theme, declared]).toStrictEqual([theme, theme === "dark"]);
    }
  });

  it("keys on the attribute the applier writes", () => {
    // `document-theme.ts` owns the attribute name and this file has to agree
    // with it; asserting the constant rather than the string means a rename
    // fails here instead of silently leaving every pinned reader on the OS
    // appearance.
    const attributes = [...source.matchAll(/\[([a-z-]+)[=\]]/g)].map(
      (match) => match[1],
    );

    expect(attributes.length).toBeGreaterThan(0);
    expect(new Set(attributes)).toStrictEqual(new Set([THEME_ATTRIBUTE]));
  });

  it("animates nothing, so there is no theme cross-fade to reduce", () => {
    /*
      A colour transition on `:root` is the single most likely addition to this
      file: it makes the appearance switch look considered, and it is one line.
      It also means every reader whose OS flips to dark at sunset watches the
      page fade, and it is the kind of motion `prefers-reduced-motion` exists
      for — with the twist that a transition declared here would apply to both
      applications at once. Absent rather than gated, for `styles.test.ts`'s
      reason: there is no way to add motion that forgets to honour the query if
      there is no motion.
    */
    expect(source).not.toMatch(/@keyframes/i);
    expect(source).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(source).not.toMatch(/\btransition[a-z-]*\s*:/i);
  });

  it("does not reach for light-dark(), which would fail without a fallback", () => {
    // Considered and recorded in the file's header. In a browser without it the
    // declaration is invalid at computed-value time, so the page loses its
    // background and its text colour together. Re-open with a stated browser
    // support floor, not by deleting this.
    expect(source).not.toMatch(/light-dark\s*\(/i);
  });
});

describe("the appearance blocks, against each other", () => {
  it("keeps every theme-varying colour in step across them", () => {
    /*
      The file's header rule, which was prose until now: a colour that differs
      between appearances needs an entry in every block. Two halves, and both
      are failures a browser reports as a missing colour rather than an error.
      A token invented inside one block resolves to nothing everywhere else;
      a token added to one override and forgotten in the other leaves one
      appearance silently inheriting the light value.

      `--focus-ring` is correctly in the base alone: it is one value for both
      appearances, which is why it is not required of the overrides here.
    */
    const overrideNames = overrides.map(
      (block) => new Set(customProperties(block.declarations).keys()),
    );

    for (const names of overrideNames) {
      for (const name of names) {
        expect([name, baseTokens.has(name)]).toStrictEqual([name, true]);
      }
      expect(names).toStrictEqual(overrideNames[0]);
    }
  });

  it("says the same thing twice, exactly, where light-dark() would say it once", () => {
    /*
      The duplication is the price of the rejected `light-dark()` and it is only
      safe while the two copies are identical: a reader who pinned dark and a
      reader whose OS is dark must get the same page. Discovered by predicate
      rather than by hex value, so the assertion still holds after the dark
      palette is retuned.
    */
    const byMediaQuery = overrides.filter((block) =>
      (block.media ?? "").includes("prefers-color-scheme: dark"),
    );
    const byAttribute = overrides.filter((block) =>
      targets(block.selector).includes(`[${THEME_ATTRIBUTE}="dark"]`),
    );

    expect(byMediaQuery).toHaveLength(1);
    expect(byAttribute).toHaveLength(1);
    expect(byMediaQuery[0]?.declarations).toStrictEqual(
      byAttribute[0]?.declarations,
    );
  });

  it("lets an unrecognised attribute value mean the OS decides", () => {
    /*
      The scoping this turns on. `:not([data-theme])` would be shorter and would
      pin a document carrying a typo, a stale value, or a value written by some
      later build to LIGHT — a reader in dark mode handed a white page because
      of a string nothing recognised. Excluding the two known values instead
      makes every other value fall through to the operating system, which is
      the product default and the only safe reading of a value we cannot
      interpret.
    */
    const query = overrides.find((block) =>
      (block.media ?? "").includes("prefers-color-scheme: dark"),
    );

    expect(query?.selector).toContain(`:not([${THEME_ATTRIBUTE}="light"])`);
    expect(query?.selector).toContain(`:not([${THEME_ATTRIBUTE}="dark"])`);
    expect(query?.selector).not.toMatch(/:not\(\[data-theme\]\)/);
  });
});

/*
  `--rule` is deliberately NOT asserted anywhere above, and this is the note
  that keeps it from being "fixed".

  It is 2.94:1 on the light surface, below the 3:1 in SC 1.4.11. That is
  correct as the token is used today: `--rule` only ever draws a `border-top`
  or `border-left` between blocks of text, and SC 1.4.11 governs the visual
  information needed to identify user-interface components and states, not
  decorative boundaries. A blanket "every token clears 3:1" test would fail on
  the day it was written, and the obvious repair would be to lower the
  threshold — which is strictly worse than having no test, because it lowers it
  for `--focus-ring` too.

  The moment `--rule` is used as a control's boundary, an input's border, or the
  only thing distinguishing a checked box from an unchecked one, it becomes
  non-text contrast and belongs in the loop above at 3:1. That is the trigger to
  watch for; it is a change in how the token is used, not in its value.
*/
