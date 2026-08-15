import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
afterEach(cleanup);
import { App } from "./App";

describe("landing page", () => {
  it("renders the main heading and primary CTA", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Know what happened. Then get on with your day.",
      }),
    ).toBeInTheDocument();
    // A blank VITE_APP_URL must not reach href, where it would self-link.
    expect(
      screen.getByRole("link", { name: "Read today's edition" }),
    ).toHaveAttribute("href", "/");
  });

  it("states the finite-news positioning", () => {
    render(<App />);

    expect(screen.getByText("No infinite feed.")).toBeInTheDocument();
    expect(
      screen.getByText("After 10 stories, you're done."),
    ).toBeInTheDocument();
  });

  it("offers exactly one link, and it is a real one", () => {
    /*
      One destination: the reader. A second link is a second thing to decide
      about on a page whose whole job is to explain the product and get out of
      the way (section 10), and it would also make the "no skip link" argument
      below stop holding.

      A real `<a href>`, never a `<div role="link">` or a `<button>` that
      navigates. The platform's anchor comes with the keyboard behaviour, the
      context menu, middle-click, "open in new tab" and the status-bar preview
      of where it goes; a div wearing the role has the name and none of the
      rest, and `getByRole` cannot tell the two apart on its own.
    */
    render(<App />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.tagName).toBe("A");
    expect(links[0]).toHaveAttribute("href");
    expect(document.querySelectorAll('[role="link"]')).toHaveLength(0);
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });

  it("adds no tabindex anywhere", () => {
    /*
      `tabindex="0"` on a link or a button is redundant; on anything else it
      makes a non-control focusable, which announces something operable that is
      not. `tabindex="-1"` takes a control out of the tab order entirely, and a
      positive value reorders the page against its own source, which is the one
      form that breaks every reader downstream of it. The page needs none of
      the three: it has one control, and the platform already puts it where it
      belongs.
    */
    render(<App />);

    expect(document.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("has no skip link, deliberately", () => {
    /*
      Encoded as a test so that it is a decision rather than an omission, and so
      that it is not added later by pattern-matching on the reader — which does
      have one, and needs it.

      WCAG 2.2 success criterion 2.4.1 asks for a way past blocks of content
      REPEATED across pages. This is one page. It is entirely inside `<main>`,
      there is no navigation landmark, no header repeated from anywhere, and
      exactly one focusable element on it. A skip link here would skip nothing —
      and it would put a tab stop in front of the call to action, so the first
      Tab would offer a bypass of a page that has nothing to bypass instead of
      the one thing the page is for. That is strictly worse keyboard operation,
      bought with a control added for the appearance of accessibility.

      This changes the day the landing page grows a navigation region or a
      second page. The assertion failing then is the reminder.
    */
    render(<App />);

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: /^skip/i })).toBeNull();
    expect(
      screen
        .getAllByRole("link")
        .every((link) => !link.getAttribute("href")?.startsWith("#")),
    ).toBe(true);
  });
});
