import "@testing-library/jest-dom/vitest";
import type { Edition } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(ending?.previousElementSibling).toBe(screen.getByRole("list"));
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

  it("offers no link to another edition when the edition loaded", () => {
    renderState(readyState());

    expect(screen.queryAllByRole("link")).toHaveLength(0);
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

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Open the latest edition");
  });
});
