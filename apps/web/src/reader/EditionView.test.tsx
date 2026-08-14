import "@testing-library/jest-dom/vitest";
import type { Edition, SourceReference, Story } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import editionJson from "../../../../content/editions/2026-07-21.json";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { EditionView } from "./EditionView";
import type { ViewedStoriesStore } from "./viewed-stories";
import { useViewedStories } from "./viewed-stories";

/*
  The real hook, wrapped in a spy so the test can read the state it holds.

  Acceptance criterion 3 — expanding a card records it as viewed — has nothing
  observable in the DOM to assert against, and deliberately so: section 3.5
  rules out a per-card viewed marker, because "viewed" on one card implies
  "unviewed" on the rest and turns a finite edition into a checklist to clear.
  So the state has to be read where it lives.

  Of the ways to reach it, this is the one that costs the component nothing. An
  injected-store prop or an exported test seam would put API on `EditionView`
  that no caller in the product uses, which sections 13 and 48 both refuse, and
  a probe component calling `useViewedStories` itself would hold a *second*,
  unrelated instance of the state and prove nothing about the first.

  `importOriginal` keeps the real implementation running underneath, so this is
  not the mocked-implementation-under-test section 29 warns about: every
  assertion below is against state the actual hook computed. What the spy adds
  is a handle on the value `EditionView` received.
*/
vi.mock("./viewed-stories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./viewed-stories")>();
  return { ...actual, useViewedStories: vi.fn(actual.useViewedStories) };
});

afterEach(() => {
  cleanup();
  vi.mocked(useViewedStories).mockClear();
});

/**
 * The real published edition, parsed rather than cast.
 *
 * `resolveJsonModule` types the import from the file's own contents, and
 * letting that type stand would have TypeScript assert the shape these tests
 * exist to render. Parsing widens it back to the contract, and fails loudly
 * here rather than halfway through a render.
 */
const edition: Edition = editionSchema.parse(editionJson as unknown);

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}

/** The core eight, resolved from the edition's own ids rather than from the
 * helper the component uses, so the test can disagree with it. */
const coreStories: Story[] = edition.coreStoryIds.map((id) =>
  present(
    edition.stories.find((candidate) => candidate.id === id),
    `core story ${id}`,
  ),
);

const coreHeadlines = coreStories.map((story) => story.headline);

function coreStoryAt(index: number): Story {
  return present(coreStories[index], `core story ${index}`);
}

/** Resolved in `sourceIds` order, which is the order the card cites them. */
function sourcesOf(story: Story): SourceReference[] {
  return story.sourceIds.map((id) =>
    present(
      edition.sources.find((candidate) => candidate.id === id),
      `source ${id}`,
    ),
  );
}

/** The edition's own publication line, as distinct from any story's. */
function editionFreshnessLine(container: HTMLElement): HTMLElement {
  return present(
    container.querySelector<HTMLElement>(".edition-freshness"),
    "the edition freshness line",
  );
}

/** The one control a collapsed card has. */
function toggleIn(card: HTMLElement): HTMLElement {
  return within(card).getByRole("button");
}

/**
 * The store as of the component's most recent render.
 *
 * The last result, not the first: `viewed` is a fresh value on every render, so
 * the store captured before a click still carries the set as it was then.
 */
function viewedNow(): ViewedStoriesStore {
  const { results } = vi.mocked(useViewedStories).mock;
  const last = present(results[results.length - 1], "a render of the store");
  if (last.type !== "return") {
    throw new Error("the viewed store threw instead of returning");
  }
  return last.value;
}

/** Viewed story ids in the order they were marked. */
function viewedIds(): string[] {
  return [...viewedNow().viewed.storyIds];
}

