import { describe, expect, it } from "vitest";
import { sourceReferenceSchema } from "./source-reference";

// Overrides are deliberately untyped: several tests pass values the contract
// must reject, which a Partial<SourceReference> would refuse to express.
function validSource(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "src-the-hindu-rbi",
    publisher: "The Hindu",
    title: "RBI holds repo rate at 6.5%",
    url: "https://www.thehindu.com/business/rbi-holds-repo-rate/article1.ece",
    sourceType: "publisher",
    publishedAt: "2026-08-13T09:15:00+05:30",
    ...overrides,
  };
}

describe("sourceReferenceSchema", () => {
  it("accepts a complete source", () => {
    expect(sourceReferenceSchema.safeParse(validSource()).success).toBe(true);
  });

  it("accepts every declared source type", () => {
    for (const sourceType of ["publisher", "primary", "research", "official"]) {
      expect(
        sourceReferenceSchema.safeParse(validSource({ sourceType })).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown source type", () => {
    expect(
      sourceReferenceSchema.safeParse(validSource({ sourceType: "blog" }))
        .success,
    ).toBe(false);
  });

  it("rejects non-http protocols", () => {
    // A source registry that accepts these is the first half of the SSRF
    // problem section 19 exists to prevent, and a `javascript:` URL reaching an
    // anchor is the second half.
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ftp://example.com/feed",
      "data:text/html,<script>",
    ]) {
      expect(
        sourceReferenceSchema.safeParse(validSource({ url })).success,
      ).toBe(false);
    }
  });

  it("accepts plain http as well as https", () => {
    expect(
      sourceReferenceSchema.safeParse(
        validSource({ url: "http://example.gov.in/release" }),
      ).success,
    ).toBe(true);
  });

  it("rejects a relative or malformed URL", () => {
    expect(
      sourceReferenceSchema.safeParse(validSource({ url: "/article/1" }))
        .success,
    ).toBe(false);
    expect(
      sourceReferenceSchema.safeParse(validSource({ url: "not a url" }))
        .success,
    ).toBe(false);
  });

  it("requires every field", () => {
    for (const field of [
      "id",
      "publisher",
      "title",
      "url",
      "sourceType",
      "publishedAt",
    ]) {
      const source = validSource();
      delete source[field];
      expect(sourceReferenceSchema.safeParse(source).success).toBe(false);
    }
  });
});
