/**
 * The command's own argument surface.
 *
 * These tests exist because a review added a working `--force` to this command
 * and `bun run check` exited 0. The flag stripped every blocking finding, the
 * file's own header says such a flag must never exist, and no lint rule, type
 * check, hook or test objected. The gap was not that the rule was weak; it was
 * that `scripts/` has no test runner, so the argument surface was unreachable.
 */

import { describe, expect, it } from "vitest";
import { parseSourcesCommand } from "./command";

describe("the source-registry command's arguments", () => {
  it("defaults to the text report over the default registry", () => {
    const parsed = parseSourcesCommand([]);

    expect(parsed).toEqual({ ok: true, json: false, paths: [] });
  });

  it("accepts the one option it has", () => {
    expect(parseSourcesCommand(["--json"])).toEqual({
      ok: true,
      json: true,
      paths: [],
    });
  });

  it("refuses a flag that would silence a finding", () => {
    /*
      The test this command was missing. `--force` is not merely unimplemented
      -- it must be REFUSED, because an unrecognised flag that was ignored
      would run a different check from the one that was asked for and then
      report success. A registry records terms reviews, so a silenced blocking
      finding there is a fabricated permission that nothing downstream can
      detect.
    */
    for (const flag of [
      "--force",
      "--ignore-rule",
      "--ignore-rule=url/no-address-literal",
      "--no-verify",
      "--allow-private-hosts",
    ]) {
      expect(parseSourcesCommand([flag]), flag).toEqual({
        ok: false,
        message: `unknown option: ${flag}`,
      });
    }
  });

  it("refuses a misspelling rather than reading it as an absent flag", () => {
    // `--jsn` must not be mistaken for "no --json"; it must be refused, or a
    // typo silently changes which report a workflow captures.
    expect(parseSourcesCommand(["--jsn"])).toEqual({
      ok: false,
      message: "unknown option: --jsn",
    });
  });

  it("refuses the unknown flag even when a valid one precedes it", () => {
    // Kills a parser that returns as soon as it has seen something it knows.
    expect(parseSourcesCommand(["--json", "--force"])).toEqual({
      ok: false,
      message: "unknown option: --force",
    });
  });

  it("keeps named registries in the order they were given", () => {
    // Order is the report's order, and a report whose entries move between
    // runs cannot be diffed.
    expect(
      parseSourcesCommand(["content/b.yml", "--json", "content/a.yml"]),
    ).toEqual({
      ok: true,
      json: true,
      paths: ["content/b.yml", "content/a.yml"],
    });
  });

  it("treats a bare dash as a path rather than an option", () => {
    // Not special-cased as stdin: this command reads files, and silently
    // reading standard input for an argument nobody documented would be a
    // second, undocumented mode.
    expect(parseSourcesCommand(["-"])).toEqual({
      ok: false,
      message: "unknown option: -",
    });
  });
});
