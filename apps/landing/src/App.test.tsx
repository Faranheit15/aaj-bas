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
    expect(
      screen.getByRole("link", { name: "Read today's edition" }),
    ).toBeInTheDocument();
  });

  it("states the finite-news positioning", () => {
    render(<App />);

    expect(screen.getByText("No infinite feed.")).toBeInTheDocument();
    expect(
      screen.getByText("After 10 stories, you're done."),
    ).toBeInTheDocument();
  });
});
