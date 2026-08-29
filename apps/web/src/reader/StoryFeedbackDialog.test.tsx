import "@testing-library/jest-dom/vitest";
import type { Story } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryFeedbackDialog } from "./StoryFeedbackDialog";

afterEach(cleanup);

function sampleStory(): Story {
  const [story] = validEdition().stories;
  if (!story) throw new Error("Fixture has no story");
  return story;
}

describe("StoryFeedbackDialog (AB-801)", () => {
  const editionDate = "2026-08-29";
  let story: Story;

  beforeEach(() => {
    sessionStorage.clear();
    story = sampleStory();
  });

  it("does not render when isOpen is false", () => {
    render(
      <StoryFeedbackDialog
        isOpen={false}
        onClose={vi.fn()}
        editionDate={editionDate}
        story={story}
      />,
    );

    expect(
      screen.queryByRole("dialog", {
        name: /Report an issue with this story/i,
      }),
    ).toBeNull();
  });

  it("renders all four required feedback categories when open", () => {
    render(
      <StoryFeedbackDialog
        isOpen={true}
        onClose={vi.fn()}
        editionDate={editionDate}
        story={story}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Factual error")).toBeInTheDocument();
    expect(screen.getByLabelText("Misleading wording")).toBeInTheDocument();
    expect(screen.getByLabelText("Broken source")).toBeInTheDocument();
    expect(screen.getByLabelText("Other")).toBeInTheDocument();
  });

  it("allows selecting a category and typing detail text", () => {
    render(
      <StoryFeedbackDialog
        isOpen={true}
        onClose={vi.fn()}
        editionDate={editionDate}
        story={story}
      />,
    );

    const radio = screen.getByLabelText("Misleading wording");
    fireEvent.click(radio);
    expect(radio).toBeChecked();

    const textarea = screen.getByPlaceholderText(
      /Quote the wording or describe the issue/i,
    );
    fireEvent.change(textarea, {
      target: { value: "The headline says 50% instead of 5%." },
    });
    expect(textarea).toHaveValue("The headline says 50% instead of 5%.");
  });

  it("copies report text to clipboard and displays success message", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <StoryFeedbackDialog
        isOpen={true}
        onClose={vi.fn()}
        editionDate={editionDate}
        story={story}
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /Copy report text/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    expect(
      await screen.findByText(/Report text copied to clipboard/i),
    ).toBeInTheDocument();
  });

  it("prevents rapid duplicate submissions on the same story", async () => {
    sessionStorage.setItem(
      `aaj_bas_fb_cooldown_${story.id}`,
      String(Date.now()),
    );

    render(
      <StoryFeedbackDialog
        isOpen={true}
        onClose={vi.fn()}
        editionDate={editionDate}
        story={story}
      />,
    );

    expect(
      screen.getByText(/You recently submitted feedback for this story/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Factual error")).toBeNull();
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <StoryFeedbackDialog
        isOpen={true}
        onClose={onClose}
        editionDate={editionDate}
        story={story}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
