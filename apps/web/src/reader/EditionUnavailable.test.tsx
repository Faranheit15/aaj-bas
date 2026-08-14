import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatEditionDate } from "../edition/editorial-day";
import type { Route } from "../routing/route";
import { editionHref, LATEST_HREF } from "../routing/route";
import { navigate } from "../routing/use-route";
import { EditionUnavailable } from "./EditionUnavailable";

// Only `navigate` is exercised here; the component reads nothing else from the
// routing hook module.
vi.mock("../routing/use-route", () => ({
  navigate: vi.fn(),
  useRoute: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Drops the own property and restores jsdom's own `onLine`.
  Reflect.deleteProperty(window.navigator, "onLine");
});

/** Written out rather than cast: if the route contract turns out to be shaped
 * differently, this should fail to compile rather than fail quietly. */
const latestRoute: Route = { kind: "latest" };
const dateRoute: Route = { kind: "edition", date: "2026-07-21" };
const unknownRoute: Route = { kind: "unknown", path: "/reading-list" };

function setOnLine(onLine: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    value: onLine,
    configurable: true,
  });
}

describe("an edition that could not be shown", () => {
  it("says the edition could not be reached when the network failed", () => {
    setOnLine(true);
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "We could not reach the edition." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The edition could not be downloaded. Your connection may have dropped.",
      ),
    ).toBeInTheDocument();
  });

  it("says the reader is offline when the device reports no connection", () => {
    // Read only after a request has already failed, never to pre-empt one.
    setOnLine(false);
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "You appear to be offline." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The edition could not be downloaded. It has not been saved to this device.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing is published here when the latest edition is missing", () => {
    render(
      <EditionUnavailable
        reason="unavailable"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The edition is not available." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is published at this address yet."),
    ).toBeInTheDocument();
  });

  it("says there is no edition for that date when a date was asked for", () => {
    render(
      <EditionUnavailable
        reason="unavailable"
        route={dateRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "There is no edition for that date.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No edition is published for that date."),
    ).toBeInTheDocument();
  });

  it("says the failure is ours when the host would not answer", () => {
    // Deliberately not the `unavailable` copy. "Nothing is published at this
    // address yet." during a CDN outage is a false statement about published
    // content, and it sends the reader off to check a connection that works.
    setOnLine(true);
    render(
      <EditionUnavailable
        reason="unreachable"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The edition could not be loaded." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The service did not return the edition. This is a problem at our end, not with the address.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing is published at this address yet."),
    ).toBeNull();
  });

  it("says the same thing about a failing host on a dated route", () => {
    // The route makes no difference here: the host said nothing about the
    // date, so there is nothing date-specific to say back.
    render(
      <EditionUnavailable
        reason="unreachable"
        route={dateRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The edition could not be loaded." }),
    ).toBeInTheDocument();
  });

  it("declines to show an edition it could not read, for either reason", () => {
    for (const reason of ["malformed", "invalid"] as const) {
      render(
        <EditionUnavailable
          reason={reason}
          route={latestRoute}
          priorDate="2026-07-21"
          onRetry={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("heading", {
          name: "We could not display this edition.",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "This edition did not match the format the reader expects, so it has not been shown rather than shown incorrectly.",
        ),
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it("offers a retry only when retrying could work", () => {
    for (const reason of ["network", "unavailable", "unreachable"] as const) {
      render(
        <EditionUnavailable
          reason={reason}
          route={latestRoute}
          priorDate={null}
          onRetry={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
      cleanup();
    }

    // Re-requesting the same bytes cannot make them parse or validate.
    for (const reason of ["malformed", "invalid"] as const) {
      render(
        <EditionUnavailable
          reason={reason}
          route={latestRoute}
          priorDate={null}
          onRetry={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      cleanup();
    }
  });

  it("asks the application to retry when the reader asks", () => {
    const onRetry = vi.fn();
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate={null}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("offers the latest edition, once, when a dated edition failed", () => {
    // The prior date is deliberately ignored on a date route: two ways back
    // would be the beginning of an archive.
    render(
      <EditionUnavailable
        reason="unavailable"
        route={dateRoute}
        priorDate="2026-07-20"
        onRetry={vi.fn()}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Open the latest edition");
    expect(links[0]).toHaveAttribute("href", LATEST_HREF);
  });

  it("offers the last known edition, once, when the latest failed", () => {
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate="2026-07-21"
        onRetry={vi.fn()}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(
      `Open the edition from ${formatEditionDate("2026-07-21")}`,
    );
    expect(links[0]).toHaveAttribute("href", editionHref("2026-07-21"));
  });

  it("treats an address that is not a route as an address holding nothing", () => {
    // Not "no edition for that date": the reader named no date. Offering the
    // latest edition is the only way out of an address the product does not
    // have, so this state is never a dead end.
    render(
      <EditionUnavailable
        reason="unavailable"
        route={unknownRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "The edition is not available." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is published at this address yet."),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", LATEST_HREF);
  });

  it("offers nowhere to go when no earlier edition is known", () => {
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("carries one first-level heading, which names the main landmark", () => {
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate={null}
        onRetry={vi.fn()}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAttribute("id", "edition-heading");
  });

  it("follows the prior-edition link in the application, not by reloading", () => {
    render(
      <EditionUnavailable
        reason="network"
        route={latestRoute}
        priorDate="2026-07-21"
        onRetry={vi.fn()}
      />,
    );

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link"), click);

    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(editionHref("2026-07-21"));
  });
});
