/**
 * The landing page's stylesheet, read as source text.
 *
 * The reader has had a file like this since AB-203. The landing page had none,
 * and its focus ring, its 44px target, its absence of motion and its absence of
 * anything pinned to the viewport were one careless edit from gone with nothing
 * failing anywhere — `App.test.tsx` renders the page, and jsdom applies no
 * author CSS, so a stylesheet is invisible to every assertion in it. This file
 * exists so that the two applications make the same commitments and can be
 * held to them the same way.
 *
 * What is asserted here is the same set the reader asserts, for the same
 * reasons, stated once more rather than referred to:
 *
 * - NO MOTION, asserted absent rather than gated. `prefers-reduced-motion`
 *   compliance (AGENTS.md section 25) follows from there being no motion at
 *   all: with no `animation` and no `transition` anywhere there is nothing for
 *   the query to turn off, and no way to add motion that forgets to honour it.
 *   There is deliberately no `@media (prefers-reduced-motion: reduce)` block:
 *   the conventional reset is written with `animation-duration` and
 *   `transition-duration`, so it could not be added without deleting the two
 *   assertions below, and a global motion reset legitimises adding motion later
 *   because the reset is there to catch it.
 *
 * - `scroll-behavior: smooth` separately, because it is motion that contains
 *   none of the three words above and passes every one of those regexes. The
 *   page is one column with one link in it; an animated scroll here would be
 *   decoration for its own sake, and section 28 asks the landing page to stay
 *   particularly minimal.
 *
 * - NOTHING PINNED TO THE VIEWPORT. A bar that travels down the page is the
 *   attention-seeking furniture section 28 rules out, and it is also the only
 *   construct in a page laid out in normal flow that can cover a focused
 *   control — WCAG 2.2 success criterion 2.4.11.
 *
 * - NO REMOVED OUTLINE. Section 25 names this outright: a focus outline may be
 *   replaced with a clearly visible treatment, never removed. The longhands
 *   are named alongside the shorthand, because `outline-width: 0` and
 *   `outline-color: transparent` remove the ring just as completely while
 *   spelling neither `none` nor `0` where a shorthand pattern looks.
 *
 * - A 44px MINIMUM on the call to action, which section 25 asks for and which
 *   no rendering test can see.
 *
 * - THE PALETTE IMPORT, and every token spent measured against what the palette
 *   declares. Both applications' colours arrive through `var()`, so deleting
 *   one line at the top of `styles.css` does not degrade the page, it unpaints
 *   it -- background and text lost together, which is the exact failure
 *   `palette.css` names when it rejects `light-dark()`.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install. It also resolves relative to this
 * file, so the test does not depend on a working directory.
 */
import palette from "@aaj-bas/ui/palette.css?raw";
import { describe, expect, it } from "vitest";
/*
  The READER's stylesheet, and the only thing in this application that reaches
  into the other one. It is here because the claim below is a claim about the
  two of them: "the two applications cannot drift apart on focus" was written
  in this file while nothing compared them, and it can only be made true by one
  file reading both. This is that file, because this is where the claim is
  made.
*/
import readerStyles from "../../web/src/styles.css?raw";
import styles from "./styles.css?raw";

/**
 * The stylesheet with its comments stripped.
 *
 * The comments are where these rules are argued, so they name the very
 * constructs this file exists to keep out. Asserting against the raw text would
 * fail on the explanation and say nothing about the declarations, so the
 * explanation is removed and only what the browser acts on is examined.
 */
const declarations = styles.replace(/\/\*[\s\S]*?\*\//g, "");

/** The same, for the reader's stylesheet and the palette. */
const readerDeclarations = readerStyles.replace(/\/\*[\s\S]*?\*\//g, "");
const paletteDeclarations = palette.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The one rule block a selector introduces, comments already removed.
 *
 * Throwing on a miss is the point: a renamed or deleted class must fail here
 * rather than pass by having nothing to examine.
 */
function ruleIn(css: string, selector: string, where: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`${where} declares no rule for ${selector}`);
  }
  const end = css.indexOf("}", start);
  if (end === -1) {
    throw new Error(`the rule for ${selector} in ${where} is never closed`);
  }

  return css.slice(start, end);
}

function ruleFor(selector: string): string {
  return ruleIn(declarations, selector, "styles.css");
}

