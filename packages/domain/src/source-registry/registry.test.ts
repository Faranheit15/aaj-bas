/**
 * One test per contract clause, each named for the mistake it refuses.
 *
 * The fixtures are built as plain values and parsed, rather than constructed as
 * typed objects, because everything here is about what the schema does with a
 * file somebody wrote by hand. A typed fixture would be checked by the compiler
 * before the schema ever saw it, which is the wrong end of the problem.
 */
import { describe, expect, it } from "vitest";
import { sourceRegistrySchema } from "./registry";

/** An active source with a complete terms review. */
function activeEntry(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "desk-daily",
    publisher: "Desk Daily",
    siteUrl: "https://desk-daily.co.in/",
    feedUrl: "https://desk-daily.co.in/feed.xml",
    sourceType: "publisher",
    region: "india",
    language: "en",
    active: true,
    sample: false,
    termsUrl: "https://desk-daily.co.in/terms#syndication",
    termsReviewedOn: "2026-07-21",
    termsReviewedBy: "faran",
    permittedUse:
      "Headlines and the supplied description may be reused with attribution and a link to the original article.",
    permittedUses: ["headline", "supplied-description"],
    attribution: "Desk Daily",
    ...overrides,
  };
}

function inactiveEntry(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "valley-record",
    publisher: "Valley Record",
    siteUrl: "https://valley-record.co.in/",
    feedUrl: "https://valley-record.co.in/rss",
    sourceType: "publisher",
    region: "india",
    language: "en",
    active: false,
    sample: false,
    ...overrides,
  };
}

function sampleEntry(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "sample-wire",
    publisher: "Sample Wire",
    siteUrl: "https://sample-wire.example/",
    feedUrl: "https://sample-wire.example/feed.xml",
    sourceType: "publisher",
    region: "world",
    language: "en",
    active: false,
    sample: true,
    ...overrides,
  };
}

function parse(sources: readonly unknown[]) {
  return sourceRegistrySchema.safeParse({ schemaVersion: 1, sources });
}

