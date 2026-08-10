import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
afterEach(cleanup);
import { App } from "./App";

describe("reader application shell", () => {
  it("renders the application shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Today's edition" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The daily edition will appear here."),
    ).toBeInTheDocument();
  });

  it("renders the shared BrandMark", () => {
    render(<App />);

    expect(screen.getByText("Aaj, Bas.")).toBeInTheDocument();
  });
});
