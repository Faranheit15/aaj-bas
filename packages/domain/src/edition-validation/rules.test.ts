/**
 * One test per rule, each asserting both directions: a good edition produces no
 * finding, and an edition broken in exactly one way produces exactly one.
 *
 * The "exactly one" half is the important half. A rule that fires on the broken
 * fixture proves only that it fires; a rule that fires once, on the story that
 * was broken, proves it is not also firing on the nine stories that were not.
 *
 * The base edition here is `validEdition()` with distinct wording. The shared
 * fixture is deliberately minimal and repeats one sentence pattern across all
 * ten stories, which the duplication heuristics correctly flag — every pair of
 * its headlines really is near-identical text. Rewriting the wording for these
 * tests is honest; loosening the thresholds so the fixture passed would not be,
 * and would leave the product with a rule that cannot detect what it exists to
 * detect. The base is also given the estimated minutes its own visible word
 * count implies, because the fixture's `estimatedMinutes` is a placeholder
 * rather than a computed figure.
 */
import type { Edition, SourceReference, Story } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import { EDITION_RULES, type RuleViolation } from "./rules";

/** Ten stories with no shared vocabulary, so only deliberate breakage fires. */
const DISTINCT_WORDING: readonly {
  slug: string;
  headline: string;
  deck: string;
}[] = [
  {
    slug: "harbour-dredging-permit",
    headline: "Harbour dredging permit issued for the eastern channel",
    deck: "The port board issued a dredging permit covering the eastern channel.",
  },
  {
    slug: "library-membership-fees",
    headline: "Library membership fees held at last winter's level",
    deck: "Municipal libraries will keep membership fees unchanged until spring.",
  },
  {
    slug: "orchard-frost-advisory",
    headline: "Orchard growers receive a frost advisory for the upper valley",
    deck: "Growers in the upper valley were sent a frost advisory before the weekend.",
  },
  {
    slug: "tram-depot-relocation",
    headline: "Tram depot relocation moves into its second phase",
    deck: "Relocating the tram depot has entered a second phase beside the yard.",
  },
  {
    slug: "seed-bank-catalogue",
    headline: "Seed bank publishes a catalogue of stored varieties",
    deck: "The regional seed bank published a catalogue listing every stored variety.",
  },
  {
    slug: "bridge-lighting-contract",
    headline: "Bridge lighting contract awarded to a nearby supplier",
    deck: "A lighting contract for the old bridge went to a supplier based nearby.",
  },
  {
    slug: "choir-festival-programme",
    headline: "Choir festival programme names twelve visiting ensembles",
    deck: "The festival programme names twelve visiting choral ensembles for autumn.",
  },
  {
    slug: "kiln-emissions-study",
    headline: "Kiln emissions study reports lower particulate readings",
    deck: "A study of brick kiln emissions reports lower particulate readings.",
  },
  {
    slug: "rowing-club-boathouse",
    headline: "Rowing club reopens its boathouse after a refit",
    deck: "The rowing club reopened its boathouse following a refit of the ramp.",
  },
  {
    slug: "ledger-digitisation-grant",
    headline: "Grant funds digitisation of nineteenth century ledgers",
    deck: "A grant will fund digitising nineteenth century ledgers held in storage.",
  },
];

/**
 * The visible word count of the base edition divided by 220 and rounded up.
 * Written as a literal rather than computed, so the arithmetic in
 * `length/estimated-minutes` is checked against a number a human worked out
 * rather than against itself.
 */
const BASE_ESTIMATED_MINUTES = 2;

function base(): Edition {
  const edition = validEdition();
  return {
    ...edition,
    estimatedMinutes: BASE_ESTIMATED_MINUTES,
    stories: edition.stories.map((story, index) => {
      const wording = DISTINCT_WORDING[index];
      return wording === undefined ? story : { ...story, ...wording };
    }),
  };
}

/** The base edition corrected once, with every correction invariant satisfied. */
const CORRECTED_AT = "2026-08-13T18:40:00+05:30";

function correctedBase(): Edition {
  const edition = base();
  return {
    ...edition,
    editionVersion: 2,
    status: "corrected",
    updatedAt: "2026-08-13T18:45:00+05:30",
    stories: edition.stories.map((story, index) =>
      index === 0 ? { ...story, updatedAt: CORRECTED_AT } : story,
    ),
    correctionNotes: [
      {
        id: "correction-first-story-figure",
        storyId: "story-0",
        correctedAt: CORRECTED_AT,
        editionVersion: 2,
        summary:
          "An earlier version of this development story misstated a figure, now corrected.",
      },
    ],
  };
}

