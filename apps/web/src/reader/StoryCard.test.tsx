import "@testing-library/jest-dom/vitest";
import type {
  CorrectionNote,
  Edition,
  SourceReference,
  Story,
} from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import editionJson from "../../../../content/editions/2026-07-21.json";
import { formatEditionInstant } from "../edition/editorial-day";
import { reportIssueHref } from "./report-issue";
import { StoryCard } from "./StoryCard";
import {
  CONFIDENCE_LABELS,
  REPORTING_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  sourceCountLabel,
  TOPIC_LABELS,
} from "./story-labels";

afterEach(cleanup);

/**
 * The real published edition, parsed rather than cast, exactly as
 * `EditionView.test.tsx` does it: `resolveJsonModule` would otherwise have
 * TypeScript assert the shape these tests exist to render.
 */
const edition: Edition = editionSchema.parse(editionJson as unknown);

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}

function storyById(id: string): Story {
  return present(
    edition.stories.find((candidate) => candidate.id === id),
    `story ${id}`,
  );
}

/** Resolved in `sourceIds` order, which is the order the card is handed. */
function sourcesFor(story: Story): SourceReference[] {
  return story.sourceIds.map((id) =>
    present(
      edition.sources.find((candidate) => candidate.id === id),
      `source ${id}`,
    ),
  );
}

function correctionsFor(story: Story): CorrectionNote[] {
  return edition.correctionNotes.filter((note) => note.storyId === story.id);
}

type Overrides = {
  readonly sources?: readonly SourceReference[];
  readonly corrections?: readonly CorrectionNote[];
  readonly position?: number;
  readonly total?: number;
  readonly onExpand?: (storyId: string) => void;
};

function renderCard(story: Story, overrides: Overrides = {}) {
  return render(
    <StoryCard
      story={story}
      sources={overrides.sources ?? sourcesFor(story)}
      corrections={overrides.corrections ?? correctionsFor(story)}
      position={overrides.position ?? 3}
      total={overrides.total ?? 8}
      editionDate={edition.date}
      onExpand={overrides.onExpand ?? vi.fn()}
    />,
  );
}

function toggleFor(story: Story): HTMLElement {
  return screen.getByRole("button", { name: story.headline });
}

