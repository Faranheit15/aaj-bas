import type { Story } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import { reportIssueHref } from "./report-issue";

const EDITION_DATE = "2026-08-13";

function sampleStory(): Story {
  const [story] = validEdition().stories;
  if (story === undefined) {
    throw new Error("the fixture edition has no stories");
  }
  return story;
}

function reportUrl(story: Story = sampleStory()): URL {
  return new URL(reportIssueHref(EDITION_DATE, story));
}

describe("reportIssueHref", () => {
  it("points at the public repository's new-issue form", () => {
    const url = reportUrl();

    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/Faranheit15/aaj-bas/issues/new");
  });

  it("titles the issue with the story slug", () => {
    expect(reportUrl().searchParams.get("title")).toBe(
      "Story report: sample-story-0",
    );
  });

  it("names the edition and the story so a maintainer can find them", () => {
    const body = reportUrl().searchParams.get("body") ?? "";

    expect(body).toContain(EDITION_DATE);
    expect(body).toContain("story-0");
  });

  it("offers PRD 6.2's four categories and a free-text prompt", () => {
    const body = reportUrl().searchParams.get("body") ?? "";

    expect(body).toContain("- [ ] Factual error");
    expect(body).toContain("- [ ] Misleading wording");
    expect(body).toContain("- [ ] Broken source");
    expect(body).toContain("- [ ] Other");
    expect(body).toContain("What is wrong?");
  });

  it("carries nothing about the reader", () => {
    // Section 23 collects nothing by default, and a prefilled form is exactly
    // where a visit time or a user agent would look harmless.
    const parameters = [...reportUrl().searchParams.keys()].sort();

    expect(parameters).toEqual(["body", "title"]);
  });

  it("does not prefill a label", () => {
    // GitHub answers a prefilled label that does not exist on the repository
    // with a 404, which would break the link rather than mislabel the issue.
    expect(reportUrl().searchParams.has("labels")).toBe(false);
  });

  it("encodes a slug carrying characters that would otherwise split the query", () => {
    const story = { ...sampleStory(), slug: "rates & policy?draft=1" };

    const href = reportIssueHref(EDITION_DATE, story);

    expect(href).not.toContain("rates & policy");
    expect(new URL(href).searchParams.get("title")).toBe(
      "Story report: rates & policy?draft=1",
    );
    expect([...new URL(href).searchParams.keys()].sort()).toEqual([
      "body",
      "title",
    ]);
  });
});
