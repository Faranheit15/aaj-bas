/**
 * Whether a built pointer is one the reader can read.
 *
 * The gate this backs is the last thing between a build and a deployment. Its
 * failure mode is worth stating plainly: the staged editions can each be
 * perfect and the site still be unreadable on every route, because every reader
 * asks for `latest.json` first. A corrupt one is a site-wide outage produced by
 * a green build.
 *
 * `planStaging` produces valid indexes, so these cases are what a build breaks
 * into on the way to disk -- a truncated write, a hand edit, a version bump
 * that reached the writer and not the reader.
 */
import { describe, expect, it } from "vitest";
import { validateStagedIndex } from "./staged-index";

function serialise(index: unknown): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

const published = {
  schemaVersion: 1,
  contentSet: "published",
  latest: "2026-07-21",
  editions: ["2026-07-21", "2026-07-20"],
};

describe("a pointer the reader can read", () => {
  it("accepts the document a build writes", () => {
    const checked = validateStagedIndex(serialise(published));

    expect(checked).toEqual({ ok: true, index: published });
  });

  it("accepts a build that staged no edition at all", () => {
    // The state every deploy is in until the first edition is published. It
    // must pass: the reader renders its no-edition state from it, and a gate
    // that failed here would block the first deployment of the product.
    const empty = {
      schemaVersion: 1,
      contentSet: "published",
      latest: null,
      editions: [],
    };

    const checked = validateStagedIndex(serialise(empty));

    expect(checked).toEqual({ ok: true, index: empty });
  });
});

describe("a pointer the reader would refuse", () => {
  it("refuses a truncated file, saying it is not JSON", () => {
    const checked = validateStagedIndex('{"schemaVersion": 1, "conte');

    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected a refusal");
    expect(checked.problems).toHaveLength(1);
    expect(checked.problems[0]).toContain("not JSON");
  });

  it("refuses an empty file", () => {
    const checked = validateStagedIndex("");

    expect(checked.ok).toBe(false);
  });

  it("refuses a version the reader does not understand", () => {
    // The exact document the reader refuses at runtime. A build that shipped
    // it would serve "We could not display this edition." site-wide.
    const checked = validateStagedIndex(serialise({ schemaVersion: 2 }));

    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected a refusal");
    expect(checked.problems.join("\n")).toContain("schemaVersion");
  });

  it("refuses a pointer whose fields are missing", () => {
    const checked = validateStagedIndex(
      serialise({ schemaVersion: 1, contentSet: "published" }),
    );

    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected a refusal");
    expect(checked.problems.join("\n")).toContain("latest");
    expect(checked.problems.join("\n")).toContain("editions");
  });

  it("refuses a pointer that contradicts the editions it lists", () => {
    // Not a shape error: every field is well typed, and the document still
    // tells the reader that the newest edition is one it does not list first.
    const checked = validateStagedIndex(
      serialise({ ...published, latest: "2026-07-20" }),
    );

    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected a refusal");
    expect(checked.problems.join("\n")).toContain("latest");
  });

  it("refuses an edition document served in place of the pointer", () => {
    const checked = validateStagedIndex(
      serialise({ schemaVersion: 1, date: "2026-07-21", stories: [] }),
    );

    expect(checked.ok).toBe(false);
  });

  it("names every problem rather than only the first", () => {
    const checked = validateStagedIndex(serialise({}));

    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("expected a refusal");
    expect(checked.problems.length).toBeGreaterThan(1);
  });
});