describe("a rendered edition", () => {
  it("carries exactly one first-level heading, naming the edition's date", () => {
    render(<EditionView edition={edition} freshness="current" />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      `Edition of ${formatEditionDate(edition.date)}`,
    );
  });

  it("machine-reads the edition date from the contract value", () => {
    const { container } = render(
      <EditionView edition={edition} freshness="current" />,
    );

    expect(container.querySelector("h1 time")).toHaveAttribute(
      "datetime",
      "2026-07-21",
    );
  });

  it("renders the eight core stories, not the ten reachable ones", () => {
    // The file holds the core eight plus the interest pools. Rendering
    // `edition.stories` would hand every reader the pool as well, which is the
    // selection AB-204 owns.
    render(<EditionView edition={edition} freshness="current" />);

    expect(edition.stories.length).toBeGreaterThan(8);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("gives every story a second-level heading", () => {
    // Still an `h2`, and still exactly the headline: the card puts the
    // disclosure button *inside* the heading, which leaves its text unchanged.
    render(<EditionView edition={edition} freshness="current" />);

    const headlines = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headlines).toEqual(coreHeadlines);
  });

  it("numbers each card against the cards actually on the page", () => {
    /*
      The denominator is read back out of the DOM rather than compared against
      a constant, which is the whole point of the assertion: "1 of 10" above a
      list that ends at eight would be the product telling the reader there is
      more edition somewhere, and a test carrying its own hardcoded ten could
      not tell the difference. Counting the rendered list items means this
      fails the moment the two numbers disagree, whatever they are.
    */
    render(<EditionView edition={edition} freshness="current" />);

    const cards = screen.getAllByRole("listitem");
    const total = cards.length;
    expect(total).toBeLessThan(edition.stories.length);

    cards.forEach((card, index) => {
      expect(
        within(card).getByText(`${index + 1} of ${total}`),
      ).toBeInTheDocument();
    });
  });

  it("shows the publication instant with its contract timestamp", () => {
    const { container } = render(
      <EditionView edition={edition} freshness="current" />,
    );

    const published = container.querySelector(".edition-freshness time");
    expect(published).toHaveAttribute("datetime", "2026-07-21T06:00:00+05:30");
    expect(published).toHaveTextContent(
      formatEditionInstant(edition.publishedAt),
    );
  });

  it("shows an update time only when the edition was updated after publication", () => {
    /*
      Scoped to the freshness line, not to the page. A story card carries its
      own "Updated" marker, and the two are different statements: one says this
      edition changed after it was published, the other says this story did.
      An unscoped `/Updated/` would let either satisfy the other's test.
    */
    const { container } = render(
      <EditionView edition={edition} freshness="current" />,
    );

    const freshness = editionFreshnessLine(container);
    expect(within(freshness).getByText(/Updated/)).toBeInTheDocument();
    const updated = within(freshness)
      .getByText(formatEditionInstant(edition.updatedAt))
      .closest("time");
    expect(updated).toHaveAttribute("datetime", "2026-07-21T19:20:00+05:30");
  });

  it("shows no update time when the edition has not been updated", () => {
    const { container } = render(
      <EditionView
        edition={{ ...edition, updatedAt: edition.publishedAt }}
        freshness="current"
      />,
    );

    expect(editionFreshnessLine(container)).not.toHaveTextContent(/Updated/);
  });

  it("says nothing about freshness when the edition is today's", () => {
    const { container } = render(
      <EditionView edition={edition} freshness="current" />,
    );

    expect(container.querySelector(".edition-notice")).toBeNull();
  });

  it("says today's edition is not published yet when it is not", () => {
    render(<EditionView edition={edition} freshness="stale" />);

    expect(
      screen.getByText(
        "Today's edition is not published yet. This is the most recent edition.",
      ),
    ).toBeInTheDocument();
    // The wording is a paragraph, never a heading: the heading names the date
    // this edition actually is.
    expect(screen.queryByRole("heading", { name: /Today's/ })).toBeNull();
  });

  it("says an edition read by date is a past edition", () => {
    render(<EditionView edition={edition} freshness="archived" />);

    expect(screen.getByText("This is a past edition.")).toBeInTheDocument();
  });

  it("offers no link out of the edition while every card is collapsed", () => {
    /*
      The edition as it is first read is a closed list of headlines with
      nothing to click away to. Source links do exist now, but only inside a
      card the reader deliberately opened, so the default state still offers
      no exit — and nothing here, in either state, continues the edition.
    */
    render(<EditionView edition={edition} freshness="current" />);

    for (const card of screen.getAllByRole("listitem")) {
      expect(toggleIn(card)).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("expanding a story", () => {
  it("reveals that story's sources and leaves the other cards shut", () => {
    render(<EditionView edition={edition} freshness="current" />);

    const cards = screen.getAllByRole("listitem");
    const first = present(cards[0], "the first card");
    fireEvent.click(toggleIn(first));

    const cited = sourcesOf(coreStoryAt(0));
    const hrefs = within(first)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    for (const source of cited) {
      expect(hrefs).toContain(source.url);
    }
    // Its sources, and the report link. Nothing else.
    expect(hrefs).toHaveLength(cited.length + 1);
    // No other card contributed a link, so the page's links are this card's.
    expect(screen.getAllByRole("link")).toHaveLength(hrefs.length);

    for (const other of cards.slice(1)) {
      expect(toggleIn(other)).toHaveAttribute("aria-expanded", "false");
      expect(within(other).queryAllByRole("link")).toHaveLength(0);
    }
  });

  it("leaves an already open card open when a second is opened", () => {
    // Not an accordion. Opening one story must not close another the reader
    // is still reading, and expansion state belongs to each card alone.
    render(<EditionView edition={edition} freshness="current" />);

    const toggles = screen.getAllByRole("button");
    const first = present(toggles[0], "the first card's toggle");
    const third = present(toggles[2], "the third card's toggle");

    fireEvent.click(first);
    fireEvent.click(third);

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(third).toHaveAttribute("aria-expanded", "true");
    expect(present(toggles[1], "the second card's toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("persists nothing to the device", () => {
    /*
      Viewed state is in memory and nowhere else until AB-301 ships the
      versioned, validated, migratable local-state adapter section 17
      requires. Writing an unversioned key now would put a legacy format on
      readers' devices for AB-301 to migrate away from. This assertion is what
      makes that a fact rather than an intention.
    */
    render(<EditionView edition={edition} freshness="current" />);

    const toggles = screen.getAllByRole("button");
    fireEvent.click(present(toggles[0], "the first card's toggle"));
    fireEvent.click(present(toggles[1], "the second card's toggle"));

    expect(localStorage.length).toBe(0);
    // Both, and for the same reason: `sessionStorage` is no less a legacy
    // format for AB-301 to migrate away from just because it empties when the
    // tab closes.
    expect(sessionStorage.length).toBe(0);
  });
});

describe("recording which stories were viewed", () => {
  it("marks a story viewed when the reader expands its card", () => {
    /*
      The wire this suite could not otherwise see. `StoryCard` proves it calls
      `onExpand`, and `useViewedStories` proves it records what it is told, but
      until this assertion existed both could be true while `EditionView`
      handed the card a callback that did nothing — which is the acceptance
      criterion for this slice, silently unmet.
    */
    render(<EditionView edition={edition} freshness="current" />);
    expect(viewedIds()).toEqual([]);

    const cards = screen.getAllByRole("listitem");
    fireEvent.click(toggleIn(present(cards[1], "the second card")));
    fireEvent.click(toggleIn(present(cards[4], "the fifth card")));

    expect(viewedIds()).toEqual([coreStoryAt(1).id, coreStoryAt(4).id]);
  });

  it("keeps the viewed set to this edition's date", () => {
    // What stops one edition's viewed stories from ever being counted as
    // another's, whichever way the reader navigates between them.
    render(<EditionView edition={edition} freshness="current" />);

    expect(useViewedStories).toHaveBeenCalledWith(edition.date);
    expect(viewedNow().viewed.editionDate).toBe(edition.date);
  });

  it("leaves a story viewed after the reader collapses it again", () => {
    // Viewed is monotonic: collapsing a card says nothing about whether it was
    // read, and un-marking it would make the record one of how the reader
    // browsed rather than of what they opened.
    render(<EditionView edition={edition} freshness="current" />);

    const first = present(screen.getAllByRole("listitem")[0], "the first card");
    // Held rather than re-queried: an expanded card has a second button in it,
    // and React keeps this node across the re-render either way.
    const toggle = toggleIn(first);
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(viewedIds()).toEqual([coreStoryAt(0).id]);
  });

  it("marks nothing while every card is still collapsed", () => {
    render(<EditionView edition={edition} freshness="current" />);

    expect(viewedIds()).toEqual([]);
  });
});
