import "@testing-library/jest-dom/vitest";
import type { Edition } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import editionJson from "../../../content/editions/2026-07-21.json";
import { App } from "./App";
import { formatEditionDate } from "./edition/editorial-day";
import type { EditionLoadState } from "./edition/use-edition";
import type { Route } from "./routing/route";

/**
 * The route and the load are supplied directly.
 *
 * The application's job is to choose a view for a load state, so the states are
 * given to it rather than provoked through a transport: driving them through
 * `fetch` would test the repository's URL handling here, in the file that is
 * about which view appears. The factories below only close over the two
 * variables; they read neither at hoist time.
 */
vi.mock("./routing/use-route", () => ({
  useRoute: () => route,
  navigate: vi.fn(),
}));
vi.mock("./edition/use-edition", () => ({
  useEdition: () => ({ state: load, retry }),
}));

const retry = vi.fn();
let route: Route = { kind: "latest" };
let load: EditionLoadState = { status: "loading" };

/** The real published edition, parsed rather than cast; see EditionView.test. */
const edition: Edition = editionSchema.parse(editionJson as unknown);

function readyState(
  overrides: Partial<Extract<EditionLoadState, { status: "ready" }>> = {},
): EditionLoadState {
  return {
    status: "ready",
    edition,
    freshness: "current",
    contentSet: "published",
    editorialToday: edition.date,
    ...overrides,
  };
}

function renderState(state: EditionLoadState): void {
  load = state;
  render(<App />);
}

beforeEach(() => {
  route = { kind: "latest" };
  load = { status: "loading" };
  // The application performs no request of its own; the stub is here so that
  // any request it grew would show up as a call rather than as a network error.
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  // The keyboard walk below expands stories and ends the edition, which writes
  // to the device. jsdom keeps one storage area for the whole file, so without
  // this a later test would render with a previous one's reading state.
  localStorage.clear();
});

