import { describe, expect, it } from "vitest";
import { normalizeFeedItems } from "./normalize";
import { parseRawFeed } from "./parse-feed";

describe("parseRawFeed deterministic ingestion coverage (AB-402, AB-403)", () => {
  describe("RSS 2.0 Ingestion", () => {
    it("parses RSS 2.0 feed with multiple items, CDATA, encoded content, and entity references", () => {
      const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>National Tribune &amp; Gazette</title>
    <link>https://tribune.example.in</link>
    <item>
      <title><![CDATA[Cabinet Approves &quot;Green Energy&quot; Corridor &#x2014; Phase II]]></title>
      <link>https://tribune.example.in/news/green-energy-2026?utm_source=rss</link>
      <guid isPermaLink="false">tribune-ge-2026</guid>
      <dc:creator><![CDATA[RSS Author]]></dc:creator>
      <pubDate>Sat, 29 Aug 2026 06:30:00 GMT</pubDate>
      <description><![CDATA[<p>The Union Cabinet on Friday approved Phase II with a &#8377;12,000 crore outlay.</p>]]></description>
      <content:encoded><![CDATA[<p>Full text details with &lt;b&gt;markup&lt;/b&gt;.</p>]]></content:encoded>
    </item>
    <item>
      <title>Monsoon Rainfall Deficit Narrows to 3%</title>
      <link>https://tribune.example.in/news/monsoon-update</link>
      <!-- Missing explicit guid: should fall back to link -->
      <pubDate>Sat, 29 Aug 2026 07:00:00 GMT</pubDate>
      <description>Heavy rains across central and northwest regions reduced the seasonal rainfall deficit.</description>
    </item>
  </channel>
</rss>`;

      const items = parseRawFeed(rssXml, "application/rss+xml");
      expect(items).toHaveLength(2);

      expect(items[0]).toEqual({
        guid: "tribune-ge-2026",
        title: 'Cabinet Approves "Green Energy" Corridor &#x2014; Phase II',
        author: "RSS Author",
        description:
          "<p>The Union Cabinet on Friday approved Phase II with a &#8377;12,000 crore outlay.</p>",
        link: "https://tribune.example.in/news/green-energy-2026?utm_source=rss",
        publishedAt: "Sat, 29 Aug 2026 06:30:00 GMT",
      });

      expect(items[1]?.guid).toBe(
        "https://tribune.example.in/news/monsoon-update",
      );
      expect(items[1]?.title).toBe("Monsoon Rainfall Deficit Narrows to 3%");

      // Verify normalization of parsed items
      const normalized = normalizeFeedItems("desk-daily", items);
      expect(normalized).toHaveLength(2);
      expect(normalized[0]?.title).toBe(
        'Cabinet Approves "Green Energy" Corridor — Phase II',
      );
      expect(normalized[0]?.url).toBe(
        "https://tribune.example.in/news/green-energy-2026",
      );
      expect(normalized[0]?.publishedAt).toBe("2026-08-29T06:30:00.000Z");
    });
  });

  describe("Atom XML Ingestion", () => {
    it("parses Atom XML feed with link variations, updated timestamps, and content elements", () => {
      const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Economic Gazette Atom</title>
  <entry>
    <title type="html"><![CDATA[RBI Holds Repo Rate at 6.5% for Ninth Meeting]]></title>
    <id>tag:gazette.example.in,2026:rbi-policy-aug</id>
    <author><name>Atom Author</name></author>
    <link rel="alternate" type="text/html" href="https://gazette.example.in/rbi-rate" />
    <published>2026-08-29T05:00:00Z</published>
    <updated>2026-08-29T05:15:00Z</updated>
    <summary type="text">Monetary Policy Committee voted 4:2 to maintain the benchmark lending rate.</summary>
  </entry>
  <entry>
    <title>Direct Link Tag Entry</title>
    <id>tag:gazette.example.in,2026:direct-link</id>
    <link href="https://gazette.example.in/direct-story" />
    <updated>2026-08-29T06:00:00Z</updated>
    <content type="html"><![CDATA[<p>Content without explicit published tag.</p>]]></content>
  </entry>
</feed>`;

      const items = parseRawFeed(atomXml, "application/atom+xml");
      expect(items).toHaveLength(2);

      expect(items[0]?.title).toBe(
        "RBI Holds Repo Rate at 6.5% for Ninth Meeting",
      );
      expect(items[0]?.author).toBe("Atom Author");
      expect(items[0]?.link).toBe("https://gazette.example.in/rbi-rate");
      expect(items[0]?.guid).toBe("tag:gazette.example.in,2026:rbi-policy-aug");
      expect(items[0]?.publishedAt).toBe("2026-08-29T05:00:00Z");
      expect(items[0]?.updatedAt).toBe("2026-08-29T05:15:00Z");

      expect(items[1]?.link).toBe("https://gazette.example.in/direct-story");
      expect(items[1]?.publishedAt).toBe("2026-08-29T06:00:00Z"); // fallback from updated
      expect(items[1]?.description).toBe(
        "<p>Content without explicit published tag.</p>",
      );
    });
  });

  describe("JSON Feed 1.1 Ingestion", () => {
    it("parses JSON Feed 1.1 with summary/content fallback and missing IDs", () => {
      const jsonFeed = JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Tech Wire India",
        items: [
          {
            id: "tech-101",
            url: "https://techwire.example.in/stories/101",
            title: "Semiconductor Fab Breaks Ground in Gujarat",
            summary:
              "Construction commenced on India's first commercial silicon fab facility.",
            author: { name: "JSON Author" },
            date_published: "2026-08-29T04:00:00Z",
            date_modified: "2026-08-29T04:30:00Z",
          },
          {
            // Missing id: should fall back to url
            url: "https://techwire.example.in/stories/102",
            title: "Telecom Sector Achieves 95% 5G Population Coverage",
            content_text:
              "Indigenous telecom stack deployed across 600 districts.",
            date_published: "2026-08-29T05:00:00Z",
          },
        ],
      });

      const items = parseRawFeed(jsonFeed, "application/feed+json");
      expect(items).toHaveLength(2);

      expect(items[0]?.guid).toBe("tech-101");
      expect(items[0]?.title).toBe(
        "Semiconductor Fab Breaks Ground in Gujarat",
      );
      expect(items[0]?.description).toBe(
        "Construction commenced on India's first commercial silicon fab facility.",
      );
      expect(items[0]?.author).toBe("JSON Author");

      expect(items[1]?.guid).toBe("https://techwire.example.in/stories/102");
      expect(items[1]?.description).toBe(
        "Indigenous telecom stack deployed across 600 districts.",
      );
    });

    it("isolates malformed JSON or unparseable input safely", () => {
      expect(parseRawFeed("{{invalid-json", "application/json")).toEqual([]);
      expect(parseRawFeed(JSON.stringify({ title: "No items array" }))).toEqual(
        [],
      );
      expect(parseRawFeed(new Uint8Array([0x00, 0xff, 0xfe]))).toEqual([]);
    });
  });
});
