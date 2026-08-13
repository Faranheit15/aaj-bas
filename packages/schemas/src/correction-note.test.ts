import { describe, expect, it } from "vitest";
import { correctionNoteSchema } from "./correction-note";

function validNote(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "cor-1",
    storyId: "story-rbi-rate-hold",
    correctedAt: "2026-08-13T18:40:00+05:30",
    editionVersion: 2,
    summary:
      "An earlier version said the repo rate was cut. The rate was held at 6.5%.",
    ...overrides,
  };
}

describe("correctionNoteSchema", () => {
  it("accepts a correction without optional detail", () => {
    expect(correctionNoteSchema.safeParse(validNote()).success).toBe(true);
  });

  it("accepts a correction with detail", () => {
    expect(
      correctionNoteSchema.safeParse(
        validNote({ detail: "The figure came from the previous meeting." }),
      ).success,
    ).toBe(true);
  });

  it("requires a summary of what was wrong", () => {
    // A correction that records only that something changed is the silent
    // factual rewrite section 46 forbids.
    const withoutSummary = validNote();
    delete withoutSummary["summary"];
    expect(correctionNoteSchema.safeParse(withoutSummary).success).toBe(false);
    expect(
      correctionNoteSchema.safeParse(validNote({ summary: "   " })).success,
    ).toBe(false);
  });

  it("rejects a correction claiming to be the first version", () => {
    // Version 1 is the original publication. A correction at version 1 asserts
    // the error was never published, which erases the evidence section 46
    // requires be kept.
    expect(
      correctionNoteSchema.safeParse(validNote({ editionVersion: 1 })).success,
    ).toBe(false);
  });

  it("requires a timestamp", () => {
    const undated = validNote();
    delete undated["correctedAt"];
    expect(correctionNoteSchema.safeParse(undated).success).toBe(false);
  });
});
