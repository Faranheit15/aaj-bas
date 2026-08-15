import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../local-state/local-state";
import { ThemeChoice } from "./ThemeChoice";

/*
  The store is mocked rather than driven, because this component takes no props:
  the appearance is chrome, so it reads the device itself. Mocking `useTheme`
  gives every state below without localStorage, without an attribute on
  `<html>`, and without this file having an opinion about how either works —
  which is what makes "the checked radio is the stored theme" an assertion about
  the control rather than about storage.
*/
const chooseTheme = vi.fn<(theme: Theme) => void>();
let stored: Theme = "system";

vi.mock("./theme", () => ({
  useTheme: () => ({ theme: stored, chooseTheme }),
}));

beforeEach(() => {
  stored = "system";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The three, in the order they are offered. */
const OPTION_LABELS = ["System", "Light", "Dark"] as const;

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }

  return value;
}

function block(): HTMLElement {
  return present(
    document.querySelector<HTMLElement>(".theme-choice"),
    "the theme control",
  );
}

function toggle(): HTMLElement {
  return screen.getByRole("button", { name: "Theme" });
}

function group(): HTMLElement {
  return screen.getByRole("group", { name: "Theme" });
}

function open(): void {
  fireEvent.click(toggle());
}

describe("the resting control", () => {
  it("is a button, never a link", () => {
    /*
      The ready page carries exactly one link by assertion — the shell's skip
      link — so a link-shaped toggle here fails that assertion, and it would be
      a lie besides: this control has no destination.
    */
    render(<ThemeChoice />);

    expect(toggle().tagName).toBe("BUTTON");
    expect(toggle()).toHaveAttribute("type", "button");
    expect(within(block()).queryAllByRole("link")).toHaveLength(0);
  });

  it("offers the panel closed, with no dangling reference to it", () => {
    render(<ThemeChoice />);

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    // Only while the panel exists: an IDREF pointing at an unmounted element
    // offers assistive technology a jump to a dead end.
    expect(toggle()).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("adds no landmark to the shell", () => {
    /*
      The shell exposes banner, main and contentinfo, deliberately. A
      `<section aria-labelledby>` here would be a fourth, putting "Theme" in
      every screen reader's landmark menu above the stories — settings
      advertised as a part of the product rather than as chrome.
    */
    render(<ThemeChoice />);
    open();

    expect(block().tagName).toBe("DIV");
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(block().querySelector("section, nav, aside")).toBeNull();
  });
});

describe("the three appearances", () => {
  it("is one group of exactly three radios, named System, Light and Dark", () => {
    /*
      Four substitutions fail here. Checkboxes (which would let a reader ask for
      light AND dark, or for neither), a cycling `aria-pressed` toggle (which
      hides its own state and cannot express three values), a listbox (which
      throws away the arrow-key behaviour and the state vocabulary a radio group
      gets free), and — the one with product consequences — "System" going
      missing, which would leave a reader no way back to letting the operating
      system decide once they had touched the control.
    */
    render(<ThemeChoice />);
    open();

    const radios = within(group()).getAllByRole("radio");
    expect(radios).toHaveLength(OPTION_LABELS.length);
    for (const [at, label] of OPTION_LABELS.entries()) {
      expect(present(radios[at], `radio ${at}`)).toHaveAccessibleName(label);
    }
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "system",
      "light",
      "dark",
    ]);

    expect(within(group()).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(group()).queryAllByRole("option")).toHaveLength(0);
    expect(block().querySelector("[aria-pressed]")).toBeNull();
  });

  it("names the panel from the toggle only while the panel is there", () => {
    render(<ThemeChoice />);
    open();

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(
      present(toggle().getAttribute("aria-controls"), "the panel's id"),
    ).toBe(group().id);
  });

  it("puts every radio in one group, so choosing one clears the others", () => {
    // A per-radio `name` would leave three independent groups: the browser
    // would let all three be selected at once and arrow keys would move
    // nowhere.
    render(<ThemeChoice />);
    open();

    const names = within(group())
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("name"));

    expect(new Set(names).size).toBe(1);
    expect(present(names[0], "the group name")).not.toBe("");
  });

  it("checks the stored appearance, and only it", () => {
    for (const [theme, label] of [
      ["system", "System"],
      ["light", "Light"],
      ["dark", "Dark"],
    ] as const) {
      stored = theme;
      render(<ThemeChoice />);
      open();

      for (const candidate of OPTION_LABELS) {
        const radio = screen.getByRole("radio", { name: candidate });
        if (candidate === label) {
          expect(radio).toBeChecked();
        } else {
          expect(radio).not.toBeChecked();
        }
      }

      cleanup();
    }
  });
});

describe("choosing", () => {
  it("applies the choice immediately, with the value chosen and nothing else", () => {
    /*
      No Save, and no Cancel. The choice changes colours and nothing else — no
      content to re-fetch, no ordering to redo, no draft worth keeping — so a
      confirmation step would ask the reader to approve something already
      visible in front of them.
    */
    render(<ThemeChoice />);
    open();

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(chooseTheme).toHaveBeenCalledTimes(1);
    expect(chooseTheme).toHaveBeenCalledWith("dark");
  });

  it("stores nothing when the reader only opens the panel", () => {
    render(<ThemeChoice />);
    open();

    expect(chooseTheme).not.toHaveBeenCalled();
  });

  it("leaves the panel open on the chosen radio", () => {
    // Closing it would take focus off the control the reader is operating and
    // stop them arrowing to the next appearance to compare it.
    render(<ThemeChoice />);
    open();

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(group()).toBeInTheDocument();
  });
});

