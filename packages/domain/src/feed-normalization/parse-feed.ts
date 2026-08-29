/**
 * Safe, zero-dependency parser for RSS 2.0, Atom, and JSON feeds (AB-402, AB-403).
 *
 * Converts raw feed bytes or text into RawFeedItem[] suitable for normalization.
 */

import type { RawFeedItem } from "./normalize";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractTagContent(xml: string, tagName: string): string | null {
  // Support both <tag>value</tag> and <tag><![CDATA[value]]></tag>
  const regex = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tagName}>`,
    "i",
  );
  const match = regex.exec(xml);
  if (!match?.[1]) {
    return null;
  }
  let content = match[1].trim();
  const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(content);
  if (cdataMatch?.[1]) {
    content = cdataMatch[1].trim();
  }
  return decodeEntities(content);
}

function extractAtomLinkHref(entryXml: string): string | null {
  // Look for <link rel="alternate" href="..." /> or <link href="..." />
  const alternateMatch =
    /<link(?:\s+[^>]*?)?(?:\s+rel=["']alternate["'])(?:\s+[^>]*?)?\s+href=["']([^"']+)["']/i.exec(
      entryXml,
    );
  if (alternateMatch?.[1]) {
    return decodeEntities(alternateMatch[1].trim());
  }

  const genericMatch = /<link(?:\s+[^>]*?)?\s+href=["']([^"']+)["']/i.exec(
    entryXml,
  );
  if (genericMatch?.[1]) {
    return decodeEntities(genericMatch[1].trim());
  }

  return extractTagContent(entryXml, "link");
}

function parseRssXml(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  const itemRegex = /<item(?:\s+[^>]*)?>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null = itemRegex.exec(xml);

  while (match !== null) {
    const itemXml = match[1] ?? "";
    const title = extractTagContent(itemXml, "title");
    const link = extractTagContent(itemXml, "link");
    const guid = extractTagContent(itemXml, "guid") ?? link;
    const description =
      extractTagContent(itemXml, "description") ??
      extractTagContent(itemXml, "encoded");
    const publishedAt =
      extractTagContent(itemXml, "pubDate") ??
      extractTagContent(itemXml, "date");

    items.push({
      guid,
      title,
      description,
      link,
      publishedAt,
    });

    match = itemRegex.exec(xml);
  }

  return items;
}

function parseAtomXml(xml: string): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  const entryRegex = /<entry(?:\s+[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null = entryRegex.exec(xml);

  while (match !== null) {
    const entryXml = match[1] ?? "";
    const title = extractTagContent(entryXml, "title");
    const link = extractAtomLinkHref(entryXml);
    const guid = extractTagContent(entryXml, "id") ?? link;
    const description =
      extractTagContent(entryXml, "summary") ??
      extractTagContent(entryXml, "content");
    const publishedAt =
      extractTagContent(entryXml, "published") ??
      extractTagContent(entryXml, "updated");
    const updatedAt = extractTagContent(entryXml, "updated");

    items.push({
      guid,
      title,
      description,
      link,
      publishedAt,
      updatedAt,
    });

    match = entryRegex.exec(xml);
  }

  return items;
}

function parseJsonFeed(jsonString: string): RawFeedItem[] {
  try {
    const parsed = JSON.parse(jsonString) as {
      items?: Array<{
        id?: string;
        title?: string;
        summary?: string;
        content_text?: string;
        content_html?: string;
        url?: string;
        date_published?: string;
        date_modified?: string;
      }>;
    };

    if (!Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items.map((item) => ({
      guid: item.id ?? item.url ?? null,
      title: item.title ?? null,
      description:
        item.summary ?? item.content_text ?? item.content_html ?? null,
      link: item.url ?? null,
      publishedAt: item.date_published ?? null,
      updatedAt: item.date_modified ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Parses raw feed body text or bytes into RawFeedItem[] records.
 */
export function parseRawFeed(
  body: string | Uint8Array,
  contentType = "",
): RawFeedItem[] {
  const text =
    typeof body === "string" ? body : new TextDecoder("utf-8").decode(body);

  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // JSON Feed detection
  if (
    contentType.includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.includes('"version": "https://jsonfeed.org/')
  ) {
    return parseJsonFeed(trimmed);
  }

  // Atom Feed detection
  if (
    trimmed.includes("<feed") ||
    contentType.includes("atom") ||
    trimmed.includes('xmlns="http://www.w3.org/2005/Atom"')
  ) {
    return parseAtomXml(trimmed);
  }

  // RSS 2.0 / RSS 1.0 fallback
  return parseRssXml(trimmed);
}
