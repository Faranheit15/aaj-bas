import { describe, expect, it } from "vitest";
import { CORE_STORY_COUNT, editionSchema } from "./edition";

/**
 * The smallest edition the contract allows: eight core stories and two pooled
 * ones, so a reader can reach ten. Every test below starts here and breaks one
 * thing, which keeps each failure attributable to the rule under test.
 */
const CORE_TOPICS = [
  "india",
  "india",
  "world",
  "business-economy",
  "science-health-climate",
  "technology-ai",
  "culture-entertainment",
  "policy-geopolitics",
] as const;

function story(index: number, topic: string): Record<string, unknown> {
  return {
    id: `story-${index}`,
    slug: `story-${index}-slug`,
    topic,
    reportingType: "reporting",
    headline: `Something verifiable happened, number ${index}`,
    deck: `A one-line account of what changed in story ${index}.`,
    whatChanged: [
      `The first factual paragraph for story ${index}, long enough to be real.`,
    ],
    whyItMatters: `Why story ${index} matters to a reader, in one paragraph.`,
    sourceIds: [`src-${index}`],
    sourceCount: 1,
    confidence: "single-source",
    firstPublishedAt: "2026-08-13T10:00:00+05:30",
    updatedAt: "2026-08-13T10:00:00+05:30",
    reviewed: true,
  };
}

function source(index: number): Record<string, unknown> {
  return {
    id: `src-${index}`,
    publisher: `Publisher ${index}`,
    title: `Original headline ${index}`,
    url: `https://example.test/article-${index}`,
    sourceType: "publisher",
    publishedAt: "2026-08-13T09:00:00+05:30",
  };
}

function validEdition(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const stories = [
    ...CORE_TOPICS.map((topic, index) => story(index, topic)),
    story(8, "sports"),
    story(9, "technology-ai"),
  ];

  return {
    schemaVersion: 1,
    date: "2026-08-13",
    editionVersion: 1,
    status: "published",
    publishedAt: "2026-08-13T06:00:00+05:30",
    updatedAt: "2026-08-13T06:00:00+05:30",
    estimatedMinutes: 7,
    coreStoryIds: CORE_TOPICS.map((_topic, index) => `story-${index}`),
    interestPools: {
      sports: ["story-8"],
      "technology-ai": ["story-9"],
    },
    stories,
    sources: stories.map((_entry, index) => source(index)),
    correctionNotes: [],
    ...overrides,
  };
}