function expand(story: Story): void {
  fireEvent.click(toggleFor(story));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches an accessible name carrying these parts, in this order. */
function nameContaining(...parts: readonly string[]): RegExp {
  return new RegExp(parts.map(escapeRegExp).join("[\\s\\S]*"));
}

// Chosen for their shapes, not their subjects.
const reportingStory = storyById("story-vetrapur-ring-road-repair"); // background, no uncertainty, three sources, never changed
const officialStory = storyById("story-vetrakhand-bus-fare-order"); // single source, uncertainty, no background
const analysisStory = storyById("story-nallanadu-freight-tariff");
const disputedStory = storyById("story-grid-scheduling-pilot");
const updatedStory = storyById("story-kalvapur-archive-restoration"); // updated, never corrected
const correctedStory = storyById("story-coastal-zone-consultation"); // carries the edition's correction note
const unchangedStory = storyById("story-verrin-sea-fisheries-compact");

const REPORT_LINK = "Report an issue on GitHub";
const REPORT_NOTE =
  "Issues are public, and posted under your own GitHub account.";

describe("a collapsed story card", () => {
  it("shows the ordinal, topic, headline, deck and source count", () => {
    const { container } = renderCard(reportingStory, { position: 3, total: 8 });

    expect(screen.getByText("3 of 8")).toBeInTheDocument();
    expect(
      screen.getByText(TOPIC_LABELS[reportingStory.topic]),
    ).toBeInTheDocument();
    expect(toggleFor(reportingStory)).toBeInTheDocument();
    expect(screen.getByText(reportingStory.deck)).toBeInTheDocument();
    expect(
      present(
        container.querySelector(".story-provenance"),
        "the provenance line",
      ),
    ).toHaveTextContent(sourceCountLabel(reportingStory.sourceCount));
  });

  it("counts against the cards actually rendered, not a promised ten", () => {
    // "3 of 10" above a list that ends at eight would tell the reader there is
    // more to come, which is the hidden backlog section 3.1 forbids.
    renderCard(reportingStory, { position: 3, total: 8 });

    expect(screen.getByText("3 of 8")).toBeInTheDocument();
    expect(screen.queryByText("3 of 10")).toBeNull();
  });

  it("offers no link at all until it is expanded", () => {
    renderCard(reportingStory);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows none of the expanded prose", () => {
    renderCard(reportingStory);

    expect(screen.queryByText("What changed")).toBeNull();
    expect(screen.queryByText("Why it matters")).toBeNull();
    expect(screen.queryByText(reportingStory.whyItMatters)).toBeNull();
  });

  it("puts the toggle inside the second-level headline", () => {
    // The headline stays a real `h2` so the edition's outline survives; the
    // control lives inside it rather than replacing it.
    renderCard(reportingStory);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(1);
    const headline = present(headings[0], "the story headline");
    expect(headline).toHaveTextContent(reportingStory.headline);
    expect(headline.querySelector("button")).toBe(toggleFor(reportingStory));
  });
});

describe("the disclosure control", () => {
  it("reports its state through aria-expanded, both ways", () => {
    renderCard(reportingStory);

    const toggle = toggleFor(reportingStory);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("is a native button, so the keyboard operates it without a handler", () => {
    /*
     * jsdom does not synthesise a click from `fireEvent.keyDown`, so a
     * keypress assertion cannot show here that the keyboard works. What is
     * asserted instead is the property that makes it work in a browser: a real
     * `<button>`, enabled, with no tabIndex overriding the natural tab order.
     * The test below asserts the other half — that nothing has been added on
     * top of it.
     */
    renderCard(reportingStory);

    const toggle = toggleFor(reportingStory);
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toBeEnabled();
    expect(toggle).not.toHaveAttribute("tabindex");
  });

  it("does not toggle on a key event of its own, only on activation", () => {
    /*
     * Read the polarity carefully: this does NOT assert that the keyboard
     * fails to open the card. It asserts that the component has no key handler
     * of its own — which is what keeps the keyboard correct.
     *
     * A browser turns Enter or Space on a native button into a click, and the
     * card opens. jsdom does not, so on the correct implementation a bare
     * keydown changes nothing here. A hand-rolled `onKeyDown` calling `toggle`
     * would make this state change — and in a real browser it would run
     * alongside the click the browser also synthesises, opening and instantly
     * closing the card on every Enter. This assertion is the only thing that
     * would notice.
     */
    renderCard(reportingStory);

    const toggle = toggleFor(reportingStory);
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(toggle, { key });
      fireEvent.keyUp(toggle, { key });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    }

    // The click a browser would have synthesised does open it, once.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("points at the panel only while the panel exists", () => {
    // A permanent aria-controls would be a dangling IDREF whenever the card is
    // closed, and an offer to jump to a missing element is worse than none.
    const { container } = renderCard(reportingStory);

    const toggle = toggleFor(reportingStory);
    expect(toggle).not.toHaveAttribute("aria-controls");

    fireEvent.click(toggle);
    const panel = present(
      container.querySelector(".story-panel"),
      "the expanded panel",
    );
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.id).not.toBe("");
  });

  it("tells the application a story was expanded, once, and not on collapse", () => {
    // Viewed is monotonic. Collapsing says nothing about whether it was read.
    const onExpand = vi.fn();
    renderCard(reportingStory, { onExpand });

    expand(reportingStory);
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledWith(reportingStory.id);

    fireEvent.click(toggleFor(reportingStory));
    expect(onExpand).toHaveBeenCalledTimes(1);

    fireEvent.click(toggleFor(reportingStory));
    expect(onExpand).toHaveBeenCalledTimes(2);
  });
});

describe("the update marker", () => {
  it("says a story was corrected when a correction note names it", () => {
    renderCard(correctedStory);

    expect(screen.getByText("Corrected")).toBeInTheDocument();
  });

  it("says a story was updated when it changed without a correction", () => {
    renderCard(updatedStory);

    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("Corrected")).toBeNull();
  });

  it("says nothing when the story has not changed since publication", () => {
    const { container } = renderCard(unchangedStory);

    expect(container.querySelector(".story-marker")).toBeNull();
  });
});

