/**
 * The appearance the reader chose, kept on the device.
 *
 * The same two verbs as its three siblings — what was chosen, and please
 * remember this — with no storage API named above `local-state/` and no
 * document API named outside `theme/` (section 15).
 *
 * There is no `editionDate` parameter, for `useInterests`'s reason: a theme is
 * one answer that outlives every edition, so keying it by date would re-read
 * the device on every navigation to arrive at the value it already held.
 *
 * And there is NO snapshot twin, which is the more interesting omission because
 * `useInterests` has one. `useInterestSnapshot` exists because changing
 * interests recomposes the edition under a reader who is halfway through it:
 * stories they never saw appear in the middle of the list, the counter drops
 * back, and the closing message un-says that the edition is over — an unlock
 * mechanic however it is labelled (section 3.2). A theme changes no story, no
 * ordering, no counter and no denominator. Nothing is unlocked by it and
 * nothing shifts under the reader, so it applies immediately, and holding it
 * back until the next edition would be a delay invented to match a sibling.
 *
 * The read is synchronous, so the lazy `useState` initialiser makes the FIRST
 * render already correct and no loading state exists to model (section 26).
 */

import { useCallback, useEffect, useState } from "react";
import type { Theme } from "../local-state/local-state";
import { readTheme, rememberTheme } from "../local-state/local-state-store";
import { applyTheme } from "../theme/document-theme";

/**
 * The whole surface: the appearance, and the one way to change it.
 *
 * `chooseTheme` returns nothing, where `chooseInterests` returns whether the
 * device took the write. The rule is in `rememberTheme`: an interest choice has
 * no effect the reader can see, so a refused write is the whole of it and must
 * be reported; a theme has already changed the page by the time this returns,
 * and a boolean would invite a caller to put it back — taking dark away from a
 * reader who just asked for it because their storage is full.
 */
export type ThemeStore = {
  readonly theme: Theme;
  readonly chooseTheme: (theme: Theme) => void;
};

export function useTheme(): ThemeStore {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  const chooseTheme = useCallback((chosen: Theme) => {
    // A plain value rather than the updater its siblings use, because the state
    // is a string: React compares with `Object.is` and bails out of the
    // re-render when it is unchanged, which is what `useViewedStories` and
    // `useInterests` have to write a guard to get for a Set and an object.
    setTheme(chosen);

    /*
      In the handler body, deliberately outside any updater. React
      double-invokes state updaters and lazy initialisers to surface impure
      ones, and does not double-invoke event handlers, so a write placed in an
      updater would run twice per choice in development and in StrictMode.

      The state moves whether or not the write lands, and `rememberTheme`
      returns nothing so that it cannot do otherwise. A reader whose device
      refuses the write still reads in the appearance they chose for the rest of
      the session; what they lose is that it is still chosen tomorrow, which is
      reported on the console once and never to them (ADR-0007).
    */
    rememberTheme(chosen);
  }, []);

  /*
    A legitimate effect, not a derived value smuggled into one (section 14).
    `<html>` is outside the React root and outside every component's return
    value, so no render can put an attribute on it; synchronising an external
    system is exactly what an effect is for.

    It is a REPAIR rather than the source of the first paint. The document
    served to the reader carries an inline script that has already applied the
    stored theme before this bundle parses, so by the time this runs the
    attribute is normally the one it is about to write. That ordering is what
    keeps a reader who chose dark from seeing a white page flash while React
    mounts — an effect cannot run before paint, so nothing here could prevent
    it. What this does own is every change AFTER that: the reader pressing the
    control, and the repair if the inline script and this hook ever disagree.
  */
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { theme, chooseTheme };
}
