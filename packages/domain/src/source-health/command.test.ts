import { describe, expect, it } from "vitest";
import { parseFetchSourcesCommand } from "./command";

describe("parseFetchSourcesCommand", () => {
  it("parses empty args with defaults", () => {
    const parsed = parseFetchSourcesCommand([]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.json).toBe(false);
      expect(parsed.markdown).toBe(false);
      expect(parsed.summaryPath).toBeNull();
      expect(parsed.paths).toEqual([]);
    }
  });

  it("parses --json flag", () => {
    const parsed = parseFetchSourcesCommand(["--json"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.json).toBe(true);
      expect(parsed.markdown).toBe(false);
    }
  });

  it("parses --markdown flag", () => {
    const parsed = parseFetchSourcesCommand(["--markdown"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.json).toBe(false);
      expect(parsed.markdown).toBe(true);
    }
  });

  it("parses --summary flag without path", () => {
    const parsed = parseFetchSourcesCommand(["--summary"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.summaryPath).toBe("");
    }
  });

  it("parses --summary flag with positional path", () => {
    const parsed = parseFetchSourcesCommand(["--summary", "report.md"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.summaryPath).toBe("report.md");
    }
  });

  it("parses --summary=path syntax", () => {
    const parsed = parseFetchSourcesCommand(["--summary=custom.md"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.summaryPath).toBe("custom.md");
    }
  });

  it("parses paths along with flags", () => {
    const parsed = parseFetchSourcesCommand([
      "--json",
      "content/sources.yml",
      "custom/sources.yml",
    ]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.json).toBe(true);
      expect(parsed.paths).toEqual([
        "content/sources.yml",
        "custom/sources.yml",
      ]);
    }
  });

  it("rejects unknown options", () => {
    const parsed = parseFetchSourcesCommand(["--invalid-opt"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("unknown option: --invalid-opt");
    }
  });
});
