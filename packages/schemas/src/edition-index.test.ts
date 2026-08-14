import { describe, expect, it } from "vitest";
import { editionIndexSchema } from "./edition-index";

/**
 * The index is generated, never hand-written, so these tests are not guarding
 * against a typing editor. They guard against a generator that produces a
 * plausible-looking pointer the reader would then trust: an index that names an
 * edition it did not stage, or lists two days out of order, sends a reader to
 * the wrong day without anything failing loudly. Every case below is a shape a
 * buggy `planStaging` could plausibly emit.
 */
function index(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    contentSet: "published",
    latest: "2026-08-13",
    editions: ["2026-08-13", "2026-08-12"],
    ...overrides,
  };
}

function messages(result: {
  error?: { issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("editionIndexSchema", () => {
  it("accepts a published index", () => {
    const result = editionIndexSchema.safeParse(index());
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty index", () => {
    // The state the repository is in before the first real edition is
    // published. It is ordinary, not an error, and the reader renders its
    // no-edition state from it.
    const result = editionIndexSchema.safeParse(
      index({ latest: null, editions: [] }),
    );
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("accepts a sample content set", () => {
    // Present in both modes on purpose, so a development build can say plainly
    // that what it is showing is invented.
    const result = editionIndexSchema.safeParse(
      index({ contentSet: "sample" }),
    );
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("pins the schema version", () => {
    expect(
      editionIndexSchema.safeParse(index({ schemaVersion: 2 })).success,
    ).toBe(false);
  });

  it("rejects a duplicated edition date", () => {
    const result = editionIndexSchema.safeParse(
      index({ editions: ["2026-08-13", "2026-08-13"] }),
    );

    expect(result.success).toBe(false);
    expect(messages(result)).toContain("edition 2026-08-13 is listed twice");
  });

  it("rejects editions that are not newest first", () => {
    // The reader offers "the edition before this one" by position, so an
    // ascending list would hand back a later edition while calling it earlier.
    const result = editionIndexSchema.safeParse(
      index({ latest: "2026-08-12", editions: ["2026-08-12", "2026-08-13"] }),
    );

    expect(result.success).toBe(false);
    expect(messages(result)).toContain("editions must be listed newest first");
  });

  it("rejects a null latest alongside listed editions", () => {
    const result = editionIndexSchema.safeParse(index({ latest: null }));

    expect(result.success).toBe(false);
    expect(messages(result)).toContain(
      "latest is null but editions were listed",
    );
  });

  it("rejects a latest the index lists no edition for", () => {
    const result = editionIndexSchema.safeParse(index({ editions: [] }));

    expect(result.success).toBe(false);
    expect(messages(result)).toContain(
      "latest is 2026-08-13 but no editions were listed",
    );
  });

  it("rejects a latest that is not the newest edition listed", () => {
    // The failure the pointer exists to prevent: two answers to "what should I
    // show?" inside one document.
    const result = editionIndexSchema.safeParse(
      index({ latest: "2026-08-12" }),
    );

    expect(result.success).toBe(false);
    expect(messages(result)).toContain(
      "latest is 2026-08-12 but the newest edition listed is 2026-08-13",
    );
  });

  it("rejects a malformed edition date", () => {
    const result = editionIndexSchema.safeParse(
      index({ latest: "2026-08-32", editions: ["2026-08-32"] }),
    );

    expect(result.success).toBe(false);
  });
});
