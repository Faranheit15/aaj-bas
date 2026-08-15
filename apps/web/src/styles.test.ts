/**
 * The reader's stylesheet, read as source text.
 *
 * Everything else in this suite renders components, and a stylesheet is
 * invisible to every one of them: jsdom applies no author CSS, so a rule that
 * pinned the ending to the bottom of the viewport or flashed a celebration over
 * it would leave all 380 of them green. That makes `styles.css` the one file in
 * the reader carrying product commitments with nothing executable behind them —
 * and two of AB-203's strongest claims are made there and nowhere else.
 *
 * Those two are the ones asserted below, because they are the two mechanics
 * most likely to be added later by someone improving the ending in good faith:
 *
 * - A COMPLETION ANIMATION. `@keyframes` on the closing message is a
 *   celebration, and celebrating the end of an edition turns finishing into a
 *   reward to collect rather than a fact to notice (AGENTS.md section 3.2,
 *   constitution 2). It is also the most natural thing in the world to reach
 *   for: the message appears, so it looks like it should arrive.
 *
 * - A STICKY CALL TO ACTION. `position: sticky` or `position: fixed` on the
 *   ending turns the end-edition control into a bar that travels down the page
 *   with the reader — a standing invitation to stop, following them through
 *   every story, which is the attention-seeking furniture section 28 rules out
 *   and which on a phone covers the story being read. PRD section 6.4 calls the
 *   control "persistent", and that word is exactly the one a later reader could
 *   mistake for "pinned to the viewport".
 *
 * AB-204's interest picker joins the same two arguments rather than adding new
 * ones, which is why it needs no test of its own here beyond being present in
 * the positive pair below. It makes both sharper. The invitation APPEARS,
 * mid-edition, so it is the one block in the reader that looks like it should
 * fade or slide in — and a block that animates itself into view has announced
 * its arrival, which is exactly what the component is arranged not to do. A
 * fieldset pinned to the viewport would be a standing prompt to answer,
 * travelling down the page with the reader.
 *
 * Motion is asserted absent rather than gated. `prefers-reduced-motion`
 * compliance (section 25) follows from there being no motion at all: with no
 * `animation` and no `transition` anywhere there is nothing for the query to
 * turn off, and no way to add motion that forgets to honour it — the media
 * query cannot be omitted for a rule that does not exist. Adding either back
 * fails here, which is where the argument for it belongs.
 *
 * There is deliberately NO `@media (prefers-reduced-motion: reduce)` block in
 * `styles.css`, and adding the conventional global reset would be a regression
 * rather than an improvement. That reset is written with `animation-duration`
 * and `transition-duration`, both of which the regexes above match, so it
 * cannot be added without deleting an assertion this file argued for — and a
 * global motion reset legitimises adding motion later, because the reset is
 * there to catch it. Reduced motion is satisfied here by there being no motion
 * at all, plus the assertions that keep it that way.
 *
 * AB-205 adds three more absences and one shape, all of them section 25:
 *
 * - `scroll-behavior: smooth`. Motion, and precisely the kind
 *   `prefers-reduced-motion` exists for — yet it contains none of `animation`,
 *   `transition` or `@keyframes`, so it passes all three regexes above. The
 *   shell already calls `window.scrollTo` on every route change, so one
 *   declaration in this file would turn every navigation into an animated
 *   scroll for readers who asked their operating system for the opposite.
 * - `outline: none` and `outline: 0`, which section 25 names outright: a focus
 *   outline may be replaced, never removed. The longhands are named too:
 *   `outline-width: 0` and `outline-color: transparent` remove the ring just as
 *   completely and match neither of the two shorthand spellings.
 * - The base `:focus-visible` rule itself, which is the ring every control in
 *   the reader now inherits instead of being remembered into a list. Deleting
 *   it takes the ring off every control at once and leaves nothing else in this
 *   file to notice — the reason the landing page asserts its copy the same way.
 * - A 44px minimum on every control, which section 25 asks for and which no
 *   rendering test in this suite can see.
 * - The skip link's hidden/revealed pair, whose whole correctness is that the
 *   reveal undoes exactly what the hiding did.
 * - The palette import, and the tokens spent against what the palette declares.
 *   Every colour on the page arrives through `var()`, so a deleted import or a
 *   mistyped token name is not a degraded page but an unpainted one.
 * - `color-scheme`, asserted ABSENT, because the palette owns it per appearance
 *   and this file is imported after it.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install; `index-html.test.ts` reads the
 * served document the same way. It also resolves relative to this file, so the
 * test does not depend on a working directory.
 */
