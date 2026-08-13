import { describe, expect, it } from "vitest";
import { boundedText, identifierSchema } from "./identifiers";

describe("identifierSchema", () => {
  it("accepts lowercase kebab-case", () => {
    expect(identifierSchema.safeParse("story-rbi-rate-hold").success).toBe(
      true,
    );
    expect(identifierSchema.safeParse("src1").success).toBe(true);
  });

  it("rejects casing that would defeat a uniqueness check", () => {
    // `Story-1` and `story-1` are two ids that look like one. Both would pass a
    // duplicate check and only one would resolve.
    expect(identifierSchema.safeParse("Story-1").success).toBe(false);
  });

  it("rejects separators that do not survive a URL", () => {
    expect(identifierSchema.safeParse("story 1").success).toBe(false);
    expect(identifierSchema.safeParse("story_1").success).toBe(false);
    expect(identifierSchema.safeParse("story/1").success).toBe(false);
  });

  it("rejects leading, trailing, and doubled hyphens", () => {
    expect(identifierSchema.safeParse("-story").success).toBe(false);
    expect(identifierSchema.safeParse("story-").success).toBe(false);
    expect(identifierSchema.safeParse("story--1").success).toBe(false);
  });

  it("rejects an empty or oversized identifier", () => {
    expect(identifierSchema.safeParse("").success).toBe(false);
    expect(identifierSchema.safeParse("a".repeat(65)).success).toBe(false);
  });
});

describe("boundedText", () => {
  it("measures the trimmed value", () => {
    // Whitespace passing a minimum length would render as an empty line in a
    // story card rather than failing validation.
    expect(boundedText(3, 10).safeParse("   ").success).toBe(false);
    expect(boundedText(3, 10).safeParse("  abc  ").success).toBe(true);
  });

  it("enforces the upper bound", () => {
    expect(boundedText(1, 5).safeParse("abcdef").success).toBe(false);
  });
});
