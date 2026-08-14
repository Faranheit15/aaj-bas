import {
  CONFIDENCE_LEVELS,
  REPORTING_TYPES,
  SOURCE_TYPES,
  type Story,
  TOPIC_SLUGS,
} from "@aaj-bas/schemas";
import { correctedEdition, validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LABELS,
  REPORTING_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  sourceCountLabel,
  TOPIC_LABELS,
  updateMarkerFor,
} from "./story-labels";

/** A story to vary, taken from the fixture rather than restated here. */
function sampleStory(id = "story-0"): Story {
  const story = validEdition().stories.find((candidate) => candidate.id === id);
  if (story === undefined) {
    throw new Error(`the fixture edition has no ${id}`);
  }
  return story;
}

const corrections = correctedEdition().correctionNotes;

// Each of these iterates the schema constant rather than a list written here.
// A slug added to the schema fails the compile in story-labels.ts and, if that
// were ever loosened, fails here rather than rendering as kebab-case to a
// reader.
describe("the label maps", () => {
  it("labels every topic the schema allows", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(TOPIC_LABELS[slug]).not.toBe("");
    }
    expect(Object.keys(TOPIC_LABELS)).toHaveLength(TOPIC_SLUGS.length);
  });

  it("labels every reporting type the schema allows", () => {
    for (const type of REPORTING_TYPES) {
      expect(REPORTING_TYPE_LABELS[type]).not.toBe("");
    }
    expect(Object.keys(REPORTING_TYPE_LABELS)).toHaveLength(
      REPORTING_TYPES.length,
    );
  });

  it("labels every confidence level the schema allows", () => {
    for (const level of CONFIDENCE_LEVELS) {
      expect(CONFIDENCE_LABELS[level]).not.toBe("");
    }
    expect(Object.keys(CONFIDENCE_LABELS)).toHaveLength(
      CONFIDENCE_LEVELS.length,
    );
  });

  it("labels every source type the schema allows", () => {
    for (const type of SOURCE_TYPES) {
      expect(SOURCE_TYPE_LABELS[type]).not.toBe("");
    }
    expect(Object.keys(SOURCE_TYPE_LABELS)).toHaveLength(SOURCE_TYPES.length);
  });

  it("calls an official reporting type an official statement, as PRD 6.3 does", () => {
    expect(REPORTING_TYPE_LABELS.official).toBe("Official statement");
  });

  it("says sources disagree rather than resolving the disagreement", () => {
    // Section 22: disagreement is preserved. A label such as "Unconfirmed" or
    // "Low confidence" would report the story as weak instead of reporting
    // what is actually known about it.
    expect(CONFIDENCE_LABELS.disputed).toBe("Sources disagree");
  });
});

describe("sourceCountLabel", () => {
  it("writes one source out in words, as PRD 6.1 does", () => {
    expect(sourceCountLabel(1)).toBe("single source");
  });

  it("counts several sources", () => {
    expect(sourceCountLabel(3)).toBe("3 sources");
  });
});

describe("updateMarkerFor", () => {
  it("marks nothing on a story that has not changed since publication", () => {
    expect(updateMarkerFor(sampleStory(), [])).toBeNull();
  });

  it("marks a story updated when it changed after publication", () => {
    const story = {
      ...sampleStory(),
      updatedAt: "2026-08-13T18:00:00+05:30",
    };

    expect(updateMarkerFor(story, [])).toBe("Updated");
  });

  it("compares the timestamps as instants, not as strings", () => {
    // The same moment written in two offsets. A string comparison reads
    // "2026-08-13T10:00:00+05:30" as greater and marks an unchanged story.
    const story = {
      ...sampleStory(),
      firstPublishedAt: "2026-08-13T10:00:00+05:30",
      updatedAt: "2026-08-13T04:30:00Z",
    };

    expect(updateMarkerFor(story, [])).toBeNull();
  });

  it("marks a corrected story corrected rather than updated", () => {
    const story = {
      ...sampleStory(),
      updatedAt: "2026-08-13T18:45:00+05:30",
    };

    expect(updateMarkerFor(story, corrections)).toBe("Corrected");
  });

  it("does not carry another story's correction onto this one", () => {
    expect(corrections.map((note) => note.storyId)).not.toContain("story-1");

    expect(updateMarkerFor(sampleStory("story-1"), corrections)).toBeNull();
  });
});