/** Every custom-property name a pattern's first group finds, in order. */
function customProperties(css: string, pattern: RegExp): readonly string[] {
  return [...css.matchAll(pattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

describe("the landing stylesheet", () => {
  it("styles the page this suite cannot see", () => {
    /*
      The positive assertion, and it is load-bearing: every check below is an
      absence, and an empty file — a bad merge, a moved stylesheet, a `?raw`
      import that silently resolved to nothing — satisfies all of them at once.
      This is what makes the rest of the file an argument about `styles.css`
      rather than about a string that happens to be empty.

      It is the sharper hazard here than in the reader, because this app's
      Vitest configuration decides whether a CSS import resolves to its source
      or to "". If that ever changes, this line is what says so.
    */
    expect(declarations).toContain(".landing-page {");
    expect(declarations).toContain(".primary-link {");
    expect(declarations).toContain(":focus-visible {");
  });

  it("animates nothing, so there is no motion to reduce", () => {
    expect(declarations).not.toMatch(/@keyframes/i);
    expect(declarations).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(declarations).not.toMatch(/\btransition[a-z-]*\s*:/i);
  });

  it("scrolls without animating", () => {
    // Motion that contains none of the three words above, and therefore passes
    // all three assertions above.
    expect(declarations).not.toMatch(/scroll-behavior\s*:\s*smooth/i);
  });

  it("pins nothing to the viewport, which is what keeps focus unobscured", () => {
    /*
      A sticky header or a fixed "Read today's edition" bar is the
      attention-seeking furniture section 28 rules out, and on a phone it covers
      the sentence being read. It is also the only construct in a page laid out
      in normal flow that can obscure a focused control, which is WCAG 2.2
      success criterion 2.4.11.

      `position: absolute` is not forbidden and is not currently used; clipping
      an element out of the page covers nothing.
    */
    expect(declarations).not.toMatch(/position\s*:\s*sticky/i);
    expect(declarations).not.toMatch(/position\s*:\s*fixed/i);
  });

  it("never removes a focus outline", () => {
    // The longhands as well as the shorthand: `outline-width: 0` and
    // `outline-color: transparent` take the ring away as completely and match
    // neither spelling the first pattern looks for.
    expect(declarations).not.toMatch(/outline\s*:\s*(none|0)\b/i);
    expect(declarations).not.toMatch(/outline-width\s*:\s*0/i);
    expect(declarations).not.toMatch(/outline-style\s*:\s*(none|hidden)\b/i);
    expect(declarations).not.toMatch(/outline-color\s*:\s*transparent\b/i);
  });

  it("rings every focusable element, not a list of remembered class names", () => {
    /*
      The rule this replaced named `.primary-link` and was complete only because
      the page has exactly one control. The next control added here would have
      had the user agent's default and nothing else, and a base rule cannot be
      forgotten by a control that has not been written yet.

      `[tabindex="-1"]` is excluded: an element made programmatically focusable
      is not a control, and it keeps the browser's own outline.
    */
    const base = ruleFor(
      ':where(a[href], button, input, [tabindex]:not([tabindex="-1"])):focus-visible',
    );

    expect(base).toMatch(/outline\s*:\s*3px solid var\(--focus-ring\)/);
    expect(base).toMatch(/outline-offset\s*:\s*3px/);
    // Positive, so that hovering — which inverts the link's fill to --ink —
    // cannot put that fill next to the ring, where the palette's contrast note
    // measures against the page background instead.
    expect(declarations).not.toMatch(/outline-offset\s*:\s*(0|-)/);
  });

  it("carries the identical rule the reader does, so the two cannot drift", () => {
    /*
      This sentence used to be a comment on the assertion above, and it was
      false: nothing here had ever read the reader's stylesheet, so the two
      copies could and did diverge in silence. It is an assertion now.

      Compared as TEXT, not as a set of expectations restated twice. Two files
      each checked against the same list of regexes would still agree only for
      as long as someone remembered to edit both lists; comparing the blocks
      makes the reader's copy the specification for this one, whichever of them
      is edited first.

      The reader's own `styles.test.ts` asserts the same rule against the same
      declarations, so this does not stand alone: it is what makes the pair a
      pair. And a reader's stylesheet that lost the rule entirely fails here on
      the lookup, before any comparison happens.
    */
    const selector =
      ':where(a[href], button, input, [tabindex]:not([tabindex="-1"])):focus-visible';

    expect(
      ruleIn(readerDeclarations, selector, "the reader's styles.css").trim(),
    ).toBe(ruleFor(selector).trim());
  });

  it("spends only colours the shared palette declares", () => {
    /*
      The import first, because deleting that one line is not a degraded page:
      every `var()` below resolves to nothing at once, so the page loses its
      background AND its text colour together — the failure `palette.css` names
      when it rejects `light-dark()`, arrived at from the other direction. It
      would also leave `palette.test.ts` verifying contrast ratios for a file
      neither shipped application consumes.

      Then the tokens, which catch the likelier mistake: `var(--surfance)` is
      not a syntax error anywhere in this toolchain, warns nowhere, and renders
      as an unstyled element.
    */
    expect(declarations).toContain('@import "@aaj-bas/ui/palette.css";');

    const declared = new Set(
      customProperties(paletteDeclarations, /(--[a-z0-9-]+)\s*:/gi),
    );
    const spent = customProperties(declarations, /var\(\s*(--[a-z0-9-]+)/gi);

    // Non-vacuous on both sides: a blanked `?raw` import of either file would
    // otherwise satisfy the loop by giving it nothing to iterate over.
    expect(declared.size).toBeGreaterThanOrEqual(4);
    expect(spent.length).toBeGreaterThan(0);

    for (const name of spent) {
      expect([name, declared.has(name)]).toStrictEqual([name, true]);
    }
  });

  it("declares a 44px minimum on the call to action, in a display where it applies", () => {
    /*
      This asserts a DECLARATION, not a measured box, and the distinction
      matters enough to state. jsdom performs no layout —
      `getBoundingClientRect` returns zeros for every element — so nothing here
      can measure a rendered target and nothing should claim to. Only a real
      browser can, and section 5 makes adding one an ADR.

      What is checkable is that the declaration exists and is not inert:
      `min-height` does nothing on an inline box, so `min-height: 44px` on an
      `<a>` left at its default `display` is a 44px promise that renders as a
      20px target. The display is asserted with the height for that reason —
      the two are one claim, and either alone is not it.
    */
    const rule = ruleFor(".primary-link");

    expect(rule).toMatch(/min-height\s*:\s*44px/);
    expect(rule).toMatch(/display\s*:\s*(inline-)?flex/);
  });

  it("leaves color-scheme to the shared palette", () => {
    /*
      `packages/ui/src/palette.css` decides `color-scheme` per appearance, and
      this file is imported AFTER it. A `:root { color-scheme: light dark }`
      here would win at equal specificity and undo the dark case, leaving a
      reader who pinned dark with light native controls, a light caret and light
      scrollbars on a dark page — the pinned appearances would look right while
      the system case was wrong, which is the version of this bug that survives
      review.
    */
    expect(declarations).not.toMatch(/color-scheme\s*:/i);
  });
});