describe("an expanded story card", () => {
  it("renders every what-changed paragraph, and why it matters", () => {
    renderCard(reportingStory);
    expand(reportingStory);

    expect(
      screen.getByRole("heading", { name: "What changed", level: 3 }),
    ).toBeVisible();
    for (const paragraph of reportingStory.whatChanged) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Why it matters", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText(reportingStory.whyItMatters)).toBeInTheDocument();
  });

  it("labels an analysis as analysis, in words, ahead of the prose", () => {
    // Deliberately ahead of PRD 6.2's item-6 position: a label arriving after
    // two factual-sounding paragraphs has already missed the reader who
    // stopped at the first one.
    const { container } = renderCard(analysisStory);
    expand(analysisStory);

    const labels = present(
      container.querySelector(".story-labels"),
      "the label line",
    );
    expect(labels).toHaveTextContent(
      `Reporting type: ${REPORTING_TYPE_LABELS.analysis}`,
    );
    expect(labels).toHaveTextContent(CONFIDENCE_LABELS["multi-source"]);
    // The slug is an internal value; the reader is shown the label.
    expect(screen.queryByText("analysis")).toBeNull();

    const firstParagraph = present(
      container.querySelector(".story-what-changed"),
      "the first what-changed paragraph",
    );
    expect(
      labels.compareDocumentPosition(firstParagraph) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });

  it("labels a disputed story as disputed rather than reconciling it", () => {
    const { container } = renderCard(disputedStory);
    expand(disputedStory);

    expect(
      present(container.querySelector(".story-labels"), "the label line"),
    ).toHaveTextContent(CONFIDENCE_LABELS.disputed);
    expect(screen.queryByText("disputed")).toBeNull();
  });

  it("labels an official statement as an official statement", () => {
    const { container } = renderCard(officialStory);
    expand(officialStory);

    const labels = present(
      container.querySelector(".story-labels"),
      "the label line",
    );
    expect(labels).toHaveTextContent(
      `Reporting type: ${REPORTING_TYPE_LABELS.official}`,
    );
    expect(labels).toHaveTextContent(CONFIDENCE_LABELS["single-source"]);
    expect(screen.queryByText("official")).toBeNull();
  });

  it("shows what is uncertain when the story carries it", () => {
    const uncertainty = present(
      disputedStory.uncertainty,
      "the story's uncertainty",
    );
    renderCard(disputedStory);
    expand(disputedStory);

    expect(
      screen.getByRole("heading", { name: "What is uncertain", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText(uncertainty)).toBeVisible();
  });

  it("puts every panel section exactly one level below the headline", () => {
    /*
      A heading level is a structural claim, and a skipped one is a false
      claim: an `h4` under the `h2` headline tells a screen-reader user that a
      level-3 section exists somewhere above it that they have missed. The
      levels are asserted here rather than left to the names, because every
      name-only assertion in this file passes just as happily on an `h6`.
    */
    expect(reportingStory.background).toBeDefined();
    expect(reportingStory.uncertainty).toBeUndefined();
    renderCard(reportingStory);
    expand(reportingStory);

    const headings = screen.getAllByRole("heading");
    expect(headings.map((heading) => heading.tagName)).toEqual([
      "H2",
      "H3",
      "H3",
      "H3",
      "H3",
    ]);
    expect(headings.map((heading) => heading.textContent)).toEqual([
      reportingStory.headline,
      "What changed",
      "Why it matters",
      "Background",
      "Sources",
    ]);
  });

  it("keeps the uncertainty section at the same level as the rest", () => {
    // The section that only some stories carry is the one most likely to drift
    // out of the outline, because most renders never show it.
    expect(disputedStory.uncertainty).toBeDefined();
    renderCard(disputedStory);
    expand(disputedStory);

    const [headline, ...sections] = screen.getAllByRole("heading");
    expect(present(headline, "the headline").tagName).toBe("H2");
    expect(sections.map((heading) => heading.tagName)).toEqual(
      sections.map(() => "H3"),
    );
    expect(sections.map((heading) => heading.textContent)).toContain(
      "What is uncertain",
    );
  });

  it("renders no uncertainty section, and no filler, when there is none", () => {
    // Section 20: nothing is invented to fill a layout, and a standing empty
    // section would teach the reader to skip the one that matters.
    expect(reportingStory.uncertainty).toBeUndefined();
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    expect(screen.queryByText("What is uncertain")).toBeNull();
    expect(container.querySelector(".story-uncertainty")).toBeNull();
  });
});

describe("the background disclosure", () => {
  it("appears only when the story carries background", () => {
    expect(reportingStory.background).toBeDefined();
    renderCard(reportingStory);
    expand(reportingStory);

    expect(
      screen.getByRole("button", { name: "Background" }),
    ).toBeInTheDocument();
    // A section label that is also a control is still a section label, and it
    // sits at the level its neighbours do.
    expect(
      screen.getByRole("heading", { name: "Background", level: 3 }),
    ).toBeInTheDocument();
  });

  it("is absent when the story carries none", () => {
    expect(officialStory.background).toBeUndefined();
    renderCard(officialStory);
    expand(officialStory);

    expect(screen.queryByRole("button", { name: "Background" })).toBeNull();
  });

  it("keeps its text hidden until the reader asks for it", () => {
    const background = present(
      reportingStory.background,
      "the story's background",
    );
    renderCard(reportingStory);
    expand(reportingStory);

    const control = screen.getByRole("button", { name: "Background" });
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(background)).toBeNull();

    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(background)).toBeVisible();
  });

  it("does not toggle on a key event of its own either", () => {
    // Same guard as the card toggle, for the same reason: this control is also
    // a native button, so a key handler here would double-activate it in a
    // browser while looking correct in jsdom.
    renderCard(reportingStory);
    expand(reportingStory);

    const control = screen.getByRole("button", { name: "Background" });
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(control, { key });
      fireEvent.keyUp(control, { key });
      expect(control).toHaveAttribute("aria-expanded", "false");
    }

    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-expanded", "true");
  });

  it("is closed again after the card is collapsed and re-expanded", () => {
    // Intentional: its state unmounts with the panel. Remembering which
    // sub-sections a reader opened would be per-card reading history kept for
    // no reader-facing purpose.
    const background = present(
      reportingStory.background,
      "the story's background",
    );
    renderCard(reportingStory);
    expand(reportingStory);
    fireEvent.click(screen.getByRole("button", { name: "Background" }));
    expect(screen.getByText(background)).toBeVisible();

    fireEvent.click(toggleFor(reportingStory));
    fireEvent.click(toggleFor(reportingStory));

    expect(screen.getByRole("button", { name: "Background" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText(background)).toBeNull();
  });
});

describe("the source list", () => {
  it("lists one source per sourceIds entry, linking the original", () => {
    const sources = sourcesFor(reportingStory);
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    expect(container.querySelectorAll(".story-source")).toHaveLength(
      reportingStory.sourceIds.length,
    );
    const hrefs = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(".story-source-link"),
    ).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(sources.map((source) => source.url));
  });

  it("names the publisher before the title in each link's accessible name", () => {
    // A screen-reader user listing the links otherwise hears a run of
    // headlines with no idea who published any of them.
    const sources = sourcesFor(reportingStory);
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(".story-source-link"),
    );
    expect(links).toHaveLength(sources.length);
    sources.forEach((source, index) => {
      expect(
        present(links[index], `source link ${index}`),
      ).toHaveAccessibleName(nameContaining(source.publisher, source.title));
    });
  });

  it("opens originals in place, with rel=noopener and nothing else", () => {
    /*
     * No `target="_blank"`: a new window the reader did not ask for needs a
     * programmatically determinable warning on every link (WCAG H83/G200), and
     * a run of "opens in a new window" labels is the clutter section 28 rules
     * out. `noreferrer` would hide from a publisher that we sent them a
     * reader; `nofollow` and `ugc` would disclaim citations the story rests on.
     */
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(".story-source-link"),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("rel")).toBe("noopener");
      expect(link).not.toHaveAttribute("target");
    }
  });

  it("labels the source type and times it in the editorial timezone", () => {
    // A real regression test: Vitest pins TZ=America/Los_Angeles, so a
    // host-timezone rendering of 21:15 IST would read as 8:45 am on the 20th.
    const sources = sourcesFor(reportingStory);
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    const items = Array.from(container.querySelectorAll(".story-source"));
    sources.forEach((source, index) => {
      const item = present(items[index], `source item ${index}`);
      expect(item).toHaveTextContent(SOURCE_TYPE_LABELS[source.sourceType]);
      const time = present(item.querySelector("time"), "the source time");
      expect(time).toHaveAttribute("datetime", source.publishedAt);
      expect(time).toHaveTextContent(formatEditionInstant(source.publishedAt));
    });

    const firstTime = present(
      present(items[0], "the first source item").querySelector("time"),
      "the first source time",
    );
    expect(firstTime).toHaveTextContent("20 July 2026, 9:15 pm IST");
  });
});

