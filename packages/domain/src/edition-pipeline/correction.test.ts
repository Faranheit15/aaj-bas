import { describe, expect, it } from "vitest";
import { validEdition } from "@aaj-bas/test-fixtures";
import { validateEdition } from "../edition-validation";
import { applyEditionCorrection } from "./correction";

describe("Correction workflow domain logic (AB-704)", () => {
  function getBaseEdition() {
    const edition = validEdition();
    return {
      ...edition,
      date: "2026-08-29",
      publishedAt: "2026-08-29T06:00:00.000Z",
      updatedAt: "2026-08-29T06:00:00.000Z",
    };
  }

  it("applies a valid additive correction and increments editionVersion to 2", () => {
    const baseEdition = getBaseEdition();
    const targetStoryId = baseEdition.stories[0]?.id ?? "story-0";
    const correctionTimestamp = "2026-08-29T10:00:00.000Z";

    const result = applyEditionCorrection({
      edition: baseEdition,
      storyId: targetStoryId,
      summary:
        "Corrected the monetary figure in paragraph 1 from 500 cr to 600 cr.",
      detail:
        "Official clarification issued by the ministry updated the figure.",
      updatedStoryFields: {
        whatChanged: [
          "First paragraph with a corrected factual statement (600 cr).",
        ],
      },
      timestamp: correctionTimestamp,
    });

    expect(result.edition.editionVersion).toBe(2);
    expect(result.edition.status).toBe("corrected");
    expect(result.edition.updatedAt).toBe(correctionTimestamp);
    expect(result.edition.correctionNotes).toHaveLength(1);
    expect(result.correctionNote.editionVersion).toBe(2);
    expect(result.correctionNote.storyId).toBe(targetStoryId);
    expect(result.edition.stories[0]?.updatedAt).toBe(correctionTimestamp);
    expect(result.edition.stories[0]?.whatChanged[0]).toContain("600 cr");

    // Must satisfy domain validation rules
    const validation = validateEdition({
      file: "content/editions/2026-08-29.json",
      text: JSON.stringify(result.edition, null, 2),
    });

    const blocking = validation.findings.filter(
      (f) => f.severity === "blocking",
    );
    expect(blocking).toEqual([]);
  });

  it("supports chaining multiple additive corrections", () => {
    const baseEdition = getBaseEdition();
    const targetStoryId = baseEdition.stories[0]?.id ?? "story-0";

    const time1 = "2026-08-29T08:00:00.000Z";
    const first = applyEditionCorrection({
      edition: baseEdition,
      storyId: targetStoryId,
      summary: "First correction note for story 0.",
      timestamp: time1,
    });

    const time2 = "2026-08-29T12:00:00.000Z";
    const second = applyEditionCorrection({
      edition: first.edition,
      storyId: targetStoryId,
      summary: "Second correction note updating the minister title.",
      timestamp: time2,
    });

    expect(second.edition.editionVersion).toBe(3);
    expect(second.edition.correctionNotes).toHaveLength(2);
    expect(second.edition.correctionNotes[0]?.editionVersion).toBe(2);
    expect(second.edition.correctionNotes[1]?.editionVersion).toBe(3);
    expect(second.edition.updatedAt).toBe(time2);
  });

  it("throws when storyId does not exist", () => {
    const baseEdition = getBaseEdition();
    expect(() =>
      applyEditionCorrection({
        edition: baseEdition,
        storyId: "non-existent-story",
        summary: "Invalid correction attempting to update missing story.",
      }),
    ).toThrow("Story with ID 'non-existent-story' not found");
  });
});
