/**
 * Turn one parsed source item into the small, safe record the content
 * pipeline can pass to deduplication and clustering.
 *
 * This is deliberately a value-in/value-out boundary. Fetching and feed
 * parsing happen outside this package; this module never receives bytes from a
 * network and never emits HTML. The source id is supplied by the validated
 * registry rather than copied from an untrusted item.
 */

export interface RawFeedItem {
  readonly guid?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly link?: string | null;
  readonly publishedAt?: string | null;
  readonly updatedAt?: string | null;
}

/**
 * A normalized source item. `url` is either a canonical http(s) URL or null;
 * the other nullable fields use null instead of an omitted property so JSON
 * produced by a future script has one stable shape.
 */
export interface NormalizedFeedItem {
  readonly sourceId: string;
  /** The source GUID, or a content-derived GUID when the source supplied none. */
  readonly guid: string;
  readonly title: string;
  readonly description: string;
  readonly url: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  /** A stable, non-cryptographic identity hash for exact-content matching. */
  readonly contentHash: string;
}

export interface FeedItemNormalizationOptions {
  /** Maximum Unicode code points retained in a supplied description. */
  readonly maxDescriptionCharacters?: number;
  /** Maximum Unicode code points retained in a supplied title. */
  readonly maxTitleCharacters?: number;
}

export const FEED_ITEM_NORMALIZATION_DEFAULTS = {
  maxDescriptionCharacters: 4_000,
  maxTitleCharacters: 300,
} as const;

const TRACKING_QUERY_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "igshid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "s_cid",
  "ttclid",
  "twclid",
  "vero_id",
  "yclid",
]);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  deg: "°",
  divide: "÷",
  euro: "€",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lt: "<",
  lsaquo: "‹",
  lsquo: "‘",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  not: "¬",
  para: "¶",
  plusmn: "±",
  pound: "£",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  reg: "®",
  rsaquo: "›",
  rsquo: "’",
  shy: "\u00ad",
  times: "×",
  trade: "™",
  yen: "¥",
};

const DROP_ELEMENT_PATTERN =
  /<\s*(script|style|noscript|template|iframe|object|embed|svg)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const BREAK_ELEMENT_PATTERN =
  /<\s*\/\s*(p|div|li|h[1-6]|blockquote|pre|tr|table|section|article)\s*>/gi;

const OPEN_LIST_ITEM_PATTERN = /<\s*li\b[^>]*>/gi;
const BREAK_TAG_PATTERN = /<\s*br\s*\/?>/gi;

/**
 * Remove markup and turn the remaining document into bounded plain text.
 *
 * A DOM parser is intentionally not used here: the domain package must run in
 * Bun's test environment as well as in a future pipeline worker, and a parser
 * is unnecessary for the small transformation this contract needs. The tag
 * scanner handles quoted `>` characters, while decoded entities are processed
 * only after tags are gone so encoded markup remains visible text.
 */
export function sanitizeHtmlToText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const withBreaks = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(DROP_ELEMENT_PATTERN, "")
    .replace(BREAK_TAG_PATTERN, "\n")
    .replace(OPEN_LIST_ITEM_PATTERN, "\n")
    .replace(BREAK_ELEMENT_PATTERN, "\n");

  const withoutTags = stripHtmlTags(withBreaks);
  const decoded = decodeHtmlEntities(withoutTags);

  return decoded
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Canonicalize an item URL without guessing about publisher-specific paths or
 * query parameters. Only well-known campaign identifiers are removed; an
 * unknown parameter may be part of the resource's identity and is retained.
 */
export function canonicalizeUrl(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(decodeHtmlEntities(value.trim()));
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    return null;
  }

  url.hash = "";

  for (const [name] of [...url.searchParams]) {
    if (isTrackingQueryName(name)) {
      url.searchParams.delete(name);
    }
  }

  return url.href;
}

/**
 * Normalize a feed timestamp to UTC ISO form.
 *
 * A date-only ISO value is treated as midnight UTC. An ISO local date-time is
 * also interpreted as UTC rather than the machine's local timezone. Other
 * date-time formats must carry an explicit timezone; an invalid or ambiguous
 * value returns null and never falls back to the current clock.
 */
export function normalizeFeedDate(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const isoDateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(trimmed);
  if (isoDateOnly !== null) {
    return validIsoDateAtUtc(isoDateOnly[1]);
  }

  const isoDateTime =
    /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.exec(
      trimmed,
    );
  if (isoDateTime !== null) {
    const datePart = validIsoDateAtUtc(isoDateTime[1]);
    if (datePart === null) {
      return null;
    }

    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    return toUtcIso(hasTimezone ? trimmed : `${trimmed}Z`);
  }

  if (!hasExplicitTimezone(trimmed)) {
    return null;
  }

  return toUtcIso(trimmed);
}

