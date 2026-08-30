import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  contentHashFor,
  deduplicateFeedItems,
  normalizeFeedDate,
  normalizeFeedItem,
  normalizeFeedItems,
  sanitizeHtmlToText,
} from "./normalize";

describe("sanitizeHtmlToText", () => {
  it("removes markup and executable elements while preserving readable text", () => {
    expect(
      sanitizeHtmlToText(
        "<p>India&nbsp;&amp; the world</p><script>alert('drop')</script><p>Next<br>item</p>",
      ),
    ).toBe("India & the world\nNext\nitem");
  });

  it("decodes numeric entities after tags have been removed", () => {
    expect(
      sanitizeHtmlToText("<p>&#x1F4F0; &lt;strong&gt;brief&lt;/strong&gt;</p>"),
    ).toBe("📰 <strong>brief</strong>");
  });

  it("does not treat a comparison sign in plain text as a tag", () => {
    expect(sanitizeHtmlToText("Growth was < 5% and rising.")).toBe(
      "Growth was < 5% and rising.",
    );
  });
});

describe("canonicalizeUrl", () => {
  it("removes campaign parameters and fragments but keeps legitimate parameters", () => {
    expect(
      canonicalizeUrl(
        "HTTPS://Example.com:443/story?utm_source=mail&id=42&lang=en&gclid=abc#read",
      ),
    ).toBe("https://example.com/story?id=42&lang=en");
  });

  it("does not remove unknown query parameters or accept unsafe schemes", () => {
    expect(
      canonicalizeUrl("https://example.com/story?ref=homepage&item=7"),
    ).toBe("https://example.com/story?ref=homepage&item=7");
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("https://user:pass@example.com/story")).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
  });

  it("decodes feed entities before canonicalizing a link", () => {
    expect(
      canonicalizeUrl("https://example.com/story?id=1&amp;utm_source=rss"),
    ).toBe("https://example.com/story?id=1");
  });
});

describe("normalizeFeedDate", () => {
  it("normalizes explicit offsets to UTC", () => {
    expect(normalizeFeedDate("Wed, 19 Aug 2026 08:00:00 +0530")).toBe(
      "2026-08-19T02:30:00.000Z",
    );
    expect(normalizeFeedDate("2026-08-19T08:00:00Z")).toBe(
      "2026-08-19T08:00:00.000Z",
    );
  });

  it("handles ISO dates deterministically and rejects invalid or ambiguous values", () => {
    expect(normalizeFeedDate("2026-08-19")).toBe("2026-08-19T00:00:00.000Z");
    expect(normalizeFeedDate("2026-08-19T08:00:00")).toBe(
      "2026-08-19T08:00:00.000Z",
    );
    expect(normalizeFeedDate("2026-02-30")).toBeNull();
    expect(normalizeFeedDate("Wed, 19 Aug 2026 08:00:00")).toBeNull();
    expect(normalizeFeedDate("not a date")).toBeNull();
    expect(normalizeFeedDate(null)).toBeNull();
  });
});

describe("normalizeFeedItem", () => {
  it("sanitizes, canonicalizes, hashes, and bounds a source item", () => {
    const item = normalizeFeedItem(
      "desk-daily",
      {
        title: "<b>Markets</b>",
        author: "<em>Desk Author</em>",
        description: "<p>123456789😀extra</p>",
        link: "https://example.com/story?utm_medium=rss&id=7",
        publishedAt: "2026-08-19T08:00:00+05:30",
      },
      { maxDescriptionCharacters: 10 },
    );

    expect(item).toMatchObject({
      sourceId: "desk-daily",
      guid: "https://example.com/story?id=7",
      title: "Markets",
      author: "Desk Author",
      description: "123456789😀",
      url: "https://example.com/story?id=7",
      publishedAt: "2026-08-19T02:30:00.000Z",
      updatedAt: null,
    });
    expect(item.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("keeps an explicit GUID after trimming and canonicalizes a URL GUID", () => {
    expect(
      normalizeFeedItem("desk-daily", {
        guid: " https://example.com/story?utm_source=rss ",
        title: "Headline",
      }).guid,
    ).toBe("https://example.com/story");
  });

  it("returns the same hash for the same normalized content", () => {
    const first = normalizeFeedItem("desk-daily", {
      title: "A headline",
      description: "A description",
      link: "https://example.com/story?utm_source=one",
    });
    const second = normalizeFeedItem("other-source", {
      title: " A headline ",
      description: "A   description",
      link: "https://example.com/story?utm_source=two",
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(contentHashFor("same")).toBe(contentHashFor("same"));
    expect(contentHashFor("same")).not.toBe(contentHashFor("different"));
  });
});

describe("normalizeFeedItems and deduplicateFeedItems", () => {
  it("collapses same-source duplicates by GUID, URL, or content hash", () => {
    const items = normalizeFeedItems("desk-daily", [
      {
        guid: "one",
        title: "First",
        link: "https://example.com/one",
      },
      {
        guid: "one",
        title: "First revised description",
        link: "https://example.com/different",
      },
      {
        guid: "two",
        title: "Second",
        link: "https://example.com/two?utm_source=rss",
      },
      {
        guid: "three",
        title: "Second",
        link: "https://example.com/two",
      },
      {
        title: "Third",
        description: "same content",
        link: "https://example.com/three",
      },
      {
        title: "Third",
        description: "same content",
        link: "https://example.com/three?utm_campaign=mail",
      },
    ]);

    expect(items.map((item) => item.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(items[0]?.description).toBe("");
  });

  it("keeps identical identities from different sources", () => {
    const item = normalizeFeedItem("desk-daily", {
      guid: "same",
      title: "Headline",
    });
    const other = { ...item, sourceId: "other-source" };

    expect(deduplicateFeedItems([item, other])).toHaveLength(2);
  });

  it("uses normalized content as the fallback identity without a URL", () => {
    const items = normalizeFeedItems("desk-daily", [
      { title: "Headline", description: "A short brief" },
      { title: " Headline ", description: "A   short brief" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.guid).toMatch(/^content-[0-9a-f]{16}$/);
  });
});
