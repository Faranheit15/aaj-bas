import "@testing-library/jest-dom/vitest";
import type { Edition } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { EditionView } from "./EditionView";
import editionJson from "../../../../content/editions/2026-07-21.json";

afterEach(cleanup);

/**
 * The real published edition, parsed rather than cast.
 *
 * `resolveJsonModule` types the import from the file's own contents, and
 * letting that type stand would have TypeScript assert the shape these tests
 * exist to render. Parsing widens it back to the contract, and fails loudly
 * here rather than halfway through a render.
 */
const edition: Edition = editionSchema.parse(editionJson as unknown);

/** The core eight, resolved from the edition's own ids rather than from the
 * helper the component uses, so the test can disagree with it. */
const coreHeadlines = edition.coreStoryIds.map((id) => {
  const story = edition.stories.find((candidate) => candidate.id === id);
  if (story === undefined) {
    throw new Error(`core story ${id} is missing from the edition`);
  }
  return story.headline;
});

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
    render(<EditionView edition={edition} freshness="current" />);

    const headlines = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headlines).toEqual(coreHeadlines);
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
    render(<EditionView edition={edition} freshness="current" />);

    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    const updated = screen
      .getByText(formatEditionInstant(edition.updatedAt))
      .closest("time");
    expect(updated).toHaveAttribute("datetime", "2026-07-21T19:20:00+05:30");
  });

  it("shows no update time when the edition has not been updated", () => {
    render(
      <EditionView
        edition={{ ...edition, updatedAt: edition.publishedAt }}
        freshness="current"
      />,
    );

    expect(screen.queryByText(/Updated/)).toBeNull();
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

  it("offers no link out of the edition", () => {
    // Nothing here continues the edition, and nothing here leaves it. Source
    // links arrive with the story card in AB-202.
    render(<EditionView edition={edition} freshness="current" />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
