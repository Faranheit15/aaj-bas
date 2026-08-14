import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITION_HEADING_ID, ReaderShell } from "./ReaderShell";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Stands in for whichever view the application renders into the shell. */
function editionHeading(text = "Edition of Tuesday, 21 July 2026") {
  return <h1 id={EDITION_HEADING_ID}>{text}</h1>;
}

describe("the reader shell", () => {
  it("renders one banner, one main, and one footer landmark", () => {
    // The shell that came before this nested the header inside main, which
    // demotes it to a generic element and leaves the page with no banner.
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });

  it("names the main landmark with the view's heading", () => {
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading("Edition of Tuesday, 21 July 2026")}
      </ReaderShell>,
    );

    expect(
      screen.getByRole("main", { name: "Edition of Tuesday, 21 July 2026" }),
    ).toBeInTheDocument();
    // The id is exported so a view cannot spell it differently and silently
    // leave the landmark unnamed.
    expect(EDITION_HEADING_ID).toBe("edition-heading");
  });

  it("renders no navigation and no link in the footer", () => {
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(
      within(screen.getByRole("contentinfo")).queryAllByRole("link"),
    ).toHaveLength(0);
  });

  it("renders the live region on the first render, before any message", () => {
    // A live region inserted at the same moment as its text is not reliably
    // announced, so the region has to exist while the edition is still loading.
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass("visually-hidden");
    expect(status).toBeEmptyDOMElement();
  });

  it("announces the message it is given without repeating the edition", () => {
    render(
      <ReaderShell routeKey="/" statusMessage="Loading the edition.">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the edition.",
    );
    // The edition sits outside the live region: main is not inside it.
    expect(screen.getByRole("status")).not.toContainElement(
      screen.getByRole("main"),
    );
  });

  it("does not move focus or scroll on first mount", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    render(
      <ReaderShell routeKey="/" statusMessage="Loading the edition.">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.getByRole("main")).not.toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("moves focus to main and scrolls to the top when the route changes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    rerender(
      <ReaderShell routeKey="/edition/2026-07-21" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.getByRole("main")).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves focus alone when only the load state changes", () => {
    // Loading to ready is not a navigation. Focusing main on it would pull a
    // reader out of wherever they were.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(
      <ReaderShell routeKey="/" statusMessage="Loading the edition.">
        <h1 id={EDITION_HEADING_ID}>Loading the edition.</h1>
      </ReaderShell>,
    );

    rerender(
      <ReaderShell routeKey="/" statusMessage="The edition is ready.">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(screen.getByRole("main")).not.toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
