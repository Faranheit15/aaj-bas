import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITION_HEADING_ID,
  EDITION_MAIN_ID,
  ReaderShell,
} from "./ReaderShell";

/*
  The banner's theme control reads the device and writes an attribute on
  `<html>`. Neither is a fact about the shell's landmarks, so the store is
  mocked here for the same reason `ThemeChoice.test.tsx` mocks it: the shell is
  asserted to CONTAIN the control, and what the control does with storage is
  asserted where it lives.
*/
vi.mock("./theme", () => ({
  useTheme: () => ({ theme: "system", chooseTheme: () => {} }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Stands in for whichever view the application renders into the shell. */
function editionHeading(text = "Edition of Tuesday, 21 July 2026") {
  return <h1 id={EDITION_HEADING_ID}>{text}</h1>;
}

/**
 * Everything in the document a Tab press can reach, in document order.
 *
 * Filtered by the platform's own rule rather than by a list of tag names:
 * `el.tabIndex >= 0` is what the browser computes, so `main` and
 * `.edition-ending` — focusable programmatically at `tabIndex` -1 — are
 * correctly excluded, and a control that opts out with `tabindex="-1"` is too.
 */
function tabStops(): readonly HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ].filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"));
}

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }

  return value;
}

function skipLink(): HTMLElement {
  return screen.getByRole("link", { name: "Skip to the edition" });
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

  it("offers the skip link as the very first tab stop on the page", () => {
    /*
      The whole point of the control. A skip link that is not first is a link
      the reader reaches after the thing it was meant to let them skip, and
      anything placed above it — the theme control, a brand link, a date picker
      — offers a keyboard reader something other than the edition as their first
      choice.
    */
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
        <button type="button">A story headline</button>
      </ReaderShell>,
    );

    expect(present(tabStops()[0], "the first tab stop")).toBe(skipLink());
  });

  it("puts the skip link in the banner, and nowhere else", () => {
    /*
      In `main` it would be inside the region it targets, which is a control
      that skips to itself. In the footer it would be a footer link, which the
      test below forbids for a different reason and which would also put it last
      in the tab order. Inside the banner every element on the page sits within
      a landmark, so the placement needs no exception.
    */
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Skip to the edition",
      }),
    ).toBe(skipLink());
    expect(screen.getByRole("main")).not.toContainElement(skipLink());
    expect(screen.getByRole("contentinfo")).not.toContainElement(skipLink());
    // One same-document link is not a navigation region, and a `nav` would
    // advertise a set of destinations that does not exist (section 3.1).
    expect(skipLink().closest("nav")).toBeNull();
  });

  it("targets the id the main landmark actually carries", () => {
    /*
      The pair that has to agree, which is why the id is exported rather than
      written twice: a fragment no element carries makes the link do nothing at
      all, silently.

      `tabIndex` -1 on the target is the other half. Without it the browser
      scrolls to the landmark and leaves focus where it was, so the reader's
      next Tab returns them to the top of the page — the link appears to work
      and has moved nobody. jsdom implements neither fragment navigation nor the
      focus move that follows it, so the BROWSER's step in this chain is
      asserted nowhere in this suite; what is asserted here is that both ends
      the browser needs are present.
    */
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    const main = screen.getByRole("main");
    expect(skipLink()).toHaveAttribute("href", `#${EDITION_MAIN_ID}`);
    expect(main).toHaveAttribute("id", EDITION_MAIN_ID);
    expect(document.getElementById(EDITION_MAIN_ID)).toBe(main);

    main.focus();
    expect(main).toHaveFocus();
  });

  it("leaves the skip link a plain, announced link", () => {
    /*
      `aria-hidden` would hide from a screen reader the one control that exists
      for screen-reader and keyboard readers, while leaving it in the tab order
      — focusable and nameless. A `tabindex` of any value is either redundant
      (0 on a link) or removes it from the tab order entirely (-1); the platform
      already puts an `a[href]` where it belongs.
    */
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    expect(skipLink()).not.toHaveAttribute("aria-hidden");
    expect(skipLink()).not.toHaveAttribute("tabindex");
    expect(skipLink()).toHaveTextContent("Skip to the edition");
  });

  it("puts the theme control in the banner, after the skip link", () => {
    /*
      In the banner rather than at the end of the edition beside the interest
      picker: a reader needs a readable page on arrival, a reader who never
      reaches the end would never find it, and `InterestBoosts` renders only on
      the `ready` state — so a control placed there would be missing from the
      three load states where an unreadable page is most likely to be what sent
      the reader looking for it.

      After the skip link, because the first Tab must offer the edition rather
      than a preference.
    */
    render(
      <ReaderShell routeKey="/" statusMessage="">
        {editionHeading()}
      </ReaderShell>,
    );

    const themeToggle = within(screen.getByRole("banner")).getByRole("button", {
      name: "Theme",
    });

    expect(tabStops()).toEqual([skipLink(), themeToggle]);
    expect(screen.getByRole("main")).not.toContainElement(themeToggle);
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
