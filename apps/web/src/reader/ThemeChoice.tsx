/**
 * The theme control: a resting button that reveals three radios.
 *
 * Three native `<input type="radio">` in a `<fieldset>`, for the reason
 * `InterestBoosts` uses native checkboxes. One choice out of three is what
 * radios are, so arrow-key movement within the group, the group's name, the
 * "2 of 3" position and every screen reader's own vocabulary for "selected"
 * come free — the platform primitive over the framework abstraction (section
 * 13). A custom widget would have to re-implement all four and would get one
 * of them wrong.
 *
 * Not a cycling "toggle theme" button. Such a button hides its own state — the
 * reader cannot tell what is set without pressing it — and it cannot express
 * three values at all, so "system" would be reachable only by pressing twice
 * past the value the reader wanted.
 *
 * Not a link, anywhere. The ready page carries exactly one link by assertion,
 * the shell's skip link, and a link-shaped control here would fail it; a
 * `/settings` route would also need the navigation affordance the shell has
 * deliberately tested away.
 *
 * A plain `<div>`, not `<section aria-labelledby>`. A named section is a
 * `region` landmark, and the shell exposes only banner, main and contentinfo
 * on purpose — a fourth would put "Theme" in every screen reader's landmark
 * menu, advertising settings as a part of the product.
 *
 * Choosing applies immediately, with no Save and no Cancel. The choice changes
 * colours and nothing else: there is no content to re-fetch, nothing to
 * reorder, and no draft worth keeping, so a confirmation step would ask the
 * reader to approve something already visible in front of them.
 *
 * Nothing here animates. A theme swap that faded would be motion attached to
 * an accessibility control, which is the one place `prefers-reduced-motion`
 * would matter most; the stylesheet declares no motion at all and
 * `styles.test.ts` keeps it that way.
 */

import type { JSX } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { Theme } from "../local-state/local-state";
import { useTheme } from "./theme";

/**
 * The three options, in the order they are offered.
 *
 * System first, because it is the product default and the answer a reader who
 * has never touched this control is already getting; light and dark follow in
 * the order the palette declares them. Written out rather than derived from
 * `THEMES`, whose order is a storage contract: the order a schema lists values
 * in is not an argument about which one to offer first.
 */
const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly {
  readonly value: Theme;
  readonly label: string;
}[];

export function ThemeChoice(): JSX.Element {
  const { theme, chooseTheme } = useTheme();
  const [isOpen, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  /* One radio group per instance, so two shells on a page could not silently
     share a group and unselect each other. */
  const groupName = useId();

  /* Seeded with the current value, the idiom `InterestBoosts` and
     `EditionEnding` use, so focus moves on a CHANGE rather than on a first
     render that happens to be in one state or the other. */
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (wasOpen.current === isOpen) {
      return;
    }
    wasOpen.current = isOpen;

    /*
      One transition, in one direction: the panel going away.

      The radios unmount with it, so a reader whose focus was on one of them
      would be dropped to `<body>` and lose their place at the top of the page
      — WCAG 2.2 success criterion 2.4.3. Focus returns to the toggle that
      replaced the panel, where `aria-expanded` has already said what happened.

      It does NOT move when the panel opens. The reader is standing on the
      toggle they just pressed, and moving them into the group would take them
      past the control they are operating.
    */
    if (isOpen) {
      return;
    }
    toggleRef.current?.focus();
  }, [isOpen]);

  return (
    <div className="theme-choice">
      {/*
        `aria-controls` is set only while the panel exists, exactly as on
        `StoryCard`'s and `InterestBoosts`'s disclosures: an IDREF pointing at
        an unmounted element is worse than no IDREF, because assistive
        technology offers to jump to a dead end. `aria-expanded` announces the
        state, and it is present in both.
      */}
      <button
        type="button"
        className="theme-toggle"
        ref={toggleRef}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setOpen(!isOpen)}
      >
        Theme
      </button>

      {isOpen ? (
        <fieldset className="theme-options" id={panelId}>
          <legend>Theme</legend>
          {THEME_OPTIONS.map((option) => (
            // The whole row is the label, so the target is the width of the
            // control and clears 44px by height — the reader aims at the word
            // rather than at a 13px circle.
            <label className="theme-option" key={option.value}>
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={option.value === theme}
                onChange={() => chooseTheme(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