/** The base edition moved onto real hosts, for the reserved-host rules. */
function realHostBase(): Edition {
  return withEverySource(base(), (source, index) => ({
    ...source,
    // A real registrable domain: `.example` is itself a reserved TLD.
    url: `https://news-publisher-${index}.org/article`,
  }));
}

interface StampedViolation extends RuleViolation {
  readonly ruleId: string;
}

function findingsFor(edition: Edition): StampedViolation[] {
  return EDITION_RULES.flatMap((rule) =>
    rule.evaluate(edition).map((violation) => ({
      ruleId: rule.id,
      ...violation,
    })),
  );
}

function findingsOf(edition: Edition, ruleId: string): StampedViolation[] {
  return findingsFor(edition).filter((finding) => finding.ruleId === ruleId);
}

function withStory(
  edition: Edition,
  index: number,
  change: (story: Story) => Story,
): Edition {
  return {
    ...edition,
    stories: edition.stories.map((story, at) =>
      at === index ? change(story) : story,
    ),
  };
}

function withSource(
  edition: Edition,
  index: number,
  change: (source: SourceReference) => SourceReference,
): Edition {
  return {
    ...edition,
    sources: edition.sources.map((source, at) =>
      at === index ? change(source) : source,
    ),
  };
}

function withEverySource(
  edition: Edition,
  change: (source: SourceReference, index: number) => SourceReference,
): Edition {
  return { ...edition, sources: edition.sources.map(change) };
}

/**
 * A pooled story whose visible text is exactly `count` words: a one-word deck,
 * a one-word `whyItMatters`, and the rest in a single `whatChanged` paragraph.
 */
function pooledStory(id: string, count: number): Story {
  const template = base().stories[8];
  if (template === undefined) {
    throw new Error("the fixture no longer carries a pooled story to copy");
  }
  return {
    ...template,
    id,
    slug: id,
    deck: "Padding",
    whatChanged: [wordsOfLength(count - 2)],
    whyItMatters: "Padding",
  };
}

/**
 * The visible word count `length/estimated-minutes` reports for an edition.
 *
 * Read out of the rule's own message, because the rule is the only thing that
 * decides which stories are visible. The estimate is set to zero first, which no
 * non-empty edition can match, so the finding is always there to read.
 */
function visibleWordsOf(edition: Edition): number {
  const found = findingsOf(
    { ...edition, estimatedMinutes: 0 },
    "length/estimated-minutes",
  );
  const words = /but (\d+) visible words/.exec(found[0]?.message ?? "")?.[1];
  if (words === undefined) {
    throw new Error(
      `no length finding to read a word count from: ${found[0]?.message}`,
    );
  }
  return Number(words);
}

/** A paragraph of exactly `count` words, for the length rules. */
function wordsOfLength(count: number): string {
  return Array.from({ length: count }, (_value, index) =>
    index === 0 ? "Padding" : "padding",
  ).join(" ");
}

describe("EDITION_RULES", () => {
  it("is the list the tests below cover, with the severities they assume", () => {
    // Hardcoded so a rule cannot be added, renamed, or downgraded without a
    // test being written for it in the same change.
    expect(EDITION_RULES.map((rule) => [rule.id, rule.severity])).toEqual([
      ["structural/duplicate-slug", "blocking"],
      ["structural/unreviewed-story-gate", "blocking"],
      ["structural/source-not-after-story-update", "blocking"],
      ["structural/generated-provenance-pair", "blocking"],
      ["structural/no-markup-in-text", "blocking"],
      ["structural/disputed-requires-uncertainty", "blocking"],
      ["structural/official-source-only-needs-official-label", "blocking"],
      ["diversity/min-publishers", "blocking"],
      ["diversity/publisher-primary-cap", "blocking"],
      ["diversity/publisher-concentration", "warning"],
      ["diversity/topic-cap", "blocking"],
      ["diversity/all-hard-news", "blocking"],
      ["duplicate/shared-source-majority", "blocking"],
      ["duplicate/shared-source", "warning"],
      ["duplicate/headline-similarity", "warning"],
      ["duplicate/slug-similarity", "warning"],
      ["length/estimated-minutes", "blocking"],
      ["length/deck-one-line", "warning"],
      ["length/what-changed-paragraph-words", "warning"],
      ["length/why-it-matters-one-paragraph", "warning"],
      ["url/no-credentials", "blocking"],
      ["url/no-ip-literal", "blocking"],
      ["url/no-private-host", "blocking"],
      ["url/mixed-host-classes", "blocking"],
      ["url/sample-data-hosts", "warning"],
      ["url/https-only", "warning"],
      ["correction/status-requires-note", "blocking"],
      ["correction/version-requires-note", "blocking"],
      ["correction/corrected-after-published", "blocking"],
      ["correction/corrected-within-updated", "blocking"],
      ["correction/story-reflects-correction", "blocking"],
    ]);
  });

  it("has no repeated rule id, since the id is how a finding is identified", () => {
    const ids = EDITION_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves the base edition free of every blocking rule", () => {
    // The one warning it does raise is `url/sample-data-hosts`, which is the
    // correct reading of a fixture built on reserved domains.
    const blockingIds = new Set(
      EDITION_RULES.filter((rule) => rule.severity === "blocking").map(
        (rule) => rule.id,
      ),
    );
    expect(
      findingsFor(base()).filter((finding) => blockingIds.has(finding.ruleId)),
    ).toEqual([]);
    expect(findingsFor(base()).map((finding) => finding.ruleId)).toEqual([
      "url/sample-data-hosts",
    ]);
  });
});

