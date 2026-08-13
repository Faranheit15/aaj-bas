import { describe, expect, it } from "vitest";
import { editionJsonSchema } from "./json-schema";

describe("editionJsonSchema", () => {
  it("produces a JSON Schema document for an edition", () => {
    const schema = editionJsonSchema();

    expect(schema["$schema"]).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(schema["type"]).toBe("object");
  });

  it("describes every top-level field of the contract", () => {
    const properties = editionJsonSchema()["properties"] as Record<
      string,
      unknown
    >;

    expect(Object.keys(properties).sort()).toEqual([
      "coreStoryIds",
      "correctionNotes",
      "date",
      "editionVersion",
      "estimatedMinutes",
      "interestPools",
      "publishedAt",
      "schemaVersion",
      "sources",
      "status",
      "stories",
      "updatedAt",
    ]);
  });

  it("keeps the date formats distinguishable", () => {
    const properties = editionJsonSchema()["properties"] as Record<
      string,
      Record<string, unknown>
    >;

    expect(properties["date"]?.["format"]).toBe("date");
    expect(properties["publishedAt"]?.["format"]).toBe("date-time");
  });

  it("survives generation despite the cross-field rules", () => {
    // JSON Schema cannot express superRefine. Zod drops those rules rather than
    // throwing, which is the behaviour this export depends on -- if a future
    // Zod threw instead, the contract would stop being publishable at all.
    expect(() => editionJsonSchema()).not.toThrow();
  });

  it("does not carry the referential-integrity rules", () => {
    // Recorded deliberately. Anything validating only against this document
    // will accept editions the product must reject: a story citing a missing
    // source, a core of the wrong size, a pool that contradicts its topic.
    // editionSchema stays the authority.
    const serialised = JSON.stringify(editionJsonSchema());

    expect(serialised).not.toContain("is not in sources");
    expect(serialised).not.toContain("core stories, found");
  });
});
