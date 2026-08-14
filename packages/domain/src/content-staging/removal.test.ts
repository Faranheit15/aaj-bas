/**
 * What a build deletes before it writes.
 *
 * These are the two claims `scripts/stage-content.ts` makes about a directory
 * inside the source tree: it clears what it will not write, and it clears
 * nothing else. The first is what stops sample data reaching a reader; the
 * second is what stops a staging run deleting a file nobody asked it to. Both
 * were previously only observable by running the script against a real
 * directory, which is why the `*.json` sweep below could be wrong for as long
 * as it was.
 */
import { describe, expect, it } from "vitest";
import { planRemoval } from "./removal";

function keep(...names: string[]): ReadonlySet<string> {
  return new Set(names);
}

describe("what a staging run deletes", () => {
  it("deletes a staged edition the run will not write again", () => {
    // The case the guarantee exists for: yesterday's sample edition, left in a
    // source-tree directory that `vite build` does not clear.
    const removal = planRemoval(
      ["latest.json", "editions/2026-07-21.json", "editions/2026-07-20.json"],
      keep("latest.json", "editions/2026-07-21.json"),
    );

    expect(removal.remove).toEqual(["editions/2026-07-20.json"]);
    expect(removal.refused).toEqual([]);
  });

  it("keeps a file the run is about to write", () => {
    // Deleting and rewriting is the same end state, but only if the write
    // happens. A file named for both keeps its content if the run fails first.
    const removal = planRemoval(
      ["latest.json", "editions/2026-07-21.json"],
      keep("latest.json", "editions/2026-07-21.json"),
    );

    expect(removal.remove).toEqual([]);
  });

  it("deletes residue that is not an edition", () => {
    // The sweep used to glob `*.json`, so everything here survived it and was
    // copied into `dist/` on every build from then on.
    const removal = planRemoval(
      [
        "latest.json",
        "editions/2026-07-21.json",
        "editions/2026-07-20.json.bak",
        "editions/.2026-07-21.json.swp",
        "notes.txt",
        "editions/README.md",
      ],
      keep("latest.json", "editions/2026-07-21.json"),
    );

    expect(removal.remove).toEqual([
      "editions/.2026-07-21.json.swp",
      "editions/2026-07-20.json.bak",
      "editions/README.md",
      "notes.txt",
    ]);
  });

  it("deletes everything when the run stages nothing at all", () => {
    // A build with no publishable edition still writes the pointer, so the
    // previous build's editions have to go: leaving them would deploy editions
    // the index does not name.
    const removal = planRemoval(
      ["latest.json", "editions/2026-07-21.json"],
      keep("latest.json"),
    );

    expect(removal.remove).toEqual(["editions/2026-07-21.json"]);
  });

  it("deletes nothing when the directory is empty", () => {
    expect(planRemoval([], keep("latest.json"))).toEqual({
      remove: [],
      refused: [],
    });
  });

  it("names each file once, in a stable order", () => {
    const removal = planRemoval(
      ["b.json", "a.json", "b.json"],
      keep("latest.json"),
    );

    expect(removal.remove).toEqual(["a.json", "b.json"]);
  });
});

describe("what a staging run refuses to delete", () => {
  it.each([
    ["an absolute POSIX path", "/etc/passwd"],
    ["an absolute Windows path", "C:/Windows/system32/drivers/etc/hosts"],
    ["a path climbing out of the staging directory", "../../../.env"],
    ["a traversal buried mid-path", "editions/../../../src/main.tsx"],
    ["a bare traversal segment", ".."],
    ["a current-directory segment", "./latest.json"],
    ["an empty name", ""],
    ["a name that is only a separator", "/"],
    ["a doubled separator", "editions//2026-07-20.json"],
    ["a backslash separator", "editions\\2026-07-20.json"],
  ])("refuses %s rather than deleting it", (_case, name) => {
    // Every name is joined onto `apps/web/public/content`, so a name that
    // escapes would delete a file outside it. Refused and reported, never
    // silently dropped: an unswept file is residue that will be deployed.
    const removal = planRemoval([name], keep("latest.json"));

    expect(removal.remove).toEqual([]);
    expect(removal.refused).toEqual([name]);
  });

  it("still deletes the safe names alongside an unsafe one", () => {
    const removal = planRemoval(
      ["editions/2026-07-20.json", "../../../.env"],
      keep("latest.json"),
    );

    expect(removal.remove).toEqual(["editions/2026-07-20.json"]);
    expect(removal.refused).toEqual(["../../../.env"]);
  });
});