describe("structural rules", () => {
  it("structural/duplicate-slug catches two stories claiming one URL", () => {
    const rule = "structural/duplicate-slug";
    expect(findingsOf(base(), rule)).toEqual([]);

    const broken = withStory(base(), 1, (story) => ({
      ...story,
      slug: "harbour-dredging-permit",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-1");
  });

  it("structural/unreviewed-story-gate covers corrected editions too", () => {
    const rule = "structural/unreviewed-story-gate";
    expect(findingsOf(base(), rule)).toEqual([]);
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const unreviewed = (edition: Edition): Edition =>
      withStory(edition, 3, (story) => ({ ...story, reviewed: false }));

    const published = findingsOf(unreviewed(base()), rule);
    expect(published).toHaveLength(1);
    expect(published[0]?.storyId).toBe("story-3");

    // The schema stops an unreviewed story only in a `published` edition, so
    // this branch is the whole reason the rule exists.
    const corrected = findingsOf(unreviewed(correctedBase()), rule);
    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.storyId).toBe("story-3");

    // A draft is work in progress and is allowed to hold unreviewed stories.
    expect(
      findingsOf({ ...unreviewed(base()), status: "draft" }, rule),
    ).toEqual([]);
  });

  it("structural/source-not-after-story-update catches a source the story cannot rest on", () => {
    const rule = "structural/source-not-after-story-update";
    expect(findingsOf(base(), rule)).toEqual([]);

    const broken = withSource(base(), 2, (source) => ({
      ...source,
      publishedAt: "2026-08-13T11:00:00+05:30",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-2");

    // A source published after the story first appeared but before its last
    // update is the ordinary case: it is often what triggered the update.
    const updatedLater = withStory(broken, 2, (story) => ({
      ...story,
      updatedAt: "2026-08-13T12:00:00+05:30",
    }));
    expect(findingsOf(updatedLater, rule)).toEqual([]);
  });

  it("structural/generated-provenance-pair rejects half a provenance record", () => {
    const rule = "structural/generated-provenance-pair";
    expect(findingsOf(base(), rule)).toEqual([]);

    const modelOnly = withStory(base(), 4, (story) => ({
      ...story,
      generatedBy: "development-model",
    }));
    const found = findingsOf(modelOnly, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-4");

    const complete = withStory(modelOnly, 4, (story) => ({
      ...story,
      promptVersion: "prompt-1",
    }));
    expect(findingsOf(complete, rule)).toEqual([]);
  });

  it("structural/no-markup-in-text catches markup in story text and source titles", () => {
    const rule = "structural/no-markup-in-text";
    expect(findingsOf(base(), rule)).toEqual([]);

    const inDeck = withStory(base(), 5, (story) => ({
      ...story,
      deck: "A lighting contract <b>went</b> to a supplier based nearby.",
    }));
    const found = findingsOf(inDeck, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-5");
    expect(found[0]?.path).toBe("stories[5].deck");

    const inTitle = withSource(base(), 0, (source) => ({
      ...source,
      title: "Sample original headline &amp; another clause",
    }));
    const titleFindings = findingsOf(inTitle, rule);
    expect(titleFindings).toHaveLength(1);
    expect(titleFindings[0]?.storyId).toBeUndefined();
    expect(titleFindings[0]?.path).toBe("sources[0].title");

    // A comparison is not markup: the pattern needs a name character after the
    // angle bracket.
    const arithmetic = withStory(base(), 5, (story) => ({
      ...story,
      deck: "The contract came in at < 40 percent of the earlier estimate.",
    }));
    expect(findingsOf(arithmetic, rule)).toEqual([]);
  });

  it("structural/no-markup-in-text catches markup in every encoded form", () => {
    const rule = "structural/no-markup-in-text";

    // Hex numeric references are what an HTML encoder emits most often, so a
    // decimal-only pattern would miss the common case.
    for (const markup of [
      "<script>alert(1)</script>",
      "<b>bold</b>",
      "</p>",
      "<!-- an editor comment -->",
      "&lt;",
      "&amp;",
      "&nbsp;",
      "&#60;",
      "&#x3C;",
      "&#X3c;",
    ]) {
      const broken = withStory(base(), 5, (story) => ({
        ...story,
        deck: `A lighting contract ${markup} went to a supplier nearby.`,
      }));
      expect(findingsOf(broken, rule), markup).toHaveLength(1);
    }
  });

  it("structural/no-markup-in-text leaves ordinary prose alone", () => {
    const rule = "structural/no-markup-in-text";

    // Both of these are prose an editor may legitimately have written. Blocking
    // an edition for either would teach editors to route around the validator,
    // which is the failure `report.ts` names as worse than having no rule.
    for (const prose of [
      "Quarterly profits at AT&T; analysts said the margin held steady overall",
      "The ratio a<b held across every district measured this quarter overall",
      "Fees rose 5<10 percent depending on the district assessed this quarter",
      "The clause reads P&G; the filing named no other party in the district",
    ]) {
      const written = withStory(base(), 5, (story) => ({
        ...story,
        deck: prose,
      }));
      expect(findingsOf(written, rule), prose).toEqual([]);
    }
  });

  it("structural/no-markup-in-text covers publisher names and correction notes", () => {
    const rule = "structural/no-markup-in-text";
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    // PRD 6.2 renders the publisher name beside the link, so it is reader-
    // visible text and markup in it would reach a reader like any other.
    const inPublisher = withSource(base(), 3, (source) => ({
      ...source,
      publisher: "Sample <b>Publisher</b> 3",
    }));
    const publisherFindings = findingsOf(inPublisher, rule);
    expect(publisherFindings).toHaveLength(1);
    expect(publisherFindings[0]?.path).toBe("sources[3].publisher");

    // Section 46 requires a correction to be visible, which means it is
    // rendered, which means it is subject to the same rule.
    const edition = correctedBase();
    const inSummary: Edition = {
      ...edition,
      correctionNotes: edition.correctionNotes.map((note) => ({
        ...note,
        summary:
          "An earlier version misstated a figure &lt; the corrected one.",
      })),
    };
    const summaryFindings = findingsOf(inSummary, rule);
    expect(summaryFindings).toHaveLength(1);
    expect(summaryFindings[0]?.path).toBe("correctionNotes[0].summary");
    expect(summaryFindings[0]?.storyId).toBe("story-0");

    const inDetail: Edition = {
      ...edition,
      correctionNotes: edition.correctionNotes.map((note) => ({
        ...note,
        detail: "The figure came from <em>the previous meeting</em> minutes.",
      })),
    };
    const detailFindings = findingsOf(inDetail, rule);
    expect(detailFindings).toHaveLength(1);
    expect(detailFindings[0]?.path).toBe("correctionNotes[0].detail");
  });

  it("structural/disputed-requires-uncertainty keeps the disagreement visible", () => {
    const rule = "structural/disputed-requires-uncertainty";
    expect(findingsOf(base(), rule)).toEqual([]);

    // The schema would separately object that a disputed story needs two
    // sources; that is its rule, and this one is about the missing explanation.
    const broken = withStory(base(), 6, (story) => ({
      ...story,
      confidence: "disputed",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-6");

    const explained = withStory(broken, 6, (story) => ({
      ...story,
      uncertainty:
        "The two published figures use different baselines and neither is checkable yet.",
    }));
    expect(findingsOf(explained, rule)).toEqual([]);
  });

  it("structural/official-source-only-needs-official-label refuses to dress a statement as reporting", () => {
    const rule = "structural/official-source-only-needs-official-label";
    expect(findingsOf(base(), rule)).toEqual([]);

    const broken = withSource(base(), 7, (source) => ({
      ...source,
      sourceType: "official",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-7");

    const labelled = withStory(broken, 7, (story) => ({
      ...story,
      reportingType: "official",
    }));
    expect(findingsOf(labelled, rule)).toEqual([]);
  });
});

describe("diversity rules", () => {
  /** Sources 0..9 collapsed onto `count` publishers, two stories apiece. */
  function withPublisherCount(edition: Edition, count: number): Edition {
    return withEverySource(edition, (source, index) => ({
      ...source,
      publisher: `Shared Publisher ${Math.min(Math.floor(index / 2), count - 1)}`,
    }));
  }

  it("diversity/min-publishers holds the six-organization floor", () => {
    const rule = "diversity/min-publishers";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(withPublisherCount(base(), 5), rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();
    expect(found[0]?.message).toContain("5");
  });

  it("diversity/publisher-primary-cap counts the lead source of each core story", () => {
    const rule = "diversity/publisher-primary-cap";
    expect(findingsOf(base(), rule)).toEqual([]);

    // Three core stories now lead on one publisher; the cap is two.
    const broken = withEverySource(base(), (source, index) => ({
      ...source,
      publisher: index < 3 ? "Shared Publisher" : source.publisher,
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();
    expect(found[0]?.message).toContain("Shared Publisher");

    // Two is allowed, which is what makes the six-publisher floor achievable.
    const atTheCap = withEverySource(base(), (source, index) => ({
      ...source,
      publisher: index < 2 ? "Shared Publisher" : source.publisher,
    }));
    expect(findingsOf(atTheCap, rule)).toEqual([]);
  });

  it("diversity/publisher-concentration warns when one publisher carries the core", () => {
    const rule = "diversity/publisher-concentration";
    expect(findingsOf(base(), rule)).toEqual([]);

    const broken = withEverySource(base(), (source, index) => ({
      ...source,
      publisher: index < 3 ? "Shared Publisher" : source.publisher,
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("Shared Publisher");
  });

  it("separates the two readings: a publisher cited second is concentration, never the primary cap", () => {
    // Stories 0, 1 and 2 each lead on their own source and cite src-7 second,
    // so `Sample Publisher 7` supports four core stories but leads only one.
    // Both rules would agree on the fixtures above, where every story cites a
    // single source; only a non-first citation tells them apart.
    const edition = [0, 1, 2].reduce(
      (carried, index) =>
        withStory(carried, index, (story) => ({
          ...story,
          sourceIds: [`src-${index}`, "src-7"],
          sourceCount: 2,
        })),
      base(),
    );

    const concentration = findingsOf(
      edition,
      "diversity/publisher-concentration",
    );
    expect(concentration).toHaveLength(1);
    expect(concentration[0]?.message).toContain("Sample Publisher 7");
    expect(concentration[0]?.message).toContain("4 core stories");

    expect(findingsOf(edition, "diversity/publisher-primary-cap")).toEqual([]);
  });

  it("diversity/topic-cap allows three core stories on a topic and not four", () => {
    const rule = "diversity/topic-cap";
    expect(findingsOf(base(), rule)).toEqual([]);

    // The base already carries two `india` core stories.
    const atTheCap = withStory(base(), 2, (story) => ({
      ...story,
      topic: "india",
    }));
    expect(findingsOf(atTheCap, rule)).toEqual([]);

    const overTheCap = withStory(atTheCap, 3, (story) => ({
      ...story,
      topic: "india",
    }));
    const found = findingsOf(overTheCap, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("india");
  });

  it("diversity/all-hard-news fires only when every core story is hard news", () => {
    const rule = "diversity/all-hard-news";
    expect(findingsOf(base(), rule)).toEqual([]);

    const hardNewsHeadlines = [
      "Ceasefire holds along the northern front line",
      "Murder trial opens in the district court",
      "Flood warning issued for the lower delta",
      "Impeachment motion tabled in the assembly",
      "Earthquake damage assessed in three districts",
      "Arrest made over the depot robbery",
      "Protest march closes the central avenue",
      "Missile test confirmed by the defence ministry",
    ];

    // Seven of eight is not "entirely", which is the whole point of the rule:
    // one keyword false positive can never block an edition on its own.
    const almost = hardNewsHeadlines
      .slice(0, 7)
      .reduce(
        (edition, headline, index) =>
          withStory(edition, index, (story) => ({ ...story, headline })),
        base(),
      );
    expect(findingsOf(almost, rule)).toEqual([]);

    const entirely = hardNewsHeadlines.reduce(
      (edition, headline, index) =>
        withStory(edition, index, (story) => ({ ...story, headline })),
      base(),
    );
    const found = findingsOf(entirely, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();
  });
});

describe("duplicate rules", () => {
  /** Story 1 made to rest on story 0's only source. */
  function sharingOneSource(edition: Edition): Edition {
    return withStory(edition, 1, (story) => ({
      ...story,
      sourceIds: ["src-0"],
      sourceCount: 1,
    }));
  }

  /** Story 0 and story 1 rest on the given citation lists. */
  function citing(
    edition: Edition,
    first: readonly string[],
    second: readonly string[],
  ): Edition {
    const set = (ids: readonly string[]) => (story: Story) => ({
      ...story,
      sourceIds: [...ids],
      sourceCount: ids.length,
    });
    return withStory(withStory(edition, 0, set(first)), 1, set(second));
  }

  it("duplicate/shared-source-majority blocks one event told twice", () => {
    const rule = "duplicate/shared-source-majority";
    expect(findingsOf(base(), rule)).toEqual([]);

    // Two of the smaller story's two sources are the larger story's: as far as
    // the file can show, the same evidence twice.
    const found = findingsOf(
      citing(base(), ["src-0", "src-1"], ["src-0", "src-1", "src-2"]),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-1");
  });

  it("duplicate/shared-source-majority does not block on a single shared source", () => {
    const rule = "duplicate/shared-source-majority";

    // A budget document cited by both a tax story and a defence story is one
    // shared source, and half of a two-source story. The ratio alone would
    // block the edition for it, which is a false positive on a blocking rule.
    expect(findingsOf(sharingOneSource(base()), rule)).toEqual([]);
    expect(
      findingsOf(citing(base(), ["src-0", "src-2"], ["src-0"]), rule),
    ).toEqual([]);

    // Two shared is enough evidence to look at, but only above the ratio: two
    // of five is a pair of stories that mostly rest on different reporting.
    expect(
      findingsOf(
        citing(
          base(),
          ["src-0", "src-1", "src-2", "src-3", "src-4"],
          ["src-0", "src-1", "src-5", "src-6", "src-7"],
        ),
        rule,
      ),
    ).toEqual([]);
  });

  it("duplicate/shared-source warns about a source two stories both cite", () => {
    const rule = "duplicate/shared-source";
    expect(findingsOf(base(), rule)).toEqual([]);

    // Below the blocking threshold — the case the blocking rule deliberately
    // lets through — is exactly where this warning is the only report.
    const shared = sharingOneSource(base());
    expect(findingsOf(shared, "duplicate/shared-source-majority")).toEqual([]);
    const found = findingsOf(shared, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("src-0");

    // It also reports a source the blocking rule already objected to: the two
    // answer different questions, and a warning that went quiet because
    // another rule fired would make the shared-source list incomplete.
    const majority = citing(base(), ["src-0", "src-1"], ["src-0", "src-1"]);
    expect(
      findingsOf(majority, "duplicate/shared-source-majority"),
    ).toHaveLength(1);
    expect(
      findingsOf(majority, rule).map((finding) => finding.message),
    ).toEqual([
      "source src-0 is cited by 2 stories (story-0, story-1)",
      "source src-1 is cited by 2 stories (story-0, story-1)",
    ]);
  });

  it("duplicate/headline-similarity warns and never blocks", () => {
    const rule = "duplicate/headline-similarity";
    expect(findingsOf(base(), rule)).toEqual([]);

    const first = base().stories[0];
    const broken = withStory(base(), 1, (story) => ({
      ...story,
      headline: first?.headline ?? story.headline,
      deck: first?.deck ?? story.deck,
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-1");
    expect(
      EDITION_RULES.find((candidate) => candidate.id === rule)?.severity,
    ).toBe("warning");
  });

  it("duplicate/slug-similarity needs two shared words and half the vocabulary", () => {
    const rule = "duplicate/slug-similarity";
    expect(findingsOf(base(), rule)).toEqual([]);

    const broken = withStory(base(), 1, (story) => ({
      ...story,
      slug: "harbour-dredging-notice",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-1");

    // One shared word out of a wider vocabulary is ordinary and stays silent.
    const oneSharedWord = withStory(base(), 1, (story) => ({
      ...story,
      slug: "harbour-berth-fees-review",
    }));
    expect(findingsOf(oneSharedWord, rule)).toEqual([]);
  });
});

describe("length rules", () => {
  it("length/estimated-minutes demands the exact PRD arithmetic", () => {
    const rule = "length/estimated-minutes";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      { ...base(), estimatedMinutes: BASE_ESTIMATED_MINUTES + 1 },
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();

    // `background` is collapsed by default per PRD 6.2, so it is not visible
    // and cannot change the estimate however long it runs.
    const withBackground = withStory(base(), 0, (story) => ({
      ...story,
      background: wordsOfLength(200),
    }));
    expect(findingsOf(withBackground, rule)).toEqual([]);
  });

  it("length/estimated-minutes counts the two longest pooled stories, whatever the order", () => {
    // PRD 5.2 has a reader see eight core stories plus two from the pools, so
    // the estimate must pick two — and always the same two.
    const withPools: Edition = {
      ...base(),
      interestPools: {
        sports: ["pool-long", "pool-short"],
        "technology-ai": ["pool-middle"],
      },
      stories: [
        ...base().stories.slice(0, 8),
        pooledStory("pool-long", 100),
        pooledStory("pool-middle", 50),
        pooledStory("pool-short", 10),
      ],
    };
    const coreOnly: Edition = {
      ...withPools,
      interestPools: {},
    };

    // 100 + 50, never the 10-word one: the two longest and no more.
    expect(visibleWordsOf(withPools) - visibleWordsOf(coreOnly)).toBe(150);

    // Reversing the pool keys and the story array must not move the answer:
    // object key order and array order are both incidental to the file.
    const reversed: Edition = {
      ...withPools,
      interestPools: {
        "technology-ai": ["pool-middle"],
        sports: ["pool-short", "pool-long"],
      },
      stories: [...withPools.stories].reverse(),
    };
    expect(visibleWordsOf(reversed)).toBe(visibleWordsOf(withPools));
  });

  it("length/deck-one-line warns when the deck stops being one line", () => {
    const rule = "length/deck-one-line";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      withStory(base(), 2, (story) => ({
        ...story,
        deck: wordsOfLength(31),
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-2");
  });

  it("length/what-changed-paragraph-words warns on a long paragraph", () => {
    const rule = "length/what-changed-paragraph-words";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      withStory(base(), 3, (story) => ({
        ...story,
        whatChanged: [wordsOfLength(91)],
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-3");
    expect(found[0]?.path).toBe("stories[3].whatChanged[0]");
  });

  it("length/why-it-matters-one-paragraph warns past one paragraph", () => {
    const rule = "length/why-it-matters-one-paragraph";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      withStory(base(), 4, (story) => ({
        ...story,
        whyItMatters: wordsOfLength(81),
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-4");
  });
});

describe("url rules", () => {
  it("url/no-credentials keeps credentials out of published links", () => {
    const rule = "url/no-credentials";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      withSource(base(), 0, (source) => ({
        ...source,
        url: "https://reader:secret@example.test/sample-article-0",
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe("sources[0].url");
  });

  it("url/no-ip-literal rejects addresses nobody can attribute", () => {
    const rule = "url/no-ip-literal";
    expect(findingsOf(base(), rule)).toEqual([]);

    expect(
      findingsOf(
        withSource(base(), 0, (source) => ({
          ...source,
          url: "https://192.0.2.10/sample-article-0",
        })),
        rule,
      ),
    ).toHaveLength(1);

    expect(
      findingsOf(
        withSource(base(), 0, (source) => ({
          ...source,
          url: "https://[2001:db8::1]/sample-article-0",
        })),
        rule,
      ),
    ).toHaveLength(1);
  });

  it("url/no-private-host rejects hosts that resolve only inside a network", () => {
    const rule = "url/no-private-host";
    expect(findingsOf(base(), rule)).toEqual([]);

    for (const host of [
      "localhost",
      "cache.localhost",
      "archive.local",
      "wiki.internal",
      "router.home.arpa",
    ]) {
      const found = findingsOf(
        withSource(base(), 0, (source) => ({
          ...source,
          url: `https://${host}/sample-article-0`,
        })),
        rule,
      );
      expect(found, host).toHaveLength(1);
    }
  });

  it("url/mixed-host-classes catches invented sources beside real ones", () => {
    const rule = "url/mixed-host-classes";
    // An edition entirely on reserved domains is a deliberate artifact, and one
    // entirely on real domains is production content. Neither is a mixture.
    expect(findingsOf(base(), rule)).toEqual([]);
    expect(findingsOf(realHostBase(), rule)).toEqual([]);

    const found = findingsOf(
      withSource(base(), 0, (source) => ({
        ...source,
        url: "https://news.publisher-one.co/article",
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();

    for (const host of [
      "example.com",
      "archive.example.org",
      "publisher.invalid",
      "wire.test",
      "news.example",
    ]) {
      expect(
        findingsOf(
          withSource(realHostBase(), 0, (source) => ({
            ...source,
            url: `https://${host}/article`,
          })),
          rule,
        ),
        host,
      ).toHaveLength(1);
    }
  });

  it("url/mixed-host-classes names the sources in a stable order", () => {
    const rule = "url/mixed-host-classes";
    const mixed = withSource(
      withSource(realHostBase(), 1, (source) => ({
        ...source,
        url: "https://example.test/article",
      })),
      6,
      (source) => ({ ...source, url: "https://publisher.invalid/article" }),
    );
    const reversed: Edition = {
      ...mixed,
      sources: [...mixed.sources].reverse(),
    };

    // The report is a file a human diffs, so the same content must produce the
    // same bytes whatever order the sources happen to sit in.
    expect(findingsOf(reversed, rule)[0]?.message).toBe(
      findingsOf(mixed, rule)[0]?.message,
    );
  });

  it("treats a trailing dot as the same host it would be without one", () => {
    // `https://example.com./x` and `https://example.com/x` address the same
    // host, and the schema accepts both, so a classification that splits on the
    // dot is a way past every reserved and private host rule.
    const dotted = (edition: Edition, host: string): Edition =>
      withSource(edition, 0, (source) => ({
        ...source,
        url: `https://${host}/article`,
      }));

    const allReserved = withEverySource(base(), (source, index) => ({
      ...source,
      url: `https://example.test./sample-article-${index}`,
    }));
    expect(findingsOf(allReserved, "url/sample-data-hosts")).toHaveLength(1);

    expect(
      findingsOf(
        dotted(realHostBase(), "example.com."),
        "url/mixed-host-classes",
      ),
    ).toHaveLength(1);

    expect(
      findingsOf(dotted(base(), "intranet.internal."), "url/no-private-host"),
    ).toHaveLength(1);

    // The control: a real host is still real with a dot on the end, and the URL
    // parser already drops the dot from an IPv4 literal.
    const allReal = withEverySource(base(), (source, index) => ({
      ...source,
      url: `https://news-publisher-${index}.org./article`,
    }));
    expect(findingsOf(allReal, "url/sample-data-hosts")).toEqual([]);
    expect(findingsOf(allReal, "url/mixed-host-classes")).toEqual([]);
    expect(findingsOf(allReal, "url/no-private-host")).toEqual([]);
    expect(
      findingsOf(dotted(base(), "192.0.2.10."), "url/no-ip-literal"),
    ).toHaveLength(1);
  });

  it("url/sample-data-hosts says plainly that sample data is not publishable", () => {
    const rule = "url/sample-data-hosts";
    expect(findingsOf(realHostBase(), rule)).toEqual([]);

    const found = findingsOf(base(), rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("not publishable");
  });

  it("url/https-only warns about a plain http link", () => {
    const rule = "url/https-only";
    expect(findingsOf(base(), rule)).toEqual([]);

    const found = findingsOf(
      withSource(base(), 0, (source) => ({
        ...source,
        url: "http://example.test/sample-article-0",
      })),
      rule,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe("sources[0].url");
  });
});

describe("correction rules", () => {
  it("correction/status-requires-note refuses a correction with nothing on the record", () => {
    const rule = "correction/status-requires-note";
    expect(findingsOf(base(), rule)).toEqual([]);
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const found = findingsOf({ ...base(), status: "corrected" }, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBeUndefined();
  });

  it("correction/version-requires-note refuses an unexplained version bump", () => {
    const rule = "correction/version-requires-note";
    expect(findingsOf(base(), rule)).toEqual([]);
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const found = findingsOf({ ...base(), editionVersion: 2 }, rule);
    expect(found).toHaveLength(1);
  });

  it("correction/corrected-after-published rejects a correction predating publication", () => {
    const rule = "correction/corrected-after-published";
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const edition = correctedBase();
    const broken: Edition = {
      ...edition,
      correctionNotes: edition.correctionNotes.map((note) => ({
        ...note,
        correctedAt: "2026-08-13T05:00:00+05:30",
      })),
    };
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-0");
  });

  it("correction/corrected-within-updated rejects a correction after the last update", () => {
    const rule = "correction/corrected-within-updated";
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const edition = correctedBase();
    const broken: Edition = {
      ...edition,
      correctionNotes: edition.correctionNotes.map((note) => ({
        ...note,
        correctedAt: "2026-08-13T23:00:00+05:30",
      })),
    };
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-0");
  });

  it("correction/story-reflects-correction rejects a correction that changed nothing", () => {
    const rule = "correction/story-reflects-correction";
    expect(findingsOf(correctedBase(), rule)).toEqual([]);

    const broken = withStory(correctedBase(), 0, (story) => ({
      ...story,
      updatedAt: "2026-08-13T10:00:00+05:30",
    }));
    const found = findingsOf(broken, rule);
    expect(found).toHaveLength(1);
    expect(found[0]?.storyId).toBe("story-0");
  });
});