/** Hash text as UTF-8 with a stable 64-bit FNV-1a checksum. */
export function contentHashFor(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}

/** Normalize one parsed source item. */
export function normalizeFeedItem(
  sourceId: string,
  input: RawFeedItem,
  options: FeedItemNormalizationOptions = {},
): NormalizedFeedItem {
  const settings = resolveOptions(options);
  const title = truncate(
    sanitizeHtmlToText(input.title),
    settings.maxTitleCharacters,
  );
  const description = truncate(
    sanitizeHtmlToText(input.description),
    settings.maxDescriptionCharacters,
  );
  const url = canonicalizeUrl(input.link);
  const contentHash = contentHashFor(
    [title.toLowerCase(), description].join("\u001f"),
  );
  const suppliedGuid = normalizeGuid(input.guid);

  return {
    sourceId,
    guid: suppliedGuid ?? url ?? `content-${contentHash}`,
    title,
    description,
    url,
    publishedAt: normalizeFeedDate(input.publishedAt),
    updatedAt: normalizeFeedDate(input.updatedAt),
    contentHash,
  };
}

/** Normalize items in input order, then collapse exact identities per source. */
export function normalizeFeedItems(
  sourceId: string,
  inputs: readonly RawFeedItem[],
  options: FeedItemNormalizationOptions = {},
): readonly NormalizedFeedItem[] {
  return deduplicateFeedItems(
    inputs.map((input) => normalizeFeedItem(sourceId, input, options)),
  );
}

/**
 * Collapse duplicate identities while preserving the first item from each
 * source. A GUID or canonical URL is enough to identify an exact duplicate.
 * Items without either source identifier use their content-derived GUID, so a
 * source changing only its tracking parameters does not make the same item
 * appear twice.
 */
export function deduplicateFeedItems(
  items: readonly NormalizedFeedItem[],
): readonly NormalizedFeedItem[] {
  const seen = new Set<string>();
  const result: NormalizedFeedItem[] = [];

  for (const item of items) {
    const keys = identityKeys(item);
    if (keys.some((key) => seen.has(key))) {
      continue;
    }

    keys.forEach((key) => {
      seen.add(key);
    });
    result.push(item);
  }

  return result;
}

interface NormalizationSettings {
  readonly maxDescriptionCharacters: number;
  readonly maxTitleCharacters: number;
}

function resolveOptions(
  options: FeedItemNormalizationOptions,
): NormalizationSettings {
  const settings = {
    maxDescriptionCharacters:
      options.maxDescriptionCharacters ??
      FEED_ITEM_NORMALIZATION_DEFAULTS.maxDescriptionCharacters,
    maxTitleCharacters:
      options.maxTitleCharacters ??
      FEED_ITEM_NORMALIZATION_DEFAULTS.maxTitleCharacters,
  };

  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }

  return settings;
}

function truncate(value: string, maxCharacters: number): string {
  return [...value].slice(0, maxCharacters).join("");
}

function normalizeGuid(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const decoded = decodeHtmlEntities(value).trim().replace(/\s+/g, " ");
  if (decoded === "") {
    return null;
  }

  return canonicalizeUrl(decoded) ?? decoded;
}

function identityKeys(item: NormalizedFeedItem): readonly string[] {
  const prefix = `${item.sourceId}\u0000`;
  return [
    `${prefix}guid:${item.guid}`,
    item.url === null ? null : `${prefix}url:${item.url}`,
    item.url === null ? `${prefix}hash:${item.contentHash}` : null,
  ].filter((key): key is string => key !== null);
}

function isTrackingQueryName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_QUERY_NAMES.has(lower);
}

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (whole, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return decodeCodePoint(entity.slice(2), 16, whole);
      }
      if (entity.startsWith("#")) {
        return decodeCodePoint(entity.slice(1), 10, whole);
      }

      return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
    },
  );
}

function decodeCodePoint(
  value: string,
  radix: 10 | 16,
  fallback: string,
): string {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint) ||
    codePoint === 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return fallback;
  }

  return String.fromCodePoint(codePoint);
}

function stripHtmlTags(value: string): string {
  let result = "";
  let inTag = false;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) {
      continue;
    }

    if (!inTag) {
      if (character === "<" && isTagStart(value[index + 1])) {
        inTag = true;
        quote = null;
      } else {
        result += character;
      }
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ">") {
      inTag = false;
    }
  }

  return result;
}

function isTagStart(value: string | undefined): boolean {
  return (
    value !== undefined &&
    (value === "/" || value === "!" || value === "?" || /[A-Za-z]/.test(value))
  );
}

function validIsoDateAtUtc(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return parsed.toISOString();
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:\b(?:UT|UTC|GMT|[ECMP][SD]T)\b|[+-]\d{2}:?\d{2}|Z)$/i.test(value);
}

function toUtcIso(value: string): string | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const parsed = new Date(milliseconds);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
