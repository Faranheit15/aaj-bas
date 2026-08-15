/**
 * The only module in the reader that touches the document element.
 *
 * The same boundary `device-storage.ts` draws around localStorage, drawn around
 * `<html>` for the same reason (section 15): everything above this file works
 * in terms of a `Theme`, and nothing above it knows that an appearance is
 * applied by setting an attribute — or that "system" is applied by NOT setting
 * one.
 *
 * That last part is the whole mechanism, and it is easy to undo by accident.
 * The palette declares its light values under a bare `:root` and its dark
 * values under both `prefers-color-scheme: dark` and an explicit
 * `[data-theme="dark"]`, so an attribute is an OVERRIDE and its absence is a
 * deferral. Removing it hands the question back to the operating system, which
 * answers live: a reader who chose "system" and then switches their device to
 * dark at sunset sees the page follow, with no listener, no subscription and no
 * re-render, because this build never held an opinion about what their system
 * currently prefers.
 *
 * So nothing here resolves "system" into "light" or "dark". Doing it in
 * JavaScript would look tidier and would make the live-following property this
 * code's responsibility instead of the stylesheet's — which means a
 * `matchMedia` listener, a subscription to keep it current, a render in which
 * the answer is stale, and a first paint that cannot happen until the script
 * runs. The absence of that machinery is the design, and a test asserts it.
 */

import type { Theme } from "../local-state/local-state";

/**
 * The attribute the palette keys its explicit themes off.
 *
 * Exported so that the stylesheet's selector and this writer cannot drift apart
 * silently: they are one contract with two halves, and only one of them is
 * type-checked.
 */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * Puts one appearance on the document, or takes the override off.
 *
 * Idempotent, and cheap enough to call on every change without checking what is
 * already there: the DOM does its own comparison, and reading before writing
 * would be a second source of truth about a value only this function sets.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === "system") {
    // Not `setAttribute(THEME_ATTRIBUTE, "system")`, which would look like the
    // symmetrical thing to do and would pin the page to whichever palette the
    // unmatched selector happened to leave in place — permanently, for the one
    // reader who explicitly asked to follow their device.
    root.removeAttribute(THEME_ATTRIBUTE);
    return;
  }

  root.setAttribute(THEME_ATTRIBUTE, theme);
}
