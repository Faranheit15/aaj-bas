import { describe, expect, it } from "vitest";
import { parseRawFeed } from "./parse-feed";

describe("parseRawFeed (AB-402, AB-403)", () => {
  it("parses standard RSS 2.0 feed with CDATA", () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Publisher</title>
    <link>https://example.com</link>
    <item>
      <title><![CDATA[Headline with &amp; entity]]></title>
      <link>https://example.com/story-1</link>
      <guid isPermaLink="false">custom-guid-1</guid>
      <pubDate>Mon, 29 Aug 2026 06:00:00 GMT</pubDate>
      <description><![CDATA[<p>Paragraph text description &lt;here&gt;</p>]]></description>
    </item>
  </channel>
</rss>`;

    const items = parseRawFeed(rssXml, "application/rss+xml");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Headline with & entity");
    expect(items[0]?.link).toBe("https://example.com/story-1");
    expect(items[0]?.guid).toBe("custom-guid-1");
    expect(items[0]?.publishedAt).toBe("Mon, 29 Aug 2026 06:00:00 GMT");
    expect(items[0]?.description).toBe(
      "<p>Paragraph text description <here></p>",
    );
  });

  it("parses Atom XML feed with link href", () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry Title</title>
    <id>urn:uuid:12345</id>
    <link rel="alternate" href="https://example.com/atom-1" />
    <published>2026-08-29T06:30:00Z</published>
    <summary>Atom entry summary text.</summary>
  </entry>
</feed>`;

    const items = parseRawFeed(atomXml, "application/atom+xml");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Atom Entry Title");
    expect(items[0]?.link).toBe("https://example.com/atom-1");
    expect(items[0]?.guid).toBe("urn:uuid:12345");
    expect(items[0]?.publishedAt).toBe("2026-08-29T06:30:00Z");
    expect(items[0]?.description).toBe("Atom entry summary text.");
  });

  it("parses JSON Feed format", () => {
    const jsonFeed = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "My JSON Feed",
      items: [
        {
          id: "json-item-1",
          url: "https://example.com/json-1",
          title: "JSON Story",
          summary: "Summary in JSON feed",
          date_published: "2026-08-29T07:00:00Z",
        },
      ],
    });

    const items = parseRawFeed(jsonFeed, "application/json");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("JSON Story");
    expect(items[0]?.link).toBe("https://example.com/json-1");
    expect(items[0]?.guid).toBe("json-item-1");
    expect(items[0]?.description).toBe("Summary in JSON feed");
    expect(items[0]?.publishedAt).toBe("2026-08-29T07:00:00Z");
  });

  it("handles empty or invalid inputs gracefully", () => {
    expect(parseRawFeed("")).toEqual([]);
    expect(parseRawFeed("   ")).toEqual([]);
    expect(parseRawFeed("not valid xml or json")).toEqual([]);
  });
});
