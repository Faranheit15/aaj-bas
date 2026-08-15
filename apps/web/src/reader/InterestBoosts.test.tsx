import "@testing-library/jest-dom/vitest";
import { INTEREST_SLUGS, type InterestSlug } from "@aaj-bas/schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { JSX } from "react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InterestsRead } from "../local-state/local-state-store";
import { InterestBoosts } from "./InterestBoosts";
import { TOPIC_LABELS } from "./story-labels";

/*
  Driven entirely by props. The component is handed the device's answer, whether
  the invitation may be shown, and one callback, so every state below is
  reachable without storage, a rendered edition, or a reader who has expanded
  anything — which is what makes "this string never appears here" an assertion
  about the component rather than about whichever state a fixture happened to
  be in.
*/

const UNANSWERED = { status: "unanswered" } as const satisfies InterestsRead;
const UNKNOWN = { status: "unknown" } as const satisfies InterestsRead;

function answered(...interests: readonly InterestSlug[]): InterestsRead {
  return { status: "answered", interests };
}

/**
 * The six labels, written out rather than derived.
 *
 * Deriving them from `TOPIC_LABELS` would make the assertions agree with the
 * map by construction, including on the day someone edits the map. The tie to
 * the shared vocabulary is asserted once, on its own, just below.
 */
const OPTION_LABELS = [
  "Business & Economy",
  "Science, Health & Climate",
  "Technology & AI",
  "Culture & Entertainment",
  "Sports",
  "Policy & Geopolitics",
] as const;

const EXPLAINER =
  "Two of the ten stories in each edition follow topics you choose.";
const SCOPE =
  "Your choice applies to the next edition you open, not to this one.";
const OPTIONS_TEXT = `Choose up to two${OPTION_LABELS.join("")}`;

type BoostCase = {
  readonly read: InterestsRead;
  readonly canInvite: boolean;
  readonly onChoose: (interests: readonly InterestSlug[]) => boolean;
};

/** The defaults every test overrides one axis of. */
function boostCase(overrides: Partial<BoostCase>): BoostCase {
  return {
    read: UNANSWERED,
    canInvite: true,
    onChoose: () => true,
    ...overrides,
  };
}

function renderBoosts(overrides: Partial<BoostCase>): void {
  render(<InterestBoosts {...boostCase(overrides)} />);
}

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }

  return value;
}

function boostsBlock(): HTMLElement {
  return present(
    document.querySelector<HTMLElement>(".interest-boosts"),
    "the interest block",
  );
}

function disclosure(): HTMLElement {
  return screen.getByRole("button", { name: "Change interest boosts" });
}

function optionsGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Choose up to two" });
}