function messagesOf(result: ReturnType<typeof parse>): string[] {
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

/** The six fields that together mean "somebody read the terms". */
const REVIEW_FIELDS = [
  "termsUrl",
  "termsReviewedOn",
  "termsReviewedBy",
  "permittedUse",
  "permittedUses",
  "attribution",
] as const;

describe("the terms review", () => {
  it("accepts an active source that carries the whole review", () => {
    expect(parse([activeEntry()]).success).toBe(true);
  });

  it("rejects an active source missing any single review field", () => {
    for (const field of REVIEW_FIELDS) {
      const entry = activeEntry() as Record<string, unknown>;
      delete entry[field];
      expect(parse([entry]).success, field).toBe(false);
    }
  });

  it("lets an inactive source omit every review field, and any subset of them", () => {
    expect(parse([inactiveEntry()]).success).toBe(true);

    // Independently optional, because a half-reviewed inactive source is an
    // honest drafting state rather than a broken one.
    const partial = activeEntry({
      id: "valley-record",
      active: false,
    }) as Record<string, unknown>;
    for (const field of REVIEW_FIELDS) {
      const entry = { ...partial };
      delete entry[field];
      expect(parse([entry]).success, field).toBe(true);
    }
  });

  it("narrows permittedUse to a string on an active source, which no superRefine can do", () => {
    const registry = sourceRegistrySchema.parse({
      schemaVersion: 1,
      sources: [activeEntry()],
    });
    const entry = registry.sources[0];
    if (entry === undefined || !entry.active) {
      throw new Error("the fixture must parse as an active source");
    }

    // These five assignments are the test, and `bun run typecheck` is what runs
    // them: on the union, `entry.active` narrows the review fields to present.
    // A boolean plus a cross-field check would parse the same file identically
    // and leave every one of these as `string | undefined` at the call site,
    // which is where a future slice would write the source that skipped review.
    const permittedUse: string = entry.permittedUse;
    const reviewedOn: string = entry.termsReviewedOn;
    const reviewedBy: string = entry.termsReviewedBy;
    const permittedUses: readonly string[] = entry.permittedUses;
    const attribution: string = entry.attribution;

    expect(permittedUse.length).toBeGreaterThan(40);
    expect(reviewedOn).toBe("2026-07-21");
    expect(reviewedBy).toBe("faran");
    expect(permittedUses).toEqual(["headline", "supplied-description"]);
    expect(attribution).toBe("Desk Daily");
  });

  it("rejects a reviewer recorded as an email address", () => {
    expect(
      parse([activeEntry({ termsReviewedBy: "faran@example.com" })]).success,
    ).toBe(false);
    expect(parse([activeEntry({ termsReviewedBy: "@faran" })]).success).toBe(
      false,
    );
    expect(parse([activeEntry({ termsReviewedBy: "Faran M" })]).success).toBe(
      true,
    );
  });

  it("rejects a permitted-use note of nothing but whitespace", () => {
    // Forty spaces reach the minimum length only if the check runs before the
    // trim, which is exactly the bug this pins.
    expect(parse([activeEntry({ permittedUse: " ".repeat(40) })]).success).toBe(
      false,
    );
    expect(
      parse([activeEntry({ permittedUse: "too short to be a review" })])
        .success,
    ).toBe(false);
  });

  it("rejects a review date that never happened", () => {
    expect(
      parse([activeEntry({ termsReviewedOn: "2026-02-30" })]).success,
    ).toBe(false);
    expect(
      parse([activeEntry({ termsReviewedOn: "2026-07-21T06:00:00Z" })]).success,
    ).toBe(false);
    expect(
      parse([activeEntry({ termsReviewedOn: "2024-02-29" })]).success,
    ).toBe(true);
  });

  it("rejects an empty permittedUses list, which claims a review that permits nothing", () => {
    expect(parse([activeEntry({ permittedUses: [] })]).success).toBe(false);
  });

  it("requires the credit line the terms demand, and refuses an empty one", () => {
    // A permission granted on condition of a credit is not a permission until
    // the credit is recorded, so a blank attribution is a half-review rather
    // than a tidy default.
    expect(parse([activeEntry({ attribution: " ".repeat(20) })]).success).toBe(
      false,
    );
    expect(parse([activeEntry({ attribution: "D" })]).success).toBe(false);
    expect(
      parse([activeEntry({ attribution: "Desk Daily, desk-daily.co.in" })])
        .success,
    ).toBe(true);
  });
});

describe("the vocabularies", () => {
  it("rejects a value outside a closed enum rather than carrying it through", () => {
    expect(parse([activeEntry({ region: "europe" })]).success).toBe(false);
    expect(parse([activeEntry({ language: "hi" })]).success).toBe(false);
    expect(parse([activeEntry({ sourceType: "blog" })]).success).toBe(false);
    expect(
      parse([activeEntry({ permittedUses: ["headline", "full-text"] })])
        .success,
    ).toBe(false);
  });

  it("has no permitted use for imagery, because nothing may render it", () => {
    expect(parse([activeEntry({ permittedUses: ["image"] })]).success).toBe(
      false,
    );
  });
});

describe("strictness", () => {
  it("rejects a misspelled field instead of dropping it, on every branch of the union", () => {
    // Each branch separately, because strictness is a property of each object
    // schema rather than of the union. The inactive branch is the one the
    // runbook's procedure sends a contributor through -- an entry is drafted
    // with `active: false` and flipped later -- so it is where a typo in a
    // review field is both most likely and least visible: the field it was
    // meant to be simply stays absent, which that branch permits.
    for (const build of [activeEntry, inactiveEntry, sampleEntry]) {
      const entry = build() as Record<string, unknown>;
      entry.termsReviewdOn = "2026-07-21";

      const result = parse([entry]);
      expect(result.success, build.name).toBe(false);
      expect(messagesOf(result).join(" "), build.name).toContain(
        "termsReviewdOn",
      );
    }
  });

  it("rejects an unknown key on the document itself", () => {
    expect(
      sourceRegistrySchema.safeParse({
        schemaVersion: 1,
        sources: [activeEntry()],
        reviewedBy: "faran",
      }).success,
    ).toBe(false);
  });

  it("rejects a registry with no entries, and a schema version it cannot read", () => {
    expect(parse([]).success).toBe(false);
    expect(
      sourceRegistrySchema.safeParse({
        schemaVersion: 2,
        sources: [activeEntry()],
      }).success,
    ).toBe(false);
  });
});

describe("the feed URL", () => {
  it("rejects every scheme but https, one case each", () => {
    for (const feedUrl of [
      "http://desk-daily.co.in/feed.xml",
      "ftp://desk-daily.co.in/feed.xml",
      "file:///srv/feeds/desk-daily.xml",
      "javascript:alert(1)",
      "data:application/rss+xml,%3Crss%2F%3E",
    ]) {
      const result = parse([activeEntry({ feedUrl })]);
      expect(result.success, feedUrl).toBe(false);
      // The protocol issue, specifically. `javascript:` and `data:` parse with
      // an empty hostname, so a host check would have passed them and only the
      // ordering of the checks stops that.
      expect(messagesOf(result).join(" "), feedUrl).toContain("must use https");
    }
  });

  it("rejects credentials, a named port, and a fragment", () => {
    expect(
      parse([
        activeEntry({
          feedUrl: "https://reader:secret@desk-daily.co.in/feed.xml",
        }),
      ]).success,
    ).toBe(false);
    expect(
      parse([
        activeEntry({ feedUrl: "https://desk-daily.co.in:8443/feed.xml" }),
      ]).success,
    ).toBe(false);
    expect(
      parse([
        activeEntry({ feedUrl: "https://desk-daily.co.in/feed.xml#latest" }),
      ]).success,
    ).toBe(false);
  });

  it("rejects a value the URL parser cannot parse at all", () => {
    // The coupling two comments elsewhere depend on, asserted here rather than
    // assumed there: `feedUrlSchema`'s own `superRefine` returns silently when
    // `new URL` throws, and `rules.ts` drops a throwing entry from
    // `classifiedHosts`. Both are only safe because nothing that throws can get
    // past this schema in the first place. Without the check, a feed URL of
    // "not a url at all" produces no finding and an entry reported as
    // fetchable.
    for (const feedUrl of [
      "not a url at all",
      "//desk-daily.co.in/feed.xml",
      "desk-daily.co.in/feed.xml",
      "https://",
    ]) {
      expect(() => new URL(feedUrl), feedUrl).toThrow();
      expect(parse([activeEntry({ feedUrl })]).success, feedUrl).toBe(false);
    }
  });

  it("rejects a feed URL longer than the schema's bound", () => {
    const room = 2048 - "https://desk-daily.co.in/".length;
    const atTheLimit = `https://desk-daily.co.in/${"a".repeat(room)}`;

    expect(atTheLimit).toHaveLength(2048);
    expect(parse([activeEntry({ feedUrl: atTheLimit })]).success).toBe(true);
    expect(parse([activeEntry({ feedUrl: `${atTheLimit}a` })]).success).toBe(
      false,
    );
  });

  it("accepts the scheme's default port, which the URL parser drops", () => {
    expect(
      parse([activeEntry({ feedUrl: "https://desk-daily.co.in:443/feed.xml" })])
        .success,
    ).toBe(true);
  });

  it("allows a fragment on termsUrl, where it names the clause somebody read", () => {
    expect(
      parse([activeEntry({ termsUrl: "https://desk-daily.co.in/terms#reuse" })])
        .success,
    ).toBe(true);
  });
});

describe("duplicates", () => {
  it("rejects two entries claiming one id", () => {
    const result = parse([
      activeEntry(),
      activeEntry({ feedUrl: "https://desk-daily.co.in/other.xml" }),
    ]);
    expect(result.success).toBe(false);
    expect(messagesOf(result).join(" ")).toContain(
      "duplicate source id desk-daily",
    );
  });

  it("rejects one feed spelled three ways, since the URL parser folds all three", () => {
    for (const feedUrl of [
      "https://DESK-DAILY.co.in/feed.xml",
      "https://desk-daily.co.in:443/feed.xml",
      "HTTPS://desk-daily.co.in/feed.xml",
    ]) {
      const result = parse([
        activeEntry(),
        activeEntry({ id: "desk-daily-copy", feedUrl }),
      ]);
      expect(result.success, feedUrl).toBe(false);
      expect(messagesOf(result).join(" "), feedUrl).toContain(
        "duplicate feed URL",
      );
    }
  });

  it("accepts feeds differing by a trailing slash, which address different resources", () => {
    // RFC 3986 makes these two resources, and guessing otherwise would silently
    // drop a real feed. `rules.ts` warns about the pair instead.
    expect(
      parse([
        activeEntry(),
        activeEntry({
          id: "desk-daily-index",
          feedUrl: "https://desk-daily.co.in/feed.xml/",
        }),
      ]).success,
    ).toBe(true);
  });

  it("accepts two feeds published from one site", () => {
    expect(
      parse([
        activeEntry(),
        activeEntry({
          id: "desk-daily-business",
          feedUrl: "https://desk-daily.co.in/business/feed.xml",
        }),
      ]).success,
    ).toBe(true);
  });
});

describe("sample entries", () => {
  it("accepts a sample that carries no review at all", () => {
    expect(parse([sampleEntry()]).success).toBe(true);
  });

  it("rejects a sample carrying any terms-review field", () => {
    for (const field of REVIEW_FIELDS) {
      const complete = activeEntry() as Record<string, unknown>;
      const entry = sampleEntry({ [field]: complete[field] });
      expect(parse([entry]).success, field).toBe(false);
    }
  });

  it("rejects a sample that claims to be active", () => {
    expect(parse([sampleEntry({ active: true })]).success).toBe(false);
  });
});
