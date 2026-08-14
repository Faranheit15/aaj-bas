import { CORE_STORY_COUNT } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import { coreStories } from "./core-stories";

describe("coreStories", () => {
  it("returns exactly the core count, not every story in the file", () => {
    const edition = validEdition();

    expect(edition.stories.length).toBeGreaterThan(CORE_STORY_COUNT);
    expect(coreStories(edition)).toHaveLength(CORE_STORY_COUNT);
  });

  it("keeps the order coreStoryIds names", () => {
    const edition = validEdition();

    expect(coreStories(edition).map((story) => story.id)).toEqual(
      edition.coreStoryIds,
    );
  });

  it("preserves that order when the stories array is shuffled", () => {
    const edition = validEdition();
    const shuffled = { ...edition, stories: [...edition.stories].reverse() };

    expect(coreStories(shuffled).map((story) => story.id)).toEqual(
      edition.coreStoryIds,
    );
  });

  it("leaves every pooled story out", () => {
    const edition = validEdition();
    const pooled = new Set(Object.values(edition.interestPools).flat());
    const returned = coreStories(edition).map((story) => story.id);

    expect(pooled.size).toBeGreaterThan(0);
    for (const id of pooled) {
      expect(returned).not.toContain(id);
    }
  });

  it("skips a core id the edition does not carry rather than returning a hole", () => {
    const edition = validEdition();
    const missing = {
      ...edition,
      stories: edition.stories.filter((story) => story.id !== "story-0"),
    };

    const returned = coreStories(missing);

    expect(returned).toHaveLength(CORE_STORY_COUNT - 1);
    expect(returned.every((story) => story !== undefined)).toBe(true);
  });
});