describe("where focus goes", () => {
  it("returns to the toggle when the panel closes", () => {
    /*
      The radios unmount with the panel, so a reader standing on one would be
      dropped to `<body>` and lose their place at the top of the page — WCAG 2.2
      success criterion 2.4.3, the same failure `InterestBoosts` repairs at the
      end of the edition.

      Driven from a radio rather than from the toggle, because focus is already
      on the toggle after a real press: an effect that had been deleted would
      still look correct if the test closed the panel from the toggle itself.
    */
    render(<ThemeChoice />);
    open();
    const radio = screen.getByRole("radio", { name: "Dark" });
    radio.focus();
    expect(document.activeElement).toBe(radio);

    fireEvent.click(toggle());

    expect(document.activeElement).toBe(toggle());
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("leaves focus where it is when the reader opens the panel", () => {
    // The toggle the reader just pressed keeps focus, and `aria-expanded` has
    // already said what happened.
    render(<ThemeChoice />);
    toggle().focus();
    open();

    expect(document.activeElement).toBe(toggle());
    expect(group()).toBeInTheDocument();
  });

  it("moves no focus when it first appears", () => {
    // The control is in the banner, above the edition. Taking focus on mount
    // would put every reader on a preference before a word of the news.
    render(
      <>
        <button type="button">A story headline</button>
        <ThemeChoice />
      </>,
    );

    expect(document.activeElement).toBe(document.body);
    expect(document.querySelector("[autofocus]")).toBeNull();
  });
});

/**
 * Both states, asserted as the block's entire text AND its exact element
 * children, in the style `InterestBoosts.test.tsx` uses.
 *
 * A keyword sweep judges vocabulary; the whole text judges behaviour. "Dark
 * saves battery." is advice nobody asked for, "Recommended" is the product
 * having an opinion about a reader's eyes, "New" is a badge, and a count of how
 * often the theme has been changed is a behavioural record. None contains a
 * banned word and each is a plausible thing to add beside three radios.
 *
 * The children are asserted with the text because a mechanic need not be text
 * at all: an empty `<span className="theme-swatch" aria-hidden />` leaves every
 * `textContent` identical and is a colour chip, which is the one saturated
 * thing section 28 keeps out of a banner.
 */
type Child = {
  readonly tag: string;
  readonly className: string;
  readonly text: string;
};

const STATES: readonly {
  readonly what: string;
  readonly open: boolean;
  readonly children: readonly Child[];
}[] = [
  {
    what: "resting",
    open: false,
    children: [{ tag: "BUTTON", className: "theme-toggle", text: "Theme" }],
  },
  {
    what: "open on the three appearances",
    open: true,
    children: [
      { tag: "BUTTON", className: "theme-toggle", text: "Theme" },
      {
        tag: "FIELDSET",
        className: "theme-options",
        text: "ThemeSystemLightDark",
      },
    ],
  },
];

describe("exactly what the control says, in both states it has", () => {
  for (const state of STATES) {
    it(`says this and nothing else when ${state.what}`, () => {
      render(<ThemeChoice />);
      if (state.open) {
        open();
      }

      expect(block().textContent).toBe(
        state.children.map((child) => child.text).join(""),
      );
      expect(
        [...block().children].map((child) => ({
          tag: child.tagName,
          className: child.className,
          text: child.textContent,
        })),
      ).toEqual([...state.children]);

      /*
        `status` and `alert` would announce the appearance changing, which the
        reader can see; a live region for a colour swap speaks over whatever a
        screen-reader user was reading to tell them something they did not ask
        about.
      */
      expect(within(block()).queryAllByRole("link")).toHaveLength(0);
      expect(within(block()).queryByRole("status")).toBeNull();
      expect(within(block()).queryByRole("alert")).toBeNull();
      expect(block().querySelector("[aria-live]")).toBeNull();
      expect(block().querySelector("img, svg")).toBeNull();
    });
  }

  it("uses no digit anywhere, in either state", () => {
    // One cheap assertion against a whole family of mechanics: "3 appearances",
    // "changed 4 times", and every count that would turn a preference into
    // something with a history.
    for (const state of STATES) {
      render(<ThemeChoice />);
      if (state.open) {
        open();
      }

      expect(block().textContent).not.toMatch(/\d/);

      cleanup();
    }
  });

  it("never recommends, rewards, or advises, in either state", () => {
    for (const state of STATES) {
      render(<ThemeChoice />);
      if (state.open) {
        open();
      }

      expect(block()).not.toHaveTextContent(
        /recommend|suggested|popular|new\b|badge|reward|streak|point|try|tip|save[sd]? battery|personali[sz]/i,
      );

      cleanup();
    }
  });
});
