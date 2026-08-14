import type { Story } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import { storySources } from "./story-sources";

/** A story cited against three of the edition's sources, in a chosen order. */
function citing(sourceIds: string[]): Story {
  const [story] = validEdition().stories;
  if (story === undefined) {
    throw new Error("the fixture edition has no stories");
  }
  return { ...story, sourceIds, sourceCount: sourceIds.length };
}

describe("storySources", () => {
  it("resolves the ids a story cites", () => {
    const edition = validEdition();

    expect(
      storySources(citing(["src-2"]), edition).map((source) => source.id),
    ).toEqual(["src-2"]);
  });

  it("keeps the story's citation order, not the edition's source order", () => {
    const edition = validEdition();
    const story = citing(["src-4", "src-1", "src-3"]);

    expect(storySources(story, edition).map((source) => source.id)).toEqual([
      "src-4",
      "src-1",
      "src-3",
    ]);
  });

  it("skips an id the edition does not carry rather than returning a hole", () => {
    const edition = validEdition();
    const story = citing(["src-1", "src-absent", "src-2"]);

    const resolved = storySources(story, edition);

    expect(resolved.map((source) => source.id)).toEqual(["src-1", "src-2"]);
    expect(resolved.every((source) => source !== undefined)).toBe(true);
  });

  it("returns nothing when none of the cited sources are present", () => {
    const edition = { ...validEdition(), sources: [] };

    expect(storySources(citing(["src-1"]), edition)).toEqual([]);
  });
});