describe("the story metadata", () => {
  it("shows when the story was first published, with its contract value", () => {
    const { container } = renderCard(reportingStory);
    expand(reportingStory);

    const metadata = present(
      container.querySelector(".story-metadata"),
      "the metadata line",
    );
    expect(metadata).toHaveTextContent("First published");
    expect(
      present(metadata.querySelector("time"), "the first-published time"),
    ).toHaveAttribute("datetime", reportingStory.firstPublishedAt);
  });

  it("shows an update time only when the story changed after publication", () => {
    const { container } = renderCard(updatedStory);
    expand(updatedStory);

    const metadata = present(
      container.querySelector(".story-metadata"),
      "the metadata line",
    );
    expect(metadata).toHaveTextContent("Updated");
    const times = Array.from(metadata.querySelectorAll("time"));
    const updated = present(times[1], "the updated time");
    expect(updated).toHaveAttribute("datetime", updatedStory.updatedAt);
    expect(updated).toHaveTextContent(
      formatEditionInstant(updatedStory.updatedAt),
    );
  });

  it("shows no update time when the story has not changed", () => {
    const { container } = renderCard(unchangedStory);
    expand(unchangedStory);

    expect(
      present(container.querySelector(".story-metadata"), "the metadata line"),
    ).not.toHaveTextContent("Updated");
  });

  it("says who wrote the summary and whether it was reviewed, in all four cases", () => {
    // All four say something, including the two that are unflattering: an
    // unreviewed summary silent about its review status is the case where the
    // sentence matters most.
    const cases: ReadonlyArray<{ story: Story; sentence: string }> = [
      {
        story: { ...reportingStory, generatedBy: "a-model-v1", reviewed: true },
        sentence:
          "Summary generated by a-model-v1 and reviewed before publication.",
      },
      {
        story: {
          ...reportingStory,
          generatedBy: "a-model-v1",
          reviewed: false,
        },
        sentence: "Summary generated by a-model-v1. Not reviewed.",
      },
      {
        // `reportingStory` carries no `generatedBy`, so an editor wrote it.
        story: { ...reportingStory, reviewed: true },
        sentence: "Written and reviewed by an editor.",
      },
      {
        story: { ...reportingStory, reviewed: false },
        sentence: "Written by an editor. Not reviewed.",
      },
    ];

    for (const { story, sentence } of cases) {
      renderCard(story);
      expand(story);
      expect(screen.getByText(sentence)).toBeInTheDocument();
      cleanup();
    }
  });
});

