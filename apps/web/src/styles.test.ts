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
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install; `index-html.test.ts` reads the
 * served document the same way. It also resolves relative to this file, so the
 * test does not depend on a working directory.
 */
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
  });

  it("animates nothing, so there is no motion to reduce", () => {
    // A completion animation is the celebration section 3.2 rules out, and
    // `.edition-ending-message` is where it would land.
    expect(declarations).not.toMatch(/@keyframes/i);
    expect(declarations).not.toMatch(/\banimation[a-z-]*\s*:/i);
    expect(declarations).not.toMatch(/\btransition[a-z-]*\s*:/i);
  });

  it("pins nothing to the viewport, so the ending stays at the end", () => {
    /*
      `position: absolute` is deliberately still allowed: `.visually-hidden`
      needs it to keep the live region in the accessibility tree while clipping
      it out of the page, and clipping a region is not following the reader
      down it. Sticky and fixed are the two that are.
    */
    expect(declarations).not.toMatch(/position\s*:\s*sticky/i);
    expect(declarations).not.toMatch(/position\s*:\s*fixed/i);
  });
});
