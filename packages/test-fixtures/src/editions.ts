/**
 * Deterministic edition fixtures for tests.
 *
 * These are the smallest editions that exercise the contract, not realistic
 * ones: eight core stories, two pooled, synthetic publishers on example.test.
 * The realistic ten-story edition with real publishers is AB-102 and lives in
 * `content/`, not here.
 *
 * Everything below is development sample data. No publisher text, headline, or
 * imagery is reproduced — section 18 rules that out even in fixtures, and a
 * fixture is exactly where a copied paragraph would go unnoticed.
 *
 * Section 10: production applications must not import this package at runtime.
 */
import type { Edition, Story, SourceReference } from "@aaj-bas/schemas";

const PUBLISHED_AT = "2026-08-13T06:00:00+05:30";
const STORY_AT = "2026-08-13T10:00:00+05:30";

/** Topics for the eight shared core stories, spread across the coverage areas. */
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

function sampleStory(index: number, topic: Story["topic"]): Story {
  return {
    id: `story-${index}`,
    slug: `sample-story-${index}`,
    topic,
    reportingType: "reporting",
    headline: `Sample development story ${index} for contract tests`,
    deck: `A one-line account of what changed in sample story ${index}.`,
    whatChanged: [
      `The first factual paragraph of sample story ${index}, written to be long enough to pass validation.`,
    ],
    whyItMatters: `Why sample story ${index} would matter to a reader, in one paragraph of development text.`,
    sourceIds: [`src-${index}`],
    sourceCount: 1,
    confidence: "single-source",
    firstPublishedAt: STORY_AT,
    updatedAt: STORY_AT,
    reviewed: true,
  };
}

function sampleSource(index: number): SourceReference {
  return {
    id: `src-${index}`,
    publisher: `Sample Publisher ${index}`,
    title: `Sample original headline ${index}`,
    url: `https://example.test/sample-article-${index}`,
    sourceType: "publisher",
    publishedAt: "2026-08-13T09:00:00+05:30",
  };
}

/**
 * A published edition that satisfies every rule in `editionSchema`.
 *
 * Returned fresh on each call so a test that mutates it cannot affect another.
 */
export function validEdition(): Edition {
  const stories: Story[] = [
    ...CORE_TOPICS.map((topic, index) => sampleStory(index, topic)),
    sampleStory(8, "sports"),
    sampleStory(9, "technology-ai"),
  ];

  return {
    schemaVersion: 1,
    date: "2026-08-13",
    editionVersion: 1,
    status: "published",
    publishedAt: PUBLISHED_AT,
    updatedAt: PUBLISHED_AT,
    estimatedMinutes: 7,
    coreStoryIds: CORE_TOPICS.map((_topic, index) => `story-${index}`),
    interestPools: {
      sports: ["story-8"],
      "technology-ai": ["story-9"],
    },
    stories,
    sources: stories.map((_story, index) => sampleSource(index)),
    correctionNotes: [],
  };
}

/** A corrected edition: version 2, carrying a visible correction note. */
export function correctedEdition(): Edition {
  const edition = validEdition();

  return {
    ...edition,
    editionVersion: 2,
    status: "corrected",
    updatedAt: "2026-08-13T18:45:00+05:30",
    correctionNotes: [
      {
        id: "cor-1",
        storyId: "story-0",
        correctedAt: "2026-08-13T18:40:00+05:30",
        editionVersion: 2,
        summary:
          "An earlier version of this development fixture misstated a figure.",
      },
    ],
  };
}

/**
 * Editions that must fail validation, each breaking exactly one rule.
 *
 * Keyed by what is wrong so a failing test names the rule rather than a number.
 * Typed `unknown` because several are not valid `Edition` values at all, which
 * is the point.
 */
export const invalidEditions: Readonly<Record<string, unknown>> = {
  "story cites a source the edition does not carry": {
    ...validEdition(),
    sources: validEdition().sources.slice(1),
  },
  "core holds seven stories instead of eight": {
    ...validEdition(),
    coreStoryIds: validEdition().coreStoryIds.slice(0, 7),
  },
  "two stories share an id": (() => {
    const edition = validEdition();
    const [duplicated] = edition.stories;
    return {
      ...edition,
      stories: [
        ...edition.stories.slice(0, 9),
        { ...duplicated, id: "story-9" },
      ],
    };
  })(),
  "reporting type is not one the product labels": (() => {
    const edition = validEdition();
    const [first, ...rest] = edition.stories;
    return {
      ...edition,
      stories: [{ ...first, reportingType: "explainer" }, ...rest],
    };
  })(),
  "edition date does not exist": { ...validEdition(), date: "2026-02-30" },
  "published edition contains an unreviewed story": (() => {
    const edition = validEdition();
    const [first, ...rest] = edition.stories;
    return { ...edition, stories: [{ ...first, reviewed: false }, ...rest] };
  })(),
  "pooled story does not match its interest": {
    ...validEdition(),
    interestPools: { sports: ["story-9"], "technology-ai": ["story-8"] },
  },
  "schema version is not the one this contract describes": {
    ...validEdition(),
    schemaVersion: 2,
  },
};