function option(label: string): HTMLElement {
  return screen.getByRole("checkbox", { name: label });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("when the block is not on the page at all", () => {
  it("renders nothing before the reader has reached the trigger", () => {
    // PRD section 7.1: nothing is asked until two stories are open or the
    // edition is finished. Until then this is not a collapsed prompt, a badge,
    // or a dot — it is absent.
    const { container } = render(
      <InterestBoosts {...boostCase({ read: UNANSWERED, canInvite: false })} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector(".interest-boosts")).toBeNull();
  });

  it("renders nothing when the device's state can be neither read nor written", () => {
    /*
      The honest answer for a device holding a document this build cannot read,
      or with storage switched off, and it is honest in both directions: asking
      would re-ask a reader who has already answered, and the answer they gave
      would then be silently refused. A picker that cannot keep an answer is
      worse than no picker.
    */
    const { container } = render(
      <InterestBoosts {...boostCase({ read: UNKNOWN, canInvite: true })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("the invitation", () => {
  it("is offered once the trigger has been reached", () => {
    renderBoosts({ read: UNANSWERED, canInvite: true });

    expect(
      screen.getByRole("heading", { level: 2, name: "Interest boosts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save interest boosts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No thanks" }),
    ).toBeInTheDocument();
  });

  it("is never offered again once the reader has answered, including by declining", () => {
    /*
      The assertion that makes the empty array an ANSWER rather than an absence,
      and it is why no dismissal flag exists anywhere in this slice. A reader
      who pressed "No thanks" is stored as having chosen nothing, and with the
      trigger still true — they are at the end of an edition, as they will be
      every day — the invitation must not come back.
    */
    for (const read of [answered(), answered("sports")]) {
      renderBoosts({ read, canInvite: true });

      expect(
        screen.queryByRole("button", { name: "Save interest boosts" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull();
      expect(screen.queryByRole("group")).toBeNull();
      expect(disclosure()).toBeInTheDocument();

      cleanup();
    }
  });

  it("moves no focus, announces nothing, and scrolls nothing when it appears", () => {
    /*
      The single most important behaviour in this component. The invitation
      arrives while the reader is at the bottom of an edition, and everything
      that would make its arrival noticeable is an interruption: `autoFocus`
      takes the page out from under a keyboard reader, `role="status"` or
      `aria-live` speaks over whatever a screen-reader user was reading, and
      `scrollIntoView` moves the page under a thumb mid-sentence.

      If the reader cannot tell it arrived until they reach it, it did not
      interrupt. Driven through a really focused control, so what is asserted is
      the reader's place on the page rather than `<body>`.
    */
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    try {
      const { rerender } = render(
        <>
          <button type="button">A story headline</button>
          <InterestBoosts {...boostCase({ canInvite: false })} />
        </>,
      );
      const headline = screen.getByRole("button", { name: "A story headline" });
      headline.focus();

      rerender(
        <>
          <button type="button">A story headline</button>
          <InterestBoosts {...boostCase({ canInvite: true })} />
        </>,
      );

      // It really did arrive, so a component that rendered nothing cannot pass.
      expect(optionsGroup()).toBeInTheDocument();
      expect(document.activeElement).toBe(headline);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(document.querySelector("[aria-live]")).toBeNull();
      expect(document.querySelector("[autofocus]")).toBeNull();
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });
});

describe("the six choices", () => {
  it("names the same topics the stories do", () => {
    // One place, one vocabulary. A second list of names would drift from the
    // cards' the first time a topic was reworded.
    expect(INTEREST_SLUGS.map((slug) => TOPIC_LABELS[slug])).toEqual([
      ...OPTION_LABELS,
    ]);
  });

  it("is one group of exactly six checkboxes, named for the six interests", () => {
    /*
      Four substitutions fail here, and each is a plausible thing to reach for:
      radios (which cannot express two of six), a listbox or `aria-pressed`
      toggles (which throw away the keyboard behaviour and the state vocabulary
      that come free with a checkbox), a seventh option, and — the one with
      product consequences — "India" or "World" appearing. PRD section 5.3 makes
      those two core coverage rather than something to opt into, so a picker
      offering them would let a reader believe they had turned India off.
    */
    renderBoosts({ read: UNANSWERED, canInvite: true });
    const group = optionsGroup();
    const boxes = within(group).getAllByRole("checkbox");

    expect(boxes).toHaveLength(OPTION_LABELS.length);
    for (const [at, label] of OPTION_LABELS.entries()) {
      expect(present(boxes[at], `checkbox ${at}`)).toHaveAccessibleName(label);
    }
    expect(boxes.map((box) => box.getAttribute("value"))).toEqual([
      ...INTEREST_SLUGS,
    ]);

    expect(within(group).queryByRole("checkbox", { name: "India" })).toBeNull();
    expect(within(group).queryByRole("checkbox", { name: "World" })).toBeNull();
    expect(within(group).queryAllByRole("radio")).toHaveLength(0);
    expect(within(group).queryAllByRole("option")).toHaveLength(0);
    expect(group.querySelector("[aria-pressed]")).toBeNull();
  });

  it("keeps the options a list, and states the limit exactly once", () => {
    /*
      "list, 6 items" is how a screen-reader user knows how many topics there
      are to weigh before starting, which is why the stylesheet empties the
      marker rather than dropping list semantics.

      The limit belongs to the group, and the legend is announced with every
      option; repeating it per option would say it six times. Counted by
      splitting the block's whole text, so a "(up to two)" added beside an
      option is caught wherever it is put.
    */
    renderBoosts({ read: UNANSWERED, canInvite: true });

    const list = within(optionsGroup()).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      OPTION_LABELS.length,
    );
    expect(
      present(boostsBlock().textContent, "the block's text").split("up to two"),
    ).toHaveLength(2);
  });

  it("makes only the unchosen options unavailable at the limit, never a chosen one", () => {
    /*
      A chosen box is never disabled, because a slot has to stay freeable: a
      control that can be filled and not emptied is a dead end, and the box that
      just took focus must never be the one that goes away underneath it.

      The two alternatives are worse in kind. Dropping the oldest tick is an
      invisible destructive edit to a deliberate choice, and it would need the
      tick order the storage layer sorts away on purpose. Accepting a third and
      refusing it at Save scolds the reader for doing what the form allowed.
    */
    renderBoosts({ read: UNANSWERED, canInvite: true });

    fireEvent.click(option("Technology & AI"));
    fireEvent.click(option("Sports"));

    expect(option("Technology & AI")).toBeEnabled();
    expect(option("Sports")).toBeEnabled();
    for (const label of OPTION_LABELS) {
      if (label === "Technology & AI" || label === "Sports") {
        continue;
      }
      expect(option(label)).toBeDisabled();
    }
  });

  it("frees the slot again when the reader unticks one", () => {
    renderBoosts({ read: UNANSWERED, canInvite: true });

    fireEvent.click(option("Technology & AI"));
    fireEvent.click(option("Sports"));
    fireEvent.click(option("Sports"));

    expect(option("Sports")).not.toBeChecked();
    expect(option("Sports")).toBeEnabled();
    for (const label of OPTION_LABELS) {
      expect(option(label)).toBeEnabled();
    }
  });
});

describe("answering", () => {
  it("saves exactly what was ticked, in the schema's order and nothing else", () => {
    // Ticked in the other order on purpose: tick order is a record of how the
    // control was used, not of what was chosen, and it is not part of the
    // answer.
    const onChoose = vi.fn(() => true);
    renderBoosts({ read: UNANSWERED, canInvite: true, onChoose });

    fireEvent.click(option("Sports"));
    fireEvent.click(option("Technology & AI"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save interest boosts" }),
    );

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(["technology-ai", "sports"]);
  });

  it("treats 'No thanks' as an answer, and the answer is empty", () => {
    /*
      Not a dismissal, and not "Not now". The product never asks again, so
      "Not now" would be a promise to come back that is not kept — and a reader
      declines on the strength of that promise. Declining is stored as choosing
      nothing, which is what makes the invitation stay gone.
    */
    const onChoose = vi.fn(() => true);
    renderBoosts({ read: UNANSWERED, canInvite: true, onChoose });

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith([]);
    expect(boostsBlock()).not.toHaveTextContent(/not now/i);
  });

  it("saves nothing when the reader only looks at the invitation", () => {
    const onChoose = vi.fn(() => true);
    renderBoosts({ read: UNANSWERED, canInvite: true, onChoose });

    fireEvent.click(option("Sports"));

    expect(onChoose).not.toHaveBeenCalled();
  });
});

/**
 * The picker wired to a store, which is how the reader meets it: answering
 * replaces the invitation with the settings control.
 */
function Wired({
  initial,
  canInvite,
  kept = true,
}: {
  readonly initial: InterestsRead;
  readonly canInvite: boolean;
  /**
   * What the device said about the write, which the real store reports and
   * this component is arranged to ignore.
   *
   * The state moves either way, exactly as `useInterests` moves it either way:
   * a reader who pressed Save has answered, and a device that refuses to
   * remember it does not get to turn that back into a question.
   */
  readonly kept?: boolean;
}): JSX.Element {
  const [read, setRead] = useState<InterestsRead>(initial);

  return (
    <>
      <button type="button">A story headline</button>
      <InterestBoosts
        read={read}
        canInvite={canInvite}
        onChoose={(interests) => {
          setRead({ status: "answered", interests });

          return kept;
        }}
      />
    </>
  );
}

describe("where focus goes", () => {
  it("moves to the control that replaced Save, rather than dropping to the body", () => {
    /*
      Pressing Save unmounts the button the reader just activated, which drops
      focus to `<body>` and loses a keyboard reader's place on the page entirely
      — WCAG 2.2 success criterion 2.4.3, the same failure AB-203 repaired at
      the end of the edition.

      Focus moves to the disclosure that replaced the form, and that IS the
      confirmation: it reads "Change interest boosts" with the chosen topics
      named beside it. No "Saved!" message and no live region, because focus
      landing on a control that says what was saved has already said it.
    */
    render(<Wired initial={UNANSWERED} canInvite={true} />);

    fireEvent.click(option("Sports"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save interest boosts" }),
    );

    expect(document.activeElement).toBe(disclosure());
    expect(boostsBlock()).toHaveTextContent("Chosen: Sports.");
  });

  it("does the same when the reader declines", () => {
    render(<Wired initial={UNANSWERED} canInvite={true} />);

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(document.activeElement).toBe(disclosure());
    expect(boostsBlock()).toHaveTextContent("Chosen: none.");
  });

  it("does the same when the device refused to keep the answer", () => {
    /*
      The one path no other test in this file drives: `onChoose` returning
      false. The component ignores the boolean deliberately, and "ignores" has
      two failure modes that look like care and are asserted against here.

      Leaving the form open would be the natural way to let the reader "try
      again", and it is a dead end: the write will be refused again, Save
      appears to do nothing, and the button the reader is pressing is the one
      the effect can no longer move focus off. And an alert would put a warning
      under an edition about a preference that affects a future one — alarm
      about something the reader can do nothing about, for a choice the product
      has already applied in front of them.

      What the reader is told is what is true either way: this is what you
      chose, and it applies to the next edition you open.
    */
    render(<Wired initial={UNANSWERED} canInvite={true} kept={false} />);

    fireEvent.click(option("Sports"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save interest boosts" }),
    );

    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(disclosure());
    expect(boostsBlock()).toHaveTextContent("Chosen: Sports.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  it("returns to the disclosure when the panel is cancelled or saved", () => {
    for (const closing of ["Cancel", "Save interest boosts"]) {
      renderBoosts({ read: answered("sports"), canInvite: false });

      fireEvent.click(disclosure());
      fireEvent.click(screen.getByRole("button", { name: closing }));

      expect(document.activeElement).toBe(disclosure());
      expect(screen.queryByRole("group")).toBeNull();

      cleanup();
    }
  });

  it("leaves focus where it is when the reader opens the panel", () => {
    // The disclosure the reader just pressed keeps focus, and `aria-expanded`
    // has already said what happened. Moving focus into the panel would take
    // them past the summary they had just read.
    renderBoosts({ read: answered("sports"), canInvite: false });

    disclosure().focus();
    fireEvent.click(disclosure());

    expect(document.activeElement).toBe(disclosure());
    expect(optionsGroup()).toBeInTheDocument();
  });
});

describe("the settings control", () => {
  it("says what was chosen, and offers the panel closed", () => {
    renderBoosts({
      read: answered("technology-ai", "sports"),
      canInvite: false,
    });

    expect(boostsBlock()).toHaveTextContent(
      "Chosen: Technology & AI and Sports.",
    );
    expect(disclosure()).toHaveAttribute("aria-expanded", "false");
    // Only while the panel exists: an IDREF pointing at an unmounted element
    // offers assistive technology a jump to a dead end.
    expect(disclosure()).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("opens onto the stored choice, already ticked", () => {
    renderBoosts({ read: answered("sports"), canInvite: false });

    fireEvent.click(disclosure());

    expect(disclosure()).toHaveAttribute("aria-expanded", "true");
    expect(
      present(
        disclosure().getAttribute("aria-controls"),
        "the panel the disclosure controls",
      ),
    ).toBe(present(document.querySelector("form"), "the panel").id);
    expect(option("Sports")).toBeChecked();
    expect(option("Technology & AI")).not.toBeChecked();
  });

  it("keeps the stored choice when the panel is cancelled", () => {
    const onChoose = vi.fn(() => true);
    renderBoosts({ read: answered("sports"), canInvite: false, onChoose });

    fireEvent.click(disclosure());
    fireEvent.click(option("Technology & AI"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChoose).not.toHaveBeenCalled();
    expect(boostsBlock()).toHaveTextContent("Chosen: Sports.");
  });

  it("discards the abandoned edit when the panel is opened again", () => {
    renderBoosts({
      read: answered("sports"),
      canInvite: false,
      onChoose: () => true,
    });

    fireEvent.click(disclosure());
    fireEvent.click(option("Technology & AI"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(disclosure());

    expect(option("Technology & AI")).not.toBeChecked();
    expect(option("Sports")).toBeChecked();
  });

  it("changes the answer from the panel", () => {
    const onChoose = vi.fn(() => true);
    renderBoosts({ read: answered("sports"), canInvite: false, onChoose });

    fireEvent.click(disclosure());
    fireEvent.click(option("Sports"));
    fireEvent.click(option("Policy & Geopolitics"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save interest boosts" }),
    );

    expect(onChoose).toHaveBeenCalledWith(["policy-geopolitics"]);
  });
});

/**
 * Every state the block can be in, asserted as its entire text AND its exact
 * element children.
 *
 * The other tests in this file name the copy they expect and then sweep for a
 * banned vocabulary. That catches a line which names the mechanic and misses
 * every line that does not, which is most of them: "Two more stories are yours
 * tomorrow." is a promise of more content, "Readers like you also follow
 * Sports." is behavioural ranking (section 3.3), "Day 3 of your run." is a
 * streak, and "Nice pick." is praise for answering. None contains a banned
 * word, and each is a plausible thing for a later slice to add beside a
 * confirmation.
 *
 * So this inverts the question. A keyword regex judges vocabulary; the block's
 * ENTIRE text judges behaviour — anything added here has to change one of these
 * strings, and therefore has to be argued for rather than slipping in beside a
 * `not.toHaveTextContent`.
 *
 * The children are asserted with the text because a mechanic need not be text
 * at all. An empty `<div className="interest-progress" aria-hidden />` two
 * pixels tall leaves every `textContent` on the page identical and is a meter;
 * so is a `<span>` holding a dot per chosen topic. The block holds exactly the
 * elements listed here, so a decorative one is caught by being an element.
 */
type Child = {
  readonly tag: string;
  readonly className: string;
  readonly text: string;
};

const STATES: readonly {
  readonly what: string;
  readonly case: Partial<BoostCase>;
  readonly open: boolean;
  /** Options ticked after the form is on the page, for the states at the cap. */
  readonly tick?: readonly string[];
  readonly children: readonly Child[];
}[] = [
  {
    what: "inviting a reader who has reached the trigger",
    case: { read: UNANSWERED, canInvite: true },
    open: false,
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      { tag: "P", className: "interest-explainer", text: EXPLAINER },
      { tag: "P", className: "interest-scope", text: SCOPE },
      {
        tag: "FORM",
        className: "interest-form",
        text: `${OPTIONS_TEXT}Save interest boostsNo thanks`,
      },
    ],
  },
  {
    what: "inviting a reader who has ticked both boxes",
    case: { read: UNANSWERED, canInvite: true },
    open: false,
    /*
      The invitation AT THE CAP, which is a state the block never renders on
      its own and therefore a state nothing above reaches. It is where a count
      would go: "Both boosts chosen." reads as helpful confirmation and is a
      score for filling the slots, and the four disabled boxes are the moment a
      later slice is most tempted to explain itself. The children are identical
      to the invitation's, because reaching the cap must change what the reader
      can DO and not what the block SAYS.
    */
    tick: ["Technology & AI", "Sports"],
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      { tag: "P", className: "interest-explainer", text: EXPLAINER },
      { tag: "P", className: "interest-scope", text: SCOPE },
      {
        tag: "FORM",
        className: "interest-form",
        text: `${OPTIONS_TEXT}Save interest boostsNo thanks`,
      },
    ],
  },
  {
    what: "showing two chosen topics, collapsed",
    case: { read: answered("technology-ai", "sports"), canInvite: false },
    open: false,
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      {
        tag: "P",
        className: "interest-summary",
        text: "Chosen: Technology & AI and Sports.",
      },
      {
        tag: "P",
        className: "edition-actions",
        text: "Change interest boosts",
      },
    ],
  },
  {
    what: "showing one chosen topic, collapsed",
    case: { read: answered("sports"), canInvite: false },
    open: false,
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      { tag: "P", className: "interest-summary", text: "Chosen: Sports." },
      {
        tag: "P",
        className: "edition-actions",
        text: "Change interest boosts",
      },
    ],
  },
  {
    what: "showing a reader who declined, collapsed",
    case: { read: answered(), canInvite: true },
    open: false,
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      { tag: "P", className: "interest-summary", text: "Chosen: none." },
      {
        tag: "P",
        className: "edition-actions",
        text: "Change interest boosts",
      },
    ],
  },
  {
    what: "the panel open on a stored choice",
    case: { read: answered("sports"), canInvite: false },
    open: true,
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      { tag: "P", className: "interest-summary", text: "Chosen: Sports." },
      {
        tag: "P",
        className: "edition-actions",
        text: "Change interest boosts",
      },
      {
        tag: "FORM",
        className: "interest-form",
        text: `${EXPLAINER}${SCOPE}${OPTIONS_TEXT}Save interest boostsCancel`,
      },
    ],
  },
  {
    what: "the panel open on two stored topics",
    case: { read: answered("technology-ai", "sports"), canInvite: false },
    open: true,
    /*
      The other state at the cap, and the one a reader reaches by having
      answered rather than by ticking. It is the natural home for praise —
      "Nice pick." beside a full selection — which is a reward for answering a
      question (section 3.2) that no keyword sweep would catch.
    */
    children: [
      { tag: "H2", className: "interest-heading", text: "Interest boosts" },
      {
        tag: "P",
        className: "interest-summary",
        text: "Chosen: Technology & AI and Sports.",
      },
      {
        tag: "P",
        className: "edition-actions",
        text: "Change interest boosts",
      },
      {
        tag: "FORM",
        className: "interest-form",
        text: `${EXPLAINER}${SCOPE}${OPTIONS_TEXT}Save interest boostsCancel`,
      },
    ],
  },
];

/** One state put on the page: rendered, opened if it is a panel, then ticked. */
function renderState(state: (typeof STATES)[number]): void {
  renderBoosts(state.case);
  if (state.open) {
    fireEvent.click(disclosure());
  }
  for (const label of state.tick ?? []) {
    fireEvent.click(option(label));
  }
}

describe("exactly what the block says, in every state it has", () => {
  for (const state of STATES) {
    const { what, children } = state;

    it(`says this and nothing else when ${what}`, () => {
      renderState(state);
      const block = boostsBlock();

      expect(block.textContent).toBe(
        children.map((child) => child.text).join(""),
      );
      expect(
        [...block.children].map((child) => ({
          tag: child.tagName,
          className: child.className,
          text: child.textContent,
        })),
      ).toEqual([...children]);

      /*
        A link here is the continuation surface constitution 1 rules out — a
        "browse all topics" page, a "more like this", an archive. `status` and
        `alert` would announce the block's arrival, which is the interruption
        this component is arranged to avoid. `progressbar` and `aria-valuenow`
        are the meter that would turn choosing topics into a profile to
        complete, and an inline width is the one form a fill has to take, since
        a stylesheet cannot know the number.
      */
      expect(within(block).queryAllByRole("link")).toHaveLength(0);
      expect(within(block).queryByRole("status")).toBeNull();
      expect(within(block).queryByRole("alert")).toBeNull();
      expect(within(block).queryByRole("progressbar")).toBeNull();
      expect(block.querySelector("[aria-live]")).toBeNull();
      expect(block.querySelector("[aria-valuenow]")).toBeNull();
      for (const styled of block.querySelectorAll("[style]")) {
        expect(styled.getAttribute("style")).not.toMatch(/width|%/);
      }
    });
  }

  it("uses no digit anywhere, in any state", () => {
    /*
      One cheap assertion against a whole family of mechanics. "1 of 2
      selected", "2 more stories unlocked", "Day 3", "You have chosen 1 topic"
      and every progress fraction has to write a number down; the copy spells
      its one quantity — two — as a word, so any digit at all is something new.
    */
    for (const state of STATES) {
      renderState(state);

      expect(boostsBlock().textContent).not.toMatch(/\d/);

      cleanup();
    }
  });

  it("never rewards, ranks, or promises more, in any state", () => {
    for (const state of STATES) {
      renderState(state);

      expect(boostsBlock()).not.toHaveTextContent(
        /streak|badge|reward|point|score|congrat|well done|unlock|you may also like|recommend|don't miss|missing out|more stories|personali[sz]|tailor/i,
      );

      cleanup();
    }
  });
});