function messages(result: {
  error?: { issues: readonly { message: string }[] };
}): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("editionSchema", () => {
  it("accepts the smallest valid edition", () => {
    const result = editionSchema.safeParse(validEdition());
    expect(messages(result)).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("pins the schema version", () => {
    // A reader built for version 1 must be able to refuse an edition it does
    // not understand rather than half-render it.
    expect(
      editionSchema.safeParse(validEdition({ schemaVersion: 2 })).success,
    ).toBe(false);
  });

  describe("reaching ten stories", () => {
    it("requires exactly eight core stories", () => {
      const edition = validEdition();
      const coreStoryIds = (edition["coreStoryIds"] as string[]).slice(0, 7);
      const result = editionSchema.safeParse({ ...edition, coreStoryIds });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        `an edition needs exactly ${CORE_STORY_COUNT} core stories, found 7`,
      );
    });

    it("requires the pools to offer at least two stories", () => {
      // Eight core plus one pooled story is nine. The reader cannot reach ten,
      // whatever they choose. story-9 is dropped entirely so this fails on the
      // pool size rather than on the orphan rule.
      const edition = validEdition();
      const result = editionSchema.safeParse({
        ...edition,
        interestPools: { sports: ["story-8"] },
        stories: (edition["stories"] as Record<string, unknown>[]).slice(0, 9),
        sources: (edition["sources"] as Record<string, unknown>[]).slice(0, 9),
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "the core and pools together reach 9 stories, short of 10",
      );
    });

    it("rejects a story listed in both the core and a pool", () => {
      const result = editionSchema.safeParse(
        validEdition({
          interestPools: {
            sports: ["story-8"],
            "technology-ai": ["story-9", "story-5"],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "story story-5 is already a core story",
      );
    });

    it("rejects a story that no reader can reach", () => {
      const edition = validEdition();
      const result = editionSchema.safeParse({
        ...edition,
        interestPools: { sports: ["story-8"], "technology-ai": ["story-9"] },
        stories: [
          ...(edition["stories"] as Record<string, unknown>[]),
          story(10, "world"),
        ],
        sources: [
          ...(edition["sources"] as Record<string, unknown>[]),
          source(10),
        ],
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "story story-10 is in neither the core nor any pool",
      );
    });
  });

  describe("source mapping", () => {
    it("rejects a story citing a source the edition does not carry", () => {
      // The failure this schema exists to catch: the story renders, the claim
      // is made, and there is nothing for the reader to check it against.
      const edition = validEdition();
      const result = editionSchema.safeParse({
        ...edition,
        sources: (edition["sources"] as Record<string, unknown>[]).slice(1),
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "story story-0 cites source src-0, which is not in sources",
      );
    });

    it("rejects a core story id that is not a story", () => {
      const result = editionSchema.safeParse(
        validEdition({
          coreStoryIds: [
            "story-0",
            "story-1",
            "story-2",
            "story-3",
            "story-4",
            "story-5",
            "story-6",
            "story-missing",
          ],
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "core story story-missing is not in stories",
      );
    });

    it("rejects a pooled story id that is not a story", () => {
      const result = editionSchema.safeParse(
        validEdition({
          interestPools: {
            sports: ["story-8", "story-absent"],
            "technology-ai": ["story-9"],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "pooled story story-absent is not in stories",
      );
    });
  });

  describe("interest pools", () => {
    it("rejects a pooled story whose topic is not that interest", () => {
      // Choosing an interest promises more stories of that topic. This is the
      // only thing keeping the promise and the data in agreement.
      const result = editionSchema.safeParse(
        validEdition({
          interestPools: {
            sports: ["story-9"],
            "technology-ai": ["story-8"],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "story story-9 has topic technology-ai, so it cannot sit in the sports pool",
      );
    });

    it("rejects a pool keyed by a topic no reader can choose", () => {
      const result = editionSchema.safeParse(
        validEdition({
          interestPools: { india: ["story-0"], sports: ["story-8"] },
        }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects a declared but empty pool", () => {
      const result = editionSchema.safeParse(
        validEdition({
          interestPools: {
            sports: ["story-8"],
            "technology-ai": ["story-9"],
            "culture-entertainment": [],
          },
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "the culture-entertainment pool is declared but empty",
      );
    });
  });

  describe("duplicate identifiers", () => {
    it("rejects two stories sharing an id", () => {
      const edition = validEdition();
      const stories = edition["stories"] as Record<string, unknown>[];
      const result = editionSchema.safeParse({
        ...edition,
        stories: [...stories.slice(0, 9), { ...stories[9], id: "story-8" }],
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain("duplicate story id story-8");
    });

    it("rejects two sources sharing an id", () => {
      const edition = validEdition();
      const sources = edition["sources"] as Record<string, unknown>[];
      const result = editionSchema.safeParse({
        ...edition,
        sources: [...sources.slice(0, 9), { ...sources[9], id: "src-8" }],
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain("duplicate source id src-8");
    });

    it("rejects the same story listed twice in the core", () => {
      const result = editionSchema.safeParse(
        validEdition({
          coreStoryIds: [
            "story-0",
            "story-0",
            "story-2",
            "story-3",
            "story-4",
            "story-5",
            "story-6",
            "story-7",
          ],
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain("core story story-0 is listed twice");
    });
  });

  describe("publication and corrections", () => {
    it("refuses to publish an unreviewed story", () => {
      // Section 20 keeps a human in front of publication. Without this the
      // review gate is a convention rather than a check.
      const edition = validEdition();
      const stories = edition["stories"] as Record<string, unknown>[];
      const result = editionSchema.safeParse({
        ...edition,
        stories: [{ ...stories[0], reviewed: false }, ...stories.slice(1)],
      });

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "story story-0 is unreviewed, so this edition cannot be published",
      );
    });

    it("allows an unreviewed story in a draft", () => {
      const edition = validEdition();
      const stories = edition["stories"] as Record<string, unknown>[];
      const result = editionSchema.safeParse({
        ...edition,
        status: "draft",
        stories: [{ ...stories[0], reviewed: false }, ...stories.slice(1)],
      });

      expect(result.success).toBe(true);
    });

    it("accepts a corrected edition", () => {
      const result = editionSchema.safeParse(
        validEdition({
          status: "corrected",
          editionVersion: 2,
          updatedAt: "2026-08-13T18:45:00+05:30",
          correctionNotes: [
            {
              id: "cor-1",
              storyId: "story-0",
              correctedAt: "2026-08-13T18:40:00+05:30",
              editionVersion: 2,
              summary:
                "An earlier version misstated the figure. It now reads 6.5%.",
            },
          ],
        }),
      );
      expect(messages(result)).toEqual([]);
      expect(result.success).toBe(true);
    });

    it("rejects corrections on an edition that does not admit to them", () => {
      const result = editionSchema.safeParse(
        validEdition({
          correctionNotes: [
            {
              id: "cor-1",
              storyId: "story-0",
              correctedAt: "2026-08-13T18:40:00+05:30",
              editionVersion: 2,
              summary:
                "An earlier version misstated the figure. It now reads 6.5%.",
            },
          ],
        }),
      );

      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "an edition carrying corrections must have status corrected",
      );
      expect(messages(result)).toContain(
        "a corrected edition must be at least version 2",
      );
    });

    it("rejects a correction pointing at a story the edition lacks", () => {
      const result = editionSchema.safeParse(
        validEdition({
          status: "corrected",
          editionVersion: 2,
          correctionNotes: [
            {
              id: "cor-1",
              storyId: "story-gone",
              correctedAt: "2026-08-13T18:40:00+05:30",
              editionVersion: 2,
              summary:
                "An earlier version misstated the figure. It now reads 6.5%.",
            },
          ],
        }),
      );
      expect(result.success).toBe(false);
      expect(messages(result)).toContain(
        "correction cor-1 refers to story story-gone, which is not in stories",
      );
    });
  });

  describe("dates", () => {
    it("rejects an impossible edition date", () => {
      expect(
        editionSchema.safeParse(validEdition({ date: "2026-02-30" })).success,
      ).toBe(false);
    });

    it("rejects an update recorded before publication", () => {
      expect(
        editionSchema.safeParse(
          validEdition({ updatedAt: "2026-08-13T05:00:00+05:30" }),
        ).success,
      ).toBe(false);
    });
  });
});