import palette from "@aaj-bas/ui/palette.css?raw";
import { describe, expect, it } from "vitest";
import styles from "./styles.css?raw";

/**
 * The stylesheet with its comments stripped.
 *
 * The comments are where these rules are argued, so they name every construct
 * this file exists to keep out — "No `@keyframes`, no `transition`, and no
 * `animation`" sits above `.edition-ending`, as does the paragraph explaining
 * why `position: sticky` is wrong there. Asserting against the raw text would
 * fail on the explanation and say nothing about the declarations, so the
 * explanation is removed and only what the browser acts on is examined.
 */
const declarations = styles.replace(/\/\*[\s\S]*?\*\//g, "");

/** The palette, comments removed; they name tokens they do not declare. */
const paletteDeclarations = palette.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every custom-property name a pattern's first group finds, in order. */
function customProperties(css: string, pattern: RegExp): readonly string[] {
  return [...css.matchAll(pattern)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

describe("the reader stylesheet", () => {
  it("styles the parts of the edition this suite cannot see", () => {
    /*
      The positive pair, and it is load-bearing: every assertion below is an
      absence, and an empty file — a bad merge, a moved stylesheet, a `?raw`
      import that silently resolved to nothing — satisfies all of them at once.
      This is what makes the rest of the file an argument about `styles.css`
      rather than about a string that happens to be empty.
    */
    expect(declarations).toContain(".edition-ending {");
    expect(declarations).toContain(".edition-ending-message {");
    expect(declarations).toContain(".edition-progress {");
    expect(declarations).toContain(".interest-boosts {");
    expect(declarations).toContain(".interest-choices {");
    expect(declarations).toContain(".skip-link {");
    expect(declarations).toContain(".theme-choice {");
    expect(declarations).toContain(":focus-visible {");
  });

  it("spends only colours the shared palette declares", () => {
    /*
      Two halves of one failure, and it is the failure `palette.css` names when
      it rejects `light-dark()`: an unresolved custom property is not a
      degraded colour, it is no colour at all, so the page loses its background
      AND its text in the same moment.

      The first half is the import. Every colour below arrives through `var()`,
      and deleting one line at the top of this file makes every one of them
      resolve to nothing — while `palette.test.ts` goes on verifying contrast
      ratios against a file the shipped application no longer consumes.

      The second half is the one that catches the likelier mistake: a token
      spent here that the palette never declares. `var(--surfance)` is not a
      syntax error anywhere in the toolchain, produces no warning, and renders
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

  it("leaves color-scheme to the shared palette", () => {
    /*
      The landing page asserts this too, and this is the application where it
      decides something. The palette sets `color-scheme` per appearance; this
      file is imported AFTER it, so a `:root { color-scheme: light dark }` here
      wins at equal specificity — later wins when specificity ties — and undoes
      the two overrides at a stroke.

      The damage is asymmetric, which is what makes it survive review: the
      pinned appearances still look right, because `[data-theme="dark"]` beats
      a bare `:root` on specificity. Only the SYSTEM case, where the palette's
      override is also a `:root` selector, loses — and system is the default
      every reader who has never touched the control is in.

      It matters here rather than on the landing page for two reasons that only
      exist in the reader: it is the application with pinned themes at all, and
      AB-204 shipped six native checkboxes, which the user agent paints by this
      declaration and no other. Light checkboxes and a light caret on a #181b18
      page is the exact bug ADR-0009 says this arrangement fixed.
    */
    expect(declarations).not.toMatch(/color-scheme\s*:/i);
  });

  it("animates nothing, so there is no motion to reduce", () => {
    // A completion animation is the celebration section 3.2 rules out, and
    // `.edition-ending-message` is where it would land.
    expect(declarations).not.toMatch(/@keyframes/i);
    expect(declarations).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(declarations).not.toMatch(/\btransition[a-z-]*\s*:/i);
  });

  it("scrolls without animating, so a route change honours a reduced-motion setting", () => {
    /*
      `scroll-behavior: smooth` is motion, and it is the one form of it that
      passes all three regexes above. `ReaderShell` calls `window.scrollTo` on
      every route change, so a single declaration here would animate every
      navigation in the reader — for everyone, including a reader whose
      operating system has asked for the opposite. This is a live gap rather
      than a hypothetical one, which is why it is asserted separately from the
      three above.
    */
    expect(declarations).not.toMatch(/scroll-behavior\s*:\s*smooth/i);
  });

  it("pins nothing to the viewport, which is what keeps focus unobscured", () => {
    /*
      Two commitments in one assertion, and the second was a coincidence until
      AB-205 made it deliberate.

      The ending must stay at the end: PRD section 6.4 calls the end-edition
      control "persistent", and a reader could take that word for "pinned to the
      viewport" — a standing invitation to stop that travels down the page with
      the reader, which is the attention-seeking furniture section 28 rules out
      and which on a phone covers the story being read.

      And nothing may cover a focused control. WCAG 2.2 success criterion 2.4.11
      (Focus Not Obscured) is failed by exactly one construct in a page laid out
      in normal flow: an element taken out of flow and pinned over it. That is
      why the skip link reveals itself with `position: static` rather than
      floating over the banner, and this assertion is what makes the whole file
      safe for it.

      `position: absolute` is deliberately still allowed: `.visually-hidden` and
      the resting `.skip-link` need it to stay in the accessibility tree while
      clipped out of the page, and a clipped element covers nothing. Sticky and
      fixed are the two that do.
    */
    expect(declarations).not.toMatch(/position\s*:\s*sticky/i);
    expect(declarations).not.toMatch(/position\s*:\s*fixed/i);
  });

  it("never removes a focus outline", () => {
    /*
      Section 25 names this one outright: an outline may be replaced with a
      clearly visible treatment, never removed. The base `:focus-visible` rule
      is the replacement everything focusable gets; `outline: none` beside it
      would be a control quietly opting out of it.

      The longhands are named as well, and they are not pedantry: `outline-
      width: 0` and `outline-color: transparent` each remove the ring as
      completely as the shorthand does, spell neither `none` nor `0` where the
      shorthand pattern looks, and read as a tweak rather than as a removal to
      anyone skimming the diff. `outline-offset` is untouched by these — it is
      asserted positively below, where it is load-bearing rather than optional.
    */
    expect(declarations).not.toMatch(/outline\s*:\s*(none|0)\b/i);
    expect(declarations).not.toMatch(/outline-width\s*:\s*0/i);
    expect(declarations).not.toMatch(/outline-style\s*:\s*(none|hidden)\b/i);
    expect(declarations).not.toMatch(/outline-color\s*:\s*transparent\b/i);
  });

  it("rings every focusable element, not a list of remembered class names", () => {
    /*
      The rule this replaced named seven class names and was complete only
      because someone remembered all seven; the eighth — AB-205's own theme
      toggle — would have had the user agent's default and nothing else. A base
      rule cannot be forgotten by a control that has not been written yet, and
      that is the property asserted: the selector keys on what the PLATFORM
      makes focusable, so narrowing it back to an enumeration fails here.

      Asserted with the same rigour as the landing page's copy, because until
      now it was asserted with none: deleting this whole block took the ring
      off every control in the reader and left all 622 tests green.

      THE OFFSET IS LOAD-BEARING, and positive is the whole of it.
      `.edition-action` inverts its fill to `--ink` on hover, so at offset 0 or
      below the ring is drawn against that fill instead of against the page —
      and `palette.css` and `palette.test.ts` both measure the ring against the
      PAGE background. Zeroing it does not dim the ring, it silently changes
      which pairing the contrast arithmetic was ever about.
    */
    const base = ruleFor(
      ':where(a[href], button, input, [tabindex]:not([tabindex="-1"])):focus-visible',
    );

    expect(base).toMatch(/outline\s*:\s*3px solid var\(--focus-ring\)/);
    expect(base).toMatch(/outline-offset\s*:\s*3px/);
    expect(declarations).not.toMatch(/outline-offset\s*:\s*(0|-)/);
  });
});

/**
 * The one rule block a selector introduces, comments already removed.
 *
 * Every selector asserted below has a block of its own in `styles.css` rather
 * than sharing a grouped selector, so a plain search for `"<selector> {"` finds
 * it exactly. Throwing on a miss is the point: a renamed or deleted class must
 * fail here rather than pass by having nothing to examine, which is the same
 * hazard the positive pair above exists for.
 */
function ruleFor(selector: string): string {
  const start = declarations.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`styles.css declares no rule for ${selector}`);
  }
  const end = declarations.indexOf("}", start);
  if (end === -1) {
    throw new Error(`the rule for ${selector} is never closed`);
  }

  return declarations.slice(start, end);
}

/**
 * Every control a reader points at, taps, or focuses.
 *
 * `.skip-link:focus` rather than `.skip-link`: the resting link is clipped to a
 * pixel on purpose, and the revealed one is the only state a reader can hit.
 */
const TOUCH_TARGETS = [
  ".skip-link:focus",
  ".theme-toggle",
  ".theme-option",
  ".story-toggle",
  ".story-background-toggle",
  ".story-source-link",
  ".story-report",
  ".edition-action",
  ".interest-choice",
] as const;

describe("the reader's touch targets", () => {
  it("declares a 44px minimum on every control, in a display where it applies", () => {
    /*
      This asserts a DECLARATION, not a measured box, and the distinction is the
      whole reason to say so plainly. jsdom performs no layout:
      `getBoundingClientRect` returns zeros for every element on the page, so
      nothing in this repository can measure a rendered target and nothing
      should claim to. Only a real browser can, and section 5 makes adding one
      an ADR.

      What is checkable here is that the declaration exists and is not inert,
      which is the failure mode that actually happens: `min-height` does nothing
      on an inline box, so `min-height: 44px` on a `<button>` or an `<a>` left
      at its default `display` is a 44px promise that renders as a 20px target.
      The display is asserted with the height for that reason — the two are one
      claim, and either alone is not it.

      Section 25 asks for 44x44. Width is not asserted: every control here is
      either the full width of its column or a word with padding around it, and
      a `min-width` on any of them would be a claim about text this file cannot
      see.
    */
    for (const selector of TOUCH_TARGETS) {
      const rule = ruleFor(selector);

      expect(rule).toMatch(/min-height\s*:\s*44px/);
      expect(rule).toMatch(/display\s*:\s*(inline-)?flex/);
    }
  });

  it("draws none of them with --rule, which is what arms its contrast exemption", () => {
    /*
      `palette.test.ts` leaves `--rule` out of the 3:1 loop and says exactly
      when that stops being right: "the moment `--rule` is used as a control's
      boundary, an input's border, or the only thing distinguishing a checked
      box from an unchecked one". The token is 2.94:1 on the light surface, so
      that moment is a WCAG 2.2 SC 1.4.11 failure — and until now it was a
      trigger with nothing behind it. `border: 1px solid var(--rule)` on the
      theme toggle passed every assertion in both files.

      This is the arming. The eleven uses in this file today are all decorative
      boundaries between blocks of TEXT, which is why they are all still legal
      here: none of them sits in a rule that names a control.

      Matched by prefix rather than by whole word, deliberately. `.theme-
      options` is the fieldset that groups the theme radios and `.interest-
      choices` the one that groups the checkboxes; a border drawn around a
      group of controls is those controls' boundary just as much as a border on
      each of them, and it is the likelier thing to reach for.
    */
    const controlNames = TOUCH_TARGETS.map((target) =>
      target.replace(/:.*$/, ""),
    );
    const controlRules = [
      ...declarations.matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ].filter((rule) =>
      controlNames.some((name) => (rule[1] ?? "").includes(name)),
    );

    // Non-vacuous: a renamed control would otherwise empty this loop and pass.
    expect(controlRules.length).toBeGreaterThanOrEqual(TOUCH_TARGETS.length);

    for (const rule of controlRules) {
      const selector = (rule[1] ?? "").trim();
      expect([selector, /var\(\s*--rule\b/.test(rule[2] ?? "")]).toStrictEqual([
        selector,
        false,
      ]);
    }
  });
});

describe("the theme panel", () => {
  it("is rendered rather than unrendered, so its radios stay reachable", () => {
    /*
      The same argument the skip link makes below, applied to the one other
      thing in the reader that appears and disappears. `display: none` and
      `visibility: hidden` both remove an element and its descendants from the
      tab order, so a panel wearing either would leave the toggle announcing
      `aria-expanded="true"` over three radios nobody can reach — the disclosure
      opening onto nothing.

      jsdom applies no author CSS, so `ThemeChoice.test.tsx` renders the radios,
      finds them, operates them and stays green through it. This file is the
      only place the declaration is visible at all.
    */
    const panel = ruleFor(".theme-options");
    expect(panel).not.toMatch(/display\s*:\s*none/i);
    expect(panel).not.toMatch(/visibility\s*:\s*hidden/i);

    const row = ruleFor(".theme-option");
    expect(row).not.toMatch(/display\s*:\s*none/i);
    expect(row).not.toMatch(/visibility\s*:\s*hidden/i);
  });
});

describe("the live region", () => {
  it("is clipped rather than merely positioned, so it is never read as text", () => {
    /*
      `.visually-hidden` dresses the shell's `role="status"`, whose content is
      written for a screen reader and for nobody else — "Loading the edition.",
      "The edition could not be loaded." A rule that lost its clipping would
      put those sentences into the page as visible body text, stacked above the
      heading that already says the same thing.

      Asserted as the pair that does the hiding, because either half alone does
      not: `position: absolute` without the clip is a 1px box drawn somewhere,
      and the clip without `overflow: hidden` leaves the text able to spill.
      Predates AB-205 and is asserted now for the reason the rest of this file
      exists — jsdom applies no author CSS, so every rendering test in this
      suite passes with the rule emptied.
    */
    const region = ruleFor(".visually-hidden");

    expect(region).toMatch(/position\s*:\s*absolute/);
    expect(region).toMatch(/width\s*:\s*1px/);
    expect(region).toMatch(/height\s*:\s*1px/);
    expect(region).toMatch(/overflow\s*:\s*hidden/);
    expect(region).toMatch(/clip-path\s*:\s*inset/);
  });
});

describe("the skip link", () => {
  it("is clipped rather than unrendered, so it stays focusable", () => {
    /*
      `display: none` and `visibility: hidden` both remove an element from the
      tab order, so a skip link wearing either is not reachable at all — the
      page would have no bypass mechanism while appearing to have one. Clipping
      keeps it rendered, focusable and in the accessibility tree, invisible only
      because there is nothing left of it to see.

      Written out here rather than composed from `.visually-hidden`, and that is
      deliberate: `.visually-hidden` dresses the live region, an element that
      must NEVER become visible, so it carries no `:focus` escape and never
      will. A skip link wearing it would stay a clipped 1px box while focused —
      reachable, activatable, invisible — and jsdom applies no author CSS, so
      not one rendering test in this suite would notice.
    */
    const resting = ruleFor(".skip-link");

    expect(resting).toMatch(/clip-path\s*:\s*inset/);
    expect(resting).toMatch(/overflow\s*:\s*hidden/);
    expect(resting).not.toMatch(/display\s*:\s*none/i);
    expect(resting).not.toMatch(/visibility\s*:\s*hidden/i);
  });

  it("reveals itself on focus, in the flow rather than over the page", () => {
    /*
      `:focus`, not `:focus-visible`. The reveal must happen for anyone who
      lands on this link, including through assistive technology and including a
      pointer-driven focus that `:focus-visible`'s heuristic decides not to
      draw; a focused-but-invisible skip link is the exact failure the control
      exists to prevent.

      `position: static` puts it back in the flow, so it pushes the brand line
      down rather than covering it — WCAG 2.2 success criterion 2.4.11, and the
      only shape available anyway, since `fixed` and `sticky` are forbidden for
      this whole file.
    */
    expect(declarations).toContain(".skip-link:focus {");
    expect(declarations).not.toContain(".skip-link:focus-visible {");

    const revealed = ruleFor(".skip-link:focus");
    expect(revealed).toMatch(/clip-path\s*:\s*none/);
    expect(revealed).toMatch(/position\s*:\s*static/);
    expect(revealed).toMatch(/min-height\s*:\s*44px/);
  });
});
