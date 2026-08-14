import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditionFreshness } from "../edition/edition-freshness";
import { EditionEnding } from "./EditionEnding";
import type { EditionProgress } from "./edition-progress";

/*
  Driven entirely by props. The component is handed freshness, a progress pair,
  and whether the edition has ended, so every case below is reachable without a
  clock, a device, or a rendered edition — which is what makes "and this string
  never appears" an assertion about the component rather than about whichever
  state a fixture edition happened to be in.
*/

const FRESHNESS_VALUES = [
  "current",
  "stale",
  "archived",
] as const satisfies readonly EditionFreshness[];

type EndingCase = {
  readonly freshness: EditionFreshness;
  readonly progress: EditionProgress;
  readonly hasEnded: boolean;
  readonly onEnd: () => void;
};

function progress(viewedCount: number, total: number): EditionProgress {
  return { viewedCount, total };
}

/** The defaults every test overrides one axis of. */
function endingCase(overrides: Partial<EndingCase>): EndingCase {
  return {
    freshness: "current",
    progress: progress(3, 8),
    hasEnded: false,
    onEnd: () => undefined,
    ...overrides,
  };
}

function renderEnding(overrides: Partial<EndingCase>): HTMLElement {
  const props = endingCase(overrides);
  render(<EditionEnding {...props} />);
  return endingBlock();
}

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}

