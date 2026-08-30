/**
 * One test per rule, each asserting both directions: a registry with nothing
 * wrong produces no finding, and a registry broken in exactly one way produces
 * exactly one.
 *
 * The "exactly one" half is the important half. A rule that fires on the broken
 * fixture proves only that it fires; a rule that fires once, on the entry that
 * was broken, proves it is not also firing on the entries that were not.
 */
import { describe, expect, it } from "vitest";
import { sourceRegistrySchema, type SourceRegistry } from "./registry";
import { type RuleViolation, SOURCE_REGISTRY_RULES } from "./rules";

interface StampedViolation extends RuleViolation {
  readonly ruleId: string;
}

function registryOf(sources: readonly unknown[]): SourceRegistry {
  return sourceRegistrySchema.parse({ schemaVersion: 1, sources });
}

function findingsFor(registry: SourceRegistry): StampedViolation[] {
  return SOURCE_REGISTRY_RULES.flatMap((rule) =>
    rule.evaluate(registry).map((violation) => ({
      ...violation,
      ruleId: rule.id,
    })),
  );
}

function findingsOf(
  registry: SourceRegistry,
  ruleId: string,
): StampedViolation[] {
  return findingsFor(registry).filter((finding) => finding.ruleId === ruleId);
}

function realEntry(overrides: Record<string, unknown> = {}): unknown {
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
    termsUrl: "https://desk-daily.co.in/terms",
    termsReviewedOn: "2026-07-21",
    termsReviewedBy: "faran",
    permittedUse:
      "Headlines and the supplied description may be reused with attribution and a link to the original article.",
    permittedUses: ["headline", "supplied-description"],
    attribution: "Desk Daily",
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

/** A registry of fixtures: every host reserved, which is a coherent file. */
function sampleBase(): SourceRegistry {
  return registryOf([
    sampleEntry(),
    sampleEntry({
      id: "sample-review",
      publisher: "Sample Review",
      siteUrl: "https://sample-review.invalid/",
      feedUrl: "https://sample-review.invalid/rss",
    }),
  ]);
}

/** A registry of real publishers: every host real, which is also coherent. */
function realBase(): SourceRegistry {
  return registryOf([
    realEntry(),
    realEntry({
      id: "valley-record",
      publisher: "Valley Record",
      siteUrl: "https://valley-record.co.in/",
      feedUrl: "https://valley-record.co.in/rss",
      permittedUse:
        "The publisher permits headline reuse and a generated summary, provided each story links back to the source page.",
      permittedUses: ["headline", "generated-summary"],
      attribution: "Valley Record",
    }),
  ]);
}

describe("the rule table", () => {
  it("names every rule and its severity, so a downgrade shows up as a diff", () => {
    expect(
      SOURCE_REGISTRY_RULES.map((rule) => [rule.id, rule.severity]),
    ).toEqual([
      ["url/no-address-literal", "blocking"],
      ["url/no-private-host", "blocking"],
      ["sample/reserved-host-required", "blocking"],
      ["sample/reserved-host-only", "blocking"],
      ["url/mixed-host-classes", "blocking"],
      ["duplicate/near-feed-url", "warning"],
      ["duplicate/permitted-use-note", "warning"],
    ]);
  });

  it("has no repeated rule id, since the id is how a finding is identified", () => {
    const ids = SOURCE_REGISTRY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves a coherent sample registry and a coherent real one alone", () => {
    expect(findingsFor(sampleBase())).toEqual([]);
    expect(findingsFor(realBase())).toEqual([]);
  });
});

describe("url/no-address-literal", () => {
  it("catches the loopback address in every spelling, so a rule that compares the URL text is not enough", () => {
    for (const host of [
      "2130706433",
      "0177.0.0.1",
      "0x7f.0.0.1",
      "127.1",
      "127.0.0.1.",
      "127.0.0.1",
      "[::1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:7f00:1]",
      "[::127.0.0.1]",
      "[::7f00:1]",
      "[64:ff9b::7f00:1]",
      "[2002:7f00:1::]",
    ]) {
      const found = findingsOf(
        registryOf([realEntry({ feedUrl: `https://${host}/feed.xml` })]),
        "url/no-address-literal",
      );
      expect(found, host).toHaveLength(1);
      expect(found[0]?.sourceId, host).toBe("desk-daily");
      expect(found[0]?.path, host).toBe("sources[0].feedUrl");
    }
  });

  it("catches the cloud metadata address in every spelling", () => {
    for (const host of [
      "169.254.169.254",
      "2852039166",
      "0251.0376.0251.0376",
      "0xa9.0xfe.0xa9.0xfe",
      "[::ffff:169.254.169.254]",
      "[::ffff:a9fe:a9fe]",
    ]) {
      const found = findingsOf(
        registryOf([
          realEntry({ feedUrl: `https://${host}/latest/meta-data/` }),
        ]),
        "url/no-address-literal",
      );
      expect(found, host).toHaveLength(1);
      // Section 37 wants a failure somebody can act on. "link-local" tells a
      // maintainer what they are actually looking at; the bare address does not.
      expect(found[0]?.message, host).toContain("link-local address");
    }
  });

  it("names the address class in the message", () => {
    expect(
      findingsOf(
        registryOf([realEntry({ feedUrl: "https://127.1/feed.xml" })]),
        "url/no-address-literal",
      )[0]?.message,
    ).toContain("loopback address");

    expect(
      findingsOf(
        registryOf([realEntry({ feedUrl: "https://10.1.2.3/feed.xml" })]),
        "url/no-address-literal",
      )[0]?.message,
    ).toContain("private address");

    expect(
      findingsOf(
        registryOf([realEntry({ feedUrl: "https://93.184.216.34/feed.xml" })]),
        "url/no-address-literal",
      )[0]?.message,
    ).toContain("public address");
  });
});

describe("url/no-private-host", () => {
  it("rejects a name that resolves only inside the network running the build", () => {
    for (const host of [
      "localhost",
      "cache.localhost",
      "archive.local",
      "wiki.internal",
      "router.home.arpa",
    ]) {
      const found = findingsOf(
        registryOf([realEntry({ feedUrl: `https://${host}/feed.xml` })]),
        "url/no-private-host",
      );
      expect(found, host).toHaveLength(1);
    }

    expect(findingsOf(realBase(), "url/no-private-host")).toEqual([]);
  });
});

describe("the hosts an entry names besides its feed", () => {
  it("classifies termsUrl, because a terms page nobody could reach is a fabrication tell", () => {
    // This is the reason the rule reaches past `feedUrl` at all. `termsUrl`
    // records the page a human says they read; on a loopback, private, or
    // reserved host, nobody outside the machine that wrote the entry could have
    // read it, and the entry is claiming a review that did not happen.
    for (const [termsUrl, ruleId] of [
      ["http://127.0.0.1/terms", "url/no-address-literal"],
      ["https://169.254.169.254/terms", "url/no-address-literal"],
      ["https://wiki.internal/terms", "url/no-private-host"],
      ["http://localhost/terms", "url/no-private-host"],
      ["https://desk-daily.invalid/terms", "sample/reserved-host-only"],
    ] as const) {
      const found = findingsOf(registryOf([realEntry({ termsUrl })]), ruleId);

      expect(found, termsUrl).toHaveLength(1);
      expect(found[0]?.sourceId, termsUrl).toBe("desk-daily");
      expect(found[0]?.path, termsUrl).toBe("sources[0].termsUrl");
      expect(found[0]?.message, termsUrl).toContain("terms URL");
    }
  });

  it("classifies siteUrl, which a reader would have to be able to reach", () => {
    for (const [siteUrl, ruleId] of [
      ["http://localhost/", "url/no-private-host"],
      ["https://169.254.169.254/", "url/no-address-literal"],
      ["https://desk-daily.invalid/", "sample/reserved-host-only"],
    ] as const) {
      const found = findingsOf(registryOf([realEntry({ siteUrl })]), ruleId);

      expect(found, siteUrl).toHaveLength(1);
      expect(found[0]?.path, siteUrl).toBe("sources[0].siteUrl");
      expect(found[0]?.message, siteUrl).toContain("site URL");
    }
  });

  it("classifies licenseUrl, so a published licence link cannot point at a private host", () => {
    for (const [licenseUrl, ruleId] of [
      ["http://127.0.0.1/licence", "url/no-address-literal"],
      ["https://wiki.internal/licence", "url/no-private-host"],
      ["https://desk-daily.invalid/licence", "sample/reserved-host-only"],
    ] as const) {
      const found = findingsOf(registryOf([realEntry({ licenseUrl })]), ruleId);

      expect(found, licenseUrl).toHaveLength(1);
      expect(found[0]?.path, licenseUrl).toBe("sources[0].licenseUrl");
      expect(found[0]?.message, licenseUrl).toContain("licence URL");
    }
  });

  it("leaves http alone on the two URLs where it is legitimate", () => {
    // `feedUrl` is https-only and the schema enforces it. A terms page and a
    // publisher's home page are pages a human opens, not documents this product
    // fetches and turns into news, so the host is classified and the scheme is
    // not.
    expect(
      findingsFor(
        registryOf([
          realEntry({
            siteUrl: "http://desk-daily.co.in/",
            termsUrl: "http://desk-daily.co.in/terms",
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("says nothing about a sample's reserved site, which is what a sample must have", () => {
    // `sample/reserved-host-only` exempts a sample entry, and the sample
    // fixtures point every URL at a reserved name.
    expect(findingsFor(sampleBase())).toEqual([]);
  });

  it("says nothing about an entry that carries no termsUrl", () => {
    const drafting = registryOf([
      sampleEntry({
        id: "valley-record",
        publisher: "Valley Record",
        siteUrl: "https://valley-record.co.in/",
        feedUrl: "https://valley-record.co.in/rss",
        sample: false,
      }),
    ]);

    expect(findingsFor(drafting)).toEqual([]);
  });
});

describe("the sample rules", () => {
  it("requires a sample to point at a name that can never resolve to a publisher", () => {
    const rule = "sample/reserved-host-required";
    expect(findingsOf(sampleBase(), rule)).toEqual([]);

    const found = findingsOf(
      registryOf([
        sampleEntry({ feedUrl: "https://desk-daily.co.in/feed.xml" }),
      ]),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.sourceId).toBe("sample-wire");
  });

  it("refuses a real entry hiding behind a reserved name", () => {
    const rule = "sample/reserved-host-only";
    expect(findingsOf(realBase(), rule)).toEqual([]);

    for (const host of [
      "wire.example",
      "news.invalid",
      "feeds.test",
      "example.com",
      "archive.example.org",
    ]) {
      const found = findingsOf(
        registryOf([realEntry({ feedUrl: `https://${host}/feed.xml` })]),
        rule,
      );
      expect(found, host).toHaveLength(1);
    }
  });

  it("blocks a registry that mixes fixtures with real publishers", () => {
    const rule = "url/mixed-host-classes";
    expect(findingsOf(sampleBase(), rule)).toEqual([]);
    expect(findingsOf(realBase(), rule)).toEqual([]);

    const mixed = registryOf([sampleEntry(), realEntry()]);
    const found = findingsOf(mixed, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.sourceId).toBeUndefined();
    expect(found[0]?.message).toContain("sample-wire");
    expect(found[0]?.message).toContain("desk-daily");
  });

  it("names the entries in an order the file cannot change", () => {
    // Two of each, and each pair written into the file in the reverse of its
    // sorted order, because with one of each sorting is a no-op and a rule that
    // dropped the sort would pass anyway.
    const rule = "url/mixed-host-classes";
    const mixed = [
      sampleEntry({ id: "sample-zephyr" }),
      sampleEntry({
        id: "sample-alder",
        feedUrl: "https://sample-alder.invalid/feed.xml",
        siteUrl: "https://sample-alder.invalid/",
      }),
      realEntry({ id: "zephyr-post" }),
      realEntry({
        id: "alder-gazette",
        publisher: "Alder Gazette",
        siteUrl: "https://alder-gazette.co.in/",
        feedUrl: "https://alder-gazette.co.in/rss",
      }),
    ];
    const forwards = findingsOf(registryOf(mixed), rule);
    const backwards = findingsOf(registryOf([...mixed].reverse()), rule);

    expect(forwards[0]?.message).toContain(
      "2 reserved-name sources (sample-alder, sample-zephyr)",
    );
    expect(forwards[0]?.message).toContain(
      "2 real ones (alder-gazette, zephyr-post)",
    );
    expect(forwards[0]?.message).toBe(backwards[0]?.message);
  });
});

describe("duplicate/near-feed-url", () => {
  it("warns about a pair the schema deliberately kept apart", () => {
    const rule = "duplicate/near-feed-url";
    expect(findingsOf(realBase(), rule)).toEqual([]);

    for (const feedUrl of [
      "https://desk-daily.co.in/feed.xml/",
      "https://www.desk-daily.co.in/feed.xml",
    ]) {
      const found = findingsOf(
        registryOf([
          realEntry(),
          realEntry({ id: "desk-daily-copy", feedUrl }),
        ]),
        rule,
      );
      expect(found, feedUrl).toHaveLength(1);
      expect(found[0]?.message, feedUrl).toContain(
        "desk-daily, desk-daily-copy",
      );
    }
  });

  it("reports two near-duplicate pairs in an order the file cannot change", () => {
    // Two groups, written into the file in the reverse of their sorted order,
    // so the grouping map's insertion order and its key order disagree. With
    // one group the sort inside `sortedEntries` is unobservable, and a rule
    // whose output followed insertion order would report the same bytes.
    const found = findingsOf(
      registryOf([
        realEntry({ id: "zephyr-post", feedUrl: "https://zephyr.co.in/f.xml" }),
        realEntry({
          id: "zephyr-post-copy",
          feedUrl: "https://zephyr.co.in/f.xml/",
        }),
        realEntry({
          id: "alder-gazette",
          feedUrl: "https://alder.co.in/f.xml",
        }),
        realEntry({
          id: "alder-gazette-copy",
          feedUrl: "https://www.alder.co.in/f.xml",
        }),
      ]),
      "duplicate/near-feed-url",
    );

    expect(found).toHaveLength(2);
    expect(found[0]?.message).toContain("alder-gazette, alder-gazette-copy");
    expect(found[1]?.message).toContain("zephyr-post, zephyr-post-copy");
  });

  it("stays quiet about two feeds that genuinely differ", () => {
    expect(
      findingsOf(
        registryOf([
          realEntry(),
          realEntry({
            id: "desk-daily-business",
            feedUrl: "https://desk-daily.co.in/business/feed.xml",
          }),
        ]),
        "duplicate/near-feed-url",
      ),
    ).toEqual([]);
  });
});

describe("duplicate/permitted-use-note", () => {
  it("warns when one review was written once and pasted across publishers", () => {
    const rule = "duplicate/permitted-use-note";
    expect(findingsOf(realBase(), rule)).toEqual([]);

    const shared = registryOf([
      realEntry(),
      realEntry({
        id: "valley-record",
        publisher: "Valley Record",
        siteUrl: "https://valley-record.co.in/",
        feedUrl: "https://valley-record.co.in/rss",
      }),
    ]);
    const found = findingsOf(shared, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("desk-daily, valley-record");
  });

  it("says nothing about two publishers permitting the same uses", () => {
    // The enumeration repeating is ordinary; the sentence repeating is not.
    expect(
      findingsOf(
        registryOf([
          realEntry(),
          realEntry({
            id: "valley-record",
            publisher: "Valley Record",
            siteUrl: "https://valley-record.co.in/",
            feedUrl: "https://valley-record.co.in/rss",
            permittedUse:
              "Valley Record allows headline reuse and the description it supplies, with a link back to each story.",
          }),
        ]),
        "duplicate/permitted-use-note",
      ),
    ).toEqual([]);
  });
});
