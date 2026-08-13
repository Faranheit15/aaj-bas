import { editionSchema } from "@aaj-bas/schemas";
import { describe, expect, it } from "vitest";
import { correctedEdition, invalidEditions, validEdition } from "./editions";

describe("validEdition", () => {
  it("satisfies the edition contract", () => {
    const result = editionSchema.safeParse(validEdition());

    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("offers a reader ten reachable stories", () => {
    const edition = validEdition();
    const pooled = new Set(Object.values(edition.interestPools).flat());

    expect(edition.coreStoryIds).toHaveLength(8);
    expect(pooled.size).toBeGreaterThanOrEqual(2);
  });

  it("returns a fresh object each call", () => {
    // A shared fixture that one test mutates becomes a failure in another,
    // attributed to the wrong change.
    expect(validEdition()).not.toBe(validEdition());
    expect(validEdition()).toEqual(validEdition());
  });

  it("cites no real publisher", () => {
    // Section 18 applies to fixtures too: a fixture is exactly where a copied
    // headline or a real article URL would sit unnoticed.
    for (const source of validEdition().sources) {
      expect(new URL(source.url).hostname).toBe("example.test");
    }
  });
});

describe("correctedEdition", () => {
  it("satisfies the edition contract", () => {
    const result = editionSchema.safeParse(correctedEdition());

    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("keeps the correction visible and attached to a story", () => {
    const edition = correctedEdition();
    const storyIds = new Set(edition.stories.map((story) => story.id));

    expect(edition.correctionNotes).toHaveLength(1);
    for (const note of edition.correctionNotes) {
      expect(storyIds.has(note.storyId)).toBe(true);
      expect(note.summary.length).toBeGreaterThan(0);
    }
  });
});

describe("invalidEditions", () => {
  it.each(Object.keys(invalidEditions))("rejects: %s", (reason) => {
    expect(editionSchema.safeParse(invalidEditions[reason]).success).toBe(
      false,
    );
  });

  it("covers every acceptance criterion AB-101 names", () => {
    // Named rather than counted, so removing a fixture fails here instead of
    // quietly shrinking what the contract is known to catch.
    expect(Object.keys(invalidEditions)).toEqual(
      expect.arrayContaining([
        "story cites a source the edition does not carry",
        "core holds seven stories instead of eight",
        "two stories share an id",
        "reporting type is not one the product labels",
        "edition date does not exist",
      ]),
    );
  });
});