describe("corrections", () => {
  it("shows a timestamped correction for every note naming the story", () => {
    const notes = correctionsFor(correctedStory);
    expect(notes).toHaveLength(1);
    const note = present(notes[0], "the correction note");

    const { container } = renderCard(correctedStory);
    expand(correctedStory);

    const corrections = Array.from(
      container.querySelectorAll(".story-correction"),
    );
    expect(corrections).toHaveLength(1);
    const correction = present(corrections[0], "the correction paragraph");
    expect(correction).toHaveTextContent("Correction,");
    expect(correction).toHaveTextContent(note.summary);
    expect(
      present(correction.querySelector("time"), "the correction time"),
    ).toHaveAttribute("datetime", note.correctedAt);
  });

  it("shows no correction paragraph when no note names the story", () => {
    const { container } = renderCard(reportingStory, { corrections: [] });
    expand(reportingStory);

    expect(container.querySelector(".story-correction")).toBeNull();
    expect(screen.queryByText(/^Correction,/)).toBeNull();
  });
});

describe("reporting an issue", () => {
  it("offers the report link only once the card is expanded", () => {
    renderCard(reportingStory);

    expect(screen.queryByRole("link", { name: REPORT_LINK })).toBeNull();

    expand(reportingStory);

    const report = screen.getByRole("link", { name: REPORT_LINK });
    expect(report).toHaveAttribute(
      "href",
      reportIssueHref(edition.date, reportingStory),
    );
    expect(report.getAttribute("rel")).toBe("noopener");
    expect(report).not.toHaveAttribute("target");
  });

  it("names the third-party destination in the link itself", () => {
    // The name is all a screen-reader user listing the page's links hears, and
    // it is what a sighted reader decides on. "Report an issue with this
    // story" reads like a form belonging to this product; the destination is
    // someone else's site.
    renderCard(reportingStory);
    expand(reportingStory);

    expect(
      screen.getByRole("link", { name: REPORT_LINK }),
    ).toHaveAccessibleName(/GitHub/);
    expect(
      screen.queryByRole("link", { name: "Report an issue with this story" }),
    ).toBeNull();
  });

  it("says the report will be public and under the reader's own account", () => {
    // Both facts are only discoverable by arriving, and one of them is that
    // the reader's name goes on it. Attached with `aria-describedby` so it
    // reaches a reader who lands on the link directly.
    renderCard(reportingStory);
    expand(reportingStory);

    expect(screen.getByText(REPORT_NOTE)).toBeVisible();
    expect(
      screen.getByRole("link", { name: REPORT_LINK }),
    ).toHaveAccessibleDescription(REPORT_NOTE);
  });
});

describe("what the card never renders", () => {
  it("requires no image in either state", () => {
    // Section 18: no publisher photography, and the schema carries no image
    // field. Nothing here can shift layout as an image loads.
    const { container } = renderCard(reportingStory);
    expect(container.querySelectorAll("img")).toHaveLength(0);

    expand(reportingStory);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("picture")).toHaveLength(0);
  });

  it("offers nothing that continues past this story", () => {
    // Constitution rule 1: finishing a story leads nowhere by itself.
    renderCard(reportingStory);
    expand(reportingStory);

    for (const name of [/next story/i, /read next/i, /continue/i, /related/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
  });
});