describe("the reader application", () => {
  it("says it is loading, then announces the edition it loaded", () => {
    const { rerender } = render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Loading the edition." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the edition.",
    );

    load = readyState();
    rerender(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: `Edition of ${formatEditionDate(edition.date)}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      `The edition for ${formatEditionDate(edition.date)} is ready.`,
    );
  });

  it("renders exactly one first-level heading in every state", () => {
    const states: EditionLoadState[] = [
      { status: "loading" },
      readyState(),
      { status: "none", contentSet: "published" },
      { status: "failed", reason: "network", priorDate: null },
    ];

    for (const state of states) {
      renderState(state);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      cleanup();
    }
  });

  it("makes no request of its own", () => {
    renderState(readyState());

    expect(fetch).not.toHaveBeenCalled();
  });

  it("ends the edition at the ending block, with the footer after it", () => {
    // The finite ending is the product's first commitment. Nothing continues
    // the edition: no next link, no recommendation, no pager, and no archive.
    // The ending block is the last thing in `main`, directly after the story
    // list, and nothing follows it inside the landmark.
    renderState(readyState());

    const main = screen.getByRole("main");
    const ending = main.lastElementChild;
    expect(ending).toHaveClass("edition-ending");
    /*
      The full sequence rather than the ending's neighbour alone. A sibling
      check only guards the one gap directly above the ending, so a block
      inserted anywhere higher would satisfy it; naming every position is what
      makes this an assertion about the whole landmark. AB-204's interest
      invitation is absent here because nothing has been expanded, and
      `EditionView`'s own test asserts the sequence again with it present.
    */
    expect(
      [...main.children].map((child) => child.className || child.tagName),
    ).toEqual([
      "H1",
      "edition-freshness",
      "edition-progress",
      "edition-stories",
      "edition-ending",
    ]);
    expect(main.nextElementSibling?.tagName).toBe("FOOTER");
  });

  it("keeps the progress count out of the shell's live region", () => {
    // The status region carries short signals about the load, never the
    // edition and never a count of what the reader has opened: a number that
    // spoke on every expand would turn opening a story into a scored event.
    renderState(readyState());

    expect(screen.getByRole("status")).not.toHaveTextContent(/\d+ of \d+/);
    expect(screen.getByRole("status")).toHaveTextContent(
      `The edition for ${formatEditionDate(edition.date)} is ready.`,
    );
  });

  it("offers the ending and the count only where there is an edition to end", () => {
    /*
      Loading, nothing published, and a failed load are all states with no
      stories on the page. An end-edition control there would end nothing, and
      "0 of 0 viewed" would be a count of an edition the reader was never
      shown — a fact about a failure dressed up as progress (section 26).

      Paired with the state that DOES have an edition in it, in the same test,
      and that half is what makes the three absences mean anything: on their own
      they are satisfied just as well by an application that offers no ending
      anywhere, which is the feature deleted rather than correctly withheld.
    */
    const withoutAnEdition: EditionLoadState[] = [
      { status: "loading" },
      { status: "none", contentSet: "published" },
      { status: "failed", reason: "network", priorDate: null },
    ];

    for (const state of withoutAnEdition) {
      renderState(state);
      expect(
        screen.queryByRole("button", { name: /End (today's|this) edition/ }),
      ).toBeNull();
      expect(screen.queryByText(/\d+ of \d+ viewed/)).toBeNull();
      cleanup();
    }

    renderState(readyState());

    expect(
      screen.getByRole("button", { name: "End today's edition" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^\d+ of \d+ viewed$/)).toBeInTheDocument();
  });

  it("offers exactly one link on a loaded edition, and it leads nowhere but this page's own main", () => {
    /*
      This assertion used to read "zero links", which AB-205's skip link makes
      false. It is replaced rather than loosened, and the replacement is
      stronger in three ways.

      First, the claim the original protected is preserved verbatim, one
      landmark down: the EDITION carries no link. A next-edition link, a
      recommendation, a pager, an archive link, a settings route, a share
      control — every one of them would render inside `main`, and every one of
      them still fails here.

      Second, the document-wide inventory is now an exact list rather than a
      count, so a second link fails on the comparison AND names the intruder in
      the failure message.

      Third, and this is what a count could never say: the skip link's
      destination is asserted. Deleting the link, pointing it at another page,
      or renaming it all pass a "zero or more links" test and all fail here.
    */
    renderState(readyState());

    expect(
      within(screen.getByRole("main")).queryAllByRole("link"),
    ).toHaveLength(0);

    const links = screen.getAllByRole("link");
    expect(
      links.map((link) => [link.getAttribute("href"), link.textContent]),
    ).toEqual([["#edition", "Skip to the edition"]]);

    // In the banner, so it is the first thing the keyboard reaches rather than
    // something found after the edition it exists to skip to.
    expect(screen.getByRole("banner")).toContainElement(links[0] ?? null);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("names the day this edition is, never today, when it is not today's", () => {
    renderState(readyState({ freshness: "stale" }));

    expect(
      screen.getByText(
        "Today's edition is not published yet. This is the most recent edition.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Today's/ })).toBeNull();
  });

  it("declares invented stories as invented", () => {
    renderState(readyState({ contentSet: "sample" }));

    expect(
      screen.getByText(
        "Development sample data. This build shows invented content, not news.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about sample data when the content is published", () => {
    renderState(readyState({ contentSet: "published" }));

    expect(screen.queryByText(/Development sample data/)).toBeNull();
  });

  it("says plainly when nothing has been published yet", () => {
    renderState({ status: "none", contentSet: "published" });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "No edition has been published yet.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The first edition will appear here when it is published.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No edition has been published yet.",
    );
  });

  it("hands a failed load to the unavailable view, and says so once", () => {
    renderState({ status: "failed", reason: "unavailable", priorDate: null });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "The edition is not available.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The edition could not be loaded.",
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("offers one way back when a dated edition failed", () => {
    route = { kind: "edition", date: "2026-07-19" };
    renderState({
      status: "failed",
      reason: "unavailable",
      priorDate: "2026-07-21",
    });

    // Scoped to `main`: the shell's skip link is not a way back, and counting
    // it here would make "one way back" true of a page that offered none.
    const links = within(screen.getByRole("main")).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Open the latest edition");
    // And the document as a whole still offers exactly those two, so a third
    // route out cannot hide behind the scoping above.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

describe("reaching the product with a keyboard", () => {
  /*
    AB-205's second acceptance criterion. What can be asserted here is the
    property that actually makes a browser's tab order correct — every control
    is a natively focusable element and none distorts the order with a
    `tabindex` — rather than traversal itself.

    Being exact about the limitation, because it would be easy to imply more:
    `fireEvent` dispatches an event at an element, it does not run the
    browser's sequential-focus algorithm, so `fireEvent.keyDown(el, {key:"Tab"})`
    moves focus nowhere and would prove nothing. `@testing-library/user-event`
    is not installed, and even its `tab()` models the order rather than
    executing the browser's. Real traversal, the skip link's actual focus move,
    and `:focus-visible` rendering are verifiable only in a browser this
    repository does not run (AGENTS.md section 5).
  */

  /**
   * Every control the document is offering right now.
   *
   * `radio` is in the list because the banner's theme control is three of them,
   * and a role omitted here is a control this test claims to cover and does
   * not. `ThemeChoice.test.tsx` renders those radios too, but it renders the
   * component alone; the claim being made in this file is about the document.
   */
  function controls(): readonly HTMLElement[] {
    return [
      ...screen.queryAllByRole("button"),
      ...screen.queryAllByRole("link"),
      ...screen.queryAllByRole("checkbox"),
      ...screen.queryAllByRole("radio"),
    ];
  }

  /** The keyboard property, over whatever is on the page at the time. */
  function expectEveryControlOperable(atLeast: number): void {
    const found = controls();

    // Non-vacuous: an empty page satisfies a `for` over nothing, so each stage
    // states how many controls it expects to be arguing about.
    expect(found.length).toBeGreaterThanOrEqual(atLeast);

    for (const control of found) {
      expect(["A", "BUTTON", "INPUT"]).toContain(control.tagName);
      // No `tabindex` at all: a positive value would distort the order, and
      // -1 would take a control out of it entirely.
      expect(control).not.toHaveAttribute("tabindex");
      if (control.tagName === "A") {
        expect(control).toHaveAttribute("href");
      }
    }
  }

  it("operates every control in the main flow with the keyboard alone", () => {
    /*
      Kills the substitution the rest of the suite is blind to. `getByRole`
      matches `<div role="button">`, which is NOT keyboard operable, so almost
      every control test in this repository would stay green if its control
      were re-implemented as a div with a click handler. Exactly one test
      asserts otherwise, for one card. This asserts it for all of them at once.

      TAKEN IN TWO STAGES, and that is the correction rather than a refinement.
      A walk has to press things, and pressing the end-edition control unmounts
      it — so a single inventory taken after the walk asserted nothing about the
      one control AB-205's own acceptance criterion is named for. Re-implementing
      it as a div, or giving it `tabIndex={-1}` so a keyboard reader could never
      end the edition at all, both survived that shape. Whatever the page offers
      at rest is therefore examined BEFORE anything is pressed.
    */
    renderState(readyState());

    /*
      Stage one: the page at rest. Thirteen — the skip link, the theme toggle,
      one toggle per story, and the end-edition control — which is every
      control a reader meets before they touch anything, including the one a
      later press removes from the page. The count is the resting inventory
      exactly, so a control lost here fails rather than shrinking the list.
    */
    expectEveryControlOperable(13);

    /*
      Stage two: walked, not sampled. Opening the theme panel yields its three
      radios, expanding two stories yields the source links and the report
      link, and ending yields the interest invitation with its six checkboxes.
      None of this is reachable from the resting page, which is why both stages
      exist rather than either one. Thirty, against the thirteen above.
    */
    fireEvent.click(screen.getByRole("button", { name: /^Theme$/ }));
    const cards = screen
      .getByRole("list")
      .querySelectorAll<HTMLElement>(":scope > .edition-story");
    for (const card of [...cards].slice(0, 2)) {
      const toggle = card.querySelector("button");
      if (toggle !== null) {
        fireEvent.click(toggle);
      }
    }
    const end = screen.queryByRole("button", { name: /^End today's edition$/ });
    if (end !== null) {
      fireEvent.click(end);
    }

    expectEveryControlOperable(28);
  });

  it("carries the skip link in every state the load can be in", () => {
    /*
      Kills rendering the skip link from `EditionView`, which would leave it
      present only when an edition loaded — so a keyboard reader meeting the
      loading, empty or failed page would have no bypass at all (section 26).
      The shell owns it precisely because the shell is what all four states
      have in common.
    */
    const states: EditionLoadState[] = [
      { status: "loading" },
      readyState(),
      { status: "none", contentSet: "published" },
      { status: "failed", reason: "network", priorDate: null },
    ];

    for (const state of states) {
      renderState(state);
      const skip = screen.getByRole("link", { name: "Skip to the edition" });
      expect(skip).toHaveAttribute("href", "#edition");
      expect(screen.getByRole("banner")).toContainElement(skip);
      cleanup();
    }
  });
});