function endingBlock(): HTMLElement {
  return present(
    document.querySelector<HTMLElement>(".edition-ending"),
    "the ending block",
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("while the reader is still in the edition", () => {
  it("offers the control, and says nothing about the edition being over", () => {
    /*
      The whole point of the slice's copy gate. `endingCopy` derives
      `nextEdition` from freshness alone, so "See you tomorrow." is a non-null
      string from the very first render of today's edition — a component that
      rendered it whenever it was non-null would be telling a reader three
      stories into an unfinished edition to leave, which is a nudge out of the
      product rather than the end of it.

      Asserted as the block's entire text, not as a couple of absences: a new
      line added here would have to be argued for rather than slipping in
      beside a `not.toHaveTextContent`.
    */
    const block = renderEnding({ freshness: "current", hasEnded: false });

    expect(
      screen.getByRole("button", { name: "End today's edition" }),
    ).toBeInTheDocument();
    expect(block).toHaveTextContent("End today's edition");
    expect(block.textContent).toBe("End today's edition");
    expect(block).not.toHaveTextContent(/tomorrow/i);
    expect(block).not.toHaveTextContent(/That's/);
  });

  it("says nothing about a next edition on a stale or archived edition either", () => {
    for (const freshness of ["stale", "archived"] as const) {
      const block = renderEnding({ freshness, hasEnded: false });

      expect(block.textContent).toBe("End this edition");
      cleanup();
    }
  });

  it("ends the edition once when the control is pressed", () => {
    const onEnd = vi.fn();
    renderEnding({ freshness: "current", hasEnded: false, onEnd });

    fireEvent.click(
      screen.getByRole("button", { name: "End today's edition" }),
    );

    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("when the reader ends the edition early", () => {
  it("states what they read without judging it, and takes the control away", () => {
    const block = renderEnding({
      freshness: "current",
      progress: progress(3, 8),
      hasEnded: true,
    });

    expect(
      screen.getByText("You read 3 of 8. That can be enough for today."),
    ).toBeInTheDocument();
    expect(screen.getByText("See you tomorrow.")).toBeInTheDocument();
    // One-way: the edition is over, so the thing that ends it is gone rather
    // than offered again.
    expect(screen.queryByRole("button")).toBeNull();
    expect(block).not.toHaveTextContent(/End (today's|this) edition/);
  });

  it("says nothing about tomorrow, or about today, on an archived edition", () => {
    /*
      Two separate mistakes, both easy. "See you tomorrow." on an edition the
      reader deliberately opened from a past date is an invitation to come back
      rather than the end of what they asked for; "today's" is a false
      statement about which day is on the screen, which is section 26's rule
      against presenting stale content as current, applied to copy.
    */
    const block = renderEnding({
      freshness: "archived",
      progress: progress(2, 8),
      hasEnded: true,
    });

    expect(
      screen.getByText("You read 2 of 8. That can be enough for today."),
    ).toBeInTheDocument();
    expect(block).not.toHaveTextContent(/tomorrow/i);
    expect(block).not.toHaveTextContent(/today's/i);
  });

  it("tells a stale reader where the next edition appears, never when", () => {
    // No hour, no countdown, no date. Publication here is a human merge, so a
    // stated time would be a promise the pipeline does not keep, and a named
    // hour to return is an appointment (section 3.2).
    const block = renderEnding({
      freshness: "stale",
      progress: progress(1, 8),
      hasEnded: true,
    });

    expect(
      screen.getByText(
        "The next edition will appear here when it is published.",
      ),
    ).toBeInTheDocument();
    expect(block).not.toHaveTextContent(/tomorrow/i);
    expect(block).not.toHaveTextContent(/\d{1,2}\s?(am|pm)/i);
  });
});

describe("when the reader has read every story", () => {
  it("says the edition is over without a press, and offers no control", () => {
    const block = renderEnding({
      freshness: "current",
      progress: progress(8, 8),
      hasEnded: false,
    });

    expect(screen.getByText("That's today's edition.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    // And it does not also score them: completion wins over the early message.
    expect(block).not.toHaveTextContent(/You read/);
  });
});

describe("exactly what the ending block says, once the edition is over", () => {
  /*
    Every other assertion about the ended states names the copy it expects and
    then sweeps for a banned vocabulary — streak, badge, reward, congratulations.
    That catches a line which names the mechanic and misses every line that does
    not, which is most of them: "Your 5-day run continues." is a streak, "You
    may also like more news." is the continuation surface constitution 1 rules
    out, "You have ended 3 editions this week." is the cross-edition count this
    component promises never to keep, and "Nice work." is praise for finishing.
    None of the four contains a banned word, and each is a plausible thing for a
    later slice to add beside the closing sentence.

    So this inverts the question. A keyword regex judges vocabulary; the block's
    ENTIRE text judges behaviour: anything added here has to change one of these
    six strings, and therefore has to be argued for rather than slipping in
    beside a `not.toHaveTextContent`.

    The children are asserted with the text because a celebration need not be
    text at all — an empty `<div className="edition-confetti" aria-hidden />`
    leaves every `textContent` on the page identical. The block holds exactly
    the paragraphs the copy table names, so a decorative element is caught by
    being an element.

    Six cases, which is the whole of the space: the two ways an edition can be
    over, across all three freshnesses. Each expected string comes from
    `endingCopy`'s table in `edition-progress.ts`, which is where the copy is
    decided; this is what holds the rendered block to it exactly.
  */
  type Paragraph = { readonly className: string; readonly text: string };

  const OVER_STATES: readonly {
    readonly what: string;
    readonly case: Partial<EndingCase>;
    readonly paragraphs: readonly Paragraph[];
  }[] = [
    {
      what: "the reader ends today's edition early",
      case: { freshness: "current", progress: progress(3, 8), hasEnded: true },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "You read 3 of 8. That can be enough for today.",
        },
        { className: "edition-next", text: "See you tomorrow." },
      ],
    },
    {
      what: "the reader ends a stale edition early",
      case: { freshness: "stale", progress: progress(3, 8), hasEnded: true },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "You read 3 of 8. That can be enough for today.",
        },
        {
          className: "edition-next",
          text: "The next edition will appear here when it is published.",
        },
      ],
    },
    {
      what: "the reader ends an archived edition early",
      case: { freshness: "archived", progress: progress(3, 8), hasEnded: true },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "You read 3 of 8. That can be enough for today.",
        },
      ],
    },
    {
      what: "the reader has read all of today's edition",
      case: { freshness: "current", progress: progress(8, 8), hasEnded: false },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "That's today's edition.",
        },
        { className: "edition-next", text: "See you tomorrow." },
      ],
    },
    {
      what: "the reader has read all of a stale edition",
      case: { freshness: "stale", progress: progress(8, 8), hasEnded: false },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "That's the whole edition.",
        },
        {
          className: "edition-next",
          text: "The next edition will appear here when it is published.",
        },
      ],
    },
    {
      what: "the reader has read all of an archived edition",
      case: {
        freshness: "archived",
        progress: progress(8, 8),
        hasEnded: false,
      },
      paragraphs: [
        {
          className: "edition-ending-message",
          text: "That's the whole edition.",
        },
      ],
    },
  ];

  for (const { what, case: overrides, paragraphs } of OVER_STATES) {
    it(`says this and nothing else when ${what}`, () => {
      const block = renderEnding(overrides);

      expect(block.textContent).toBe(
        paragraphs.map((paragraph) => paragraph.text).join(""),
      );
      expect(
        [...block.children].map((child) => ({
          tag: child.tagName,
          className: child.className,
          text: child.textContent,
        })),
      ).toEqual(
        paragraphs.map((paragraph) => ({
          tag: "P",
          className: paragraph.className,
          text: paragraph.text,
        })),
      );
    });
  }
});

describe("where focus goes", () => {
  it("moves to the ending, with the message in it, when the reader ends", () => {
    /*
      The press unmounts the button the reader just activated, which drops
      focus to `<body>` and loses a keyboard reader's place on the page — WCAG
      2.2 success criterion 2.4.3. Focus moves to the block that replaced the
      control, which both repairs that and reads the closing sentence once
      without a live region.

      The message is asserted here rather than in a separate test on purpose:
      focus landing on an empty container would satisfy the focus half alone.
    */
    const { rerender } = render(
      <EditionEnding
        {...endingCase({ progress: progress(3, 8), hasEnded: false })}
      />,
    );
    expect(document.activeElement).toBe(document.body);

    rerender(
      <EditionEnding
        {...endingCase({ progress: progress(3, 8), hasEnded: true })}
      />,
    );

    const block = endingBlock();
    expect(document.activeElement).toBe(block);
    expect(block).toHaveTextContent(
      "You read 3 of 8. That can be enough for today.",
    );
    // Focusable by script, never by tabbing: the block is not a control.
    expect(block).toHaveAttribute("tabindex", "-1");
  });

  it("leaves focus alone when an already-ended edition is opened again", () => {
    // The reload case. Nothing just happened — the reader came back to an
    // edition they had already ended — and the browser has already placed
    // focus, so moving it would fight them.
    const block = renderEnding({ hasEnded: true, progress: progress(3, 8) });

    expect(document.activeElement).toBe(document.body);
    expect(block).toHaveTextContent(
      "You read 3 of 8. That can be enough for today.",
    );
  });

  it("leaves focus alone when the reader expands the last story", () => {
    /*
      The asymmetry, and it is deliberate. Completion with no press is
      `message` appearing while `hasEnded` stays false. Announcing "That's
      today's edition." the instant the eighth card opens would be a completion
      chime, and it would pull focus out of the story the reader opened in
      order to read it.

      Driven through a real focused control so the assertion is about the
      reader's place on the page rather than about `<body>`.
    */
    const { rerender } = render(
      <>
        <button type="button">A story headline</button>
        <EditionEnding
          {...endingCase({ progress: progress(7, 8), hasEnded: false })}
        />
      </>,
    );
    const headline = screen.getByRole("button", { name: "A story headline" });
    headline.focus();

    rerender(
      <>
        <button type="button">A story headline</button>
        <EditionEnding
          {...endingCase({ progress: progress(8, 8), hasEnded: false })}
        />
      </>,
    );

    expect(document.activeElement).toBe(headline);
    expect(endingBlock()).toHaveTextContent("That's today's edition.");
  });

  it("leaves focus alone when an ended edition gives way to one that is not", () => {
    /*
      The other side of the transition, and the only assertion that can fail
      without the guard on it. Ending is one-way within an edition, but this is
      one component across all of them: navigating from an edition the reader
      ended to one they have not — yesterday's to today's, or back out of the
      archive — flips `hasEnded` from true to false on the same instance.

      Nothing arrived, so nothing takes focus. Without the early return the
      change alone moves it, and the reader is put at the BOTTOM of an edition
      they have not started, past every story in it, on a block that says only
      "End today's edition".

      Driven directly rather than through the application, deliberately. In the
      running product `ReaderShell` moves focus to the top of `main` on a route
      change, and a child's effect runs before its parent's — so the app would
      look right while this component was wrong, and the guard's correctness
      would rest on effect ordering in another file.
    */
    const { rerender } = render(
      <>
        <button type="button">A story headline</button>
        <EditionEnding
          {...endingCase({ progress: progress(3, 8), hasEnded: true })}
        />
      </>,
    );
    const headline = screen.getByRole("button", { name: "A story headline" });
    headline.focus();

    rerender(
      <>
        <button type="button">A story headline</button>
        <EditionEnding
          {...endingCase({ progress: progress(0, 8), hasEnded: false })}
        />
      </>,
    );

    expect(document.activeElement).toBe(headline);
    // And the edition it moved to is offered its own ending, unfinished.
    expect(endingBlock()).toHaveTextContent("End today's edition");
  });
});

describe("what the end of the edition never contains", () => {
  it("offers nothing to read next, and nothing that measures the reader", () => {
    /*
      Swept across every state the block can be in. Each case asserts the copy
      it is supposed to show *alongside* the absences, so deleting the ending
      outright cannot turn this green.

      A link here is the continuation surface constitution 1 rules out — a next
      or previous edition, an archive, related reading. A second button is an
      install prompt, a share control, or a survey. `role="status"` and
      `aria-live` would announce the ending on completion, which is the chime.
      `role="progressbar"` is the score the counter deliberately is not.
    */
    const cases: readonly {
      readonly case: Partial<EndingCase>;
      readonly text: RegExp;
      /*
        Exact, not a ceiling. `toBeLessThanOrEqual(1)` is satisfied by zero, so
        in the two states where the true count IS zero it asserted nothing at
        all — and those are precisely the states where a second control would be
        added: an "undo", a share, an install prompt, a survey, all of which
        only make sense once the edition is over.
      */
      readonly controls: number;
    }[] = FRESHNESS_VALUES.flatMap((freshness) => [
      {
        case: { freshness, progress: progress(0, 8), hasEnded: false },
        text: /End (today's|this) edition/,
        controls: 1,
      },
      {
        case: { freshness, progress: progress(3, 8), hasEnded: true },
        text: /You read 3 of 8\./,
        controls: 0,
      },
      {
        case: { freshness, progress: progress(8, 8), hasEnded: false },
        text: /That's (today's|the whole) edition\./,
        controls: 0,
      },
    ]);

    for (const { case: overrides, text, controls } of cases) {
      const block = renderEnding(overrides);

      expect(block).toHaveTextContent(text);
      expect(screen.queryAllByRole("link")).toHaveLength(0);
      expect(screen.queryAllByRole("button")).toHaveLength(controls);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(block.querySelector("[aria-live]")).toBeNull();
      expect(block.querySelector("[aria-valuenow]")).toBeNull();
      // No streak, no score, no badge, no guilt, and nothing to come back for.
      expect(block).not.toHaveTextContent(
        /streak|badge|reward|point|score|congrat|well done|great job|keep it up|come back|don't miss|you missed|only read/i,
      );

      cleanup();
    }
  });

  it("starts no timer, on render or on the press", () => {
    /*
      The end of the edition is where a countdown, an auto-advance, or a
      "closing in 5" would be added if it were ever going to be. There is no
      clock in this component at all, and this is the assertion that says so
      after the one interaction it has.
    */
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const { rerender } = render(
      <EditionEnding
        {...endingCase({ progress: progress(3, 8), hasEnded: false })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "End today's edition" }),
    );
    rerender(
      <EditionEnding
        {...endingCase({ progress: progress(3, 8), hasEnded: true })}
      />,
    );

    /*
      jsdom's own `HTMLElement.focus()` queues a `selectionchange` task on
      `setTimeout`, so the raw call list cannot be empty while this component
      moves focus at all. That one task is filtered out by its handler rather
      than tolerated by counting calls, so a timer this component started would
      still fail the assertion.
    */
    const ownTimeouts = setTimeoutSpy.mock.calls.filter(
      ([handler]) => !String(handler).includes("selectionchange"),
    );
    expect(ownTimeouts).toEqual([]);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    // Asserted with the copy present, so a deleted component cannot pass.
    expect(endingBlock()).toHaveTextContent(
      "You read 3 of 8. That can be enough for today.",
    );
  });
});
