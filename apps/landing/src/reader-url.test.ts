import { describe, expect, it } from "vitest";
import { resolveReaderUrl } from "./reader-url";

describe("resolveReaderUrl", () => {
  it("uses a configured reader URL", () => {
    expect(resolveReaderUrl("https://aaj-bas-web.pages.dev")).toBe(
      "https://aaj-bas-web.pages.dev",
    );
  });

  it("falls back when the variable is unset", () => {
    expect(resolveReaderUrl(undefined)).toBe("/");
  });

  it("treats an empty or whitespace-only value as unset", () => {
    expect(resolveReaderUrl("")).toBe("/");
    expect(resolveReaderUrl("   ")).toBe("/");
  });

  it("trims surrounding whitespace from a configured URL", () => {
    expect(resolveReaderUrl("  https://example.test  ")).toBe(
      "https://example.test",
    );
  });
});
