/**
 * The words a reader sees for each editorial vocabulary.
 *
 * Every map below is a `Record` over the schema's own constant rather than a
 * loose object, so adding a slug in `packages/schemas` fails to compile here
 * until it has a label. That is the whole point of this file: the alternative,
 * a lookup with a fallback, ships raw kebab-case to a reader on the day the
 * vocabulary grows and nobody notices until it is published.
 *
 * The strings are the PRD's own rather than new copy. TOPIC_LABELS carries PRD
 * section 5.3's wording so AB-204's interest picker can reuse this map instead
 * of inventing a second vocabulary for the same topics.
 */
import type {
  Confidence,
  CorrectionNote,
  ReportingType,
  SourceType,
  Story,
  TopicSlug,
} from "@aaj-bas/schemas";

/** PRD section 5.3's names for the topics, shared with the interest picker. */
export const TOPIC_LABELS: Record<TopicSlug, string> = {
  india: "India",
  world: "World",
  "business-economy": "Business & Economy",
  "science-health-climate": "Science, Health & Climate",
  "technology-ai": "Technology & AI",
  "culture-entertainment": "Culture & Entertainment",
  sports: "Sports",
  "policy-geopolitics": "Policy & Geopolitics",
};

/** PRD section 6.3, verbatim. */
export const REPORTING_TYPE_LABELS: Record<ReportingType, string> = {
  reporting: "Reporting",
  analysis: "Analysis",
  opinion: "Opinion",
  official: "Official statement",
  research: "Research",
};

/**
 * Complete statements, so that no "Confidence:" key word is needed. A card
 * reading "Confidence: single-source" invites the label to be read as a quality
 * score for the story; "Based on one source" says only what it says.
 *
 * `disputed` is the one that matters. Section 22 requires disagreement between
 * sources to be preserved rather than resolved, so this label must never soften
 * towards consensus, and it must never be styled as a warning — sources
 * disagreeing is a fact about the reporting, not a defect in the story.
 */
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  "single-source": "Based on one source",
  "multi-source": "Based on multiple sources",
  disputed: "Sources disagree",
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  publisher: "News publisher",
  primary: "Primary source",
  research: "Research",
  official: "Official source",
};

/** The collapsed card's source count, in PRD section 6.1's wording. */
export function sourceCountLabel(count: number): string {
  return count === 1 ? "single source" : `${count} sources`;
}

/**
 * The collapsed card's update marker, or null when there is nothing to mark.
 *
 * Most specific wins: a corrected story reads as corrected rather than merely
 * updated, because section 46 makes a correction a visible published event and
 * "Updated" would quietly understate it.
 *
 * The two timestamps are compared as instants. Stamps written in different UTC
 * offsets can be the same moment and still sort the wrong way as strings, which
 * would mark an unchanged story as updated. Nothing here reads a clock.
 */
export function updateMarkerFor(
  story: Story,
  corrections: readonly CorrectionNote[],
): string | null {
  if (corrections.some((note) => note.storyId === story.id)) {
    return "Corrected";
  }

  if (Date.parse(story.updatedAt) > Date.parse(story.firstPublishedAt)) {
    return "Updated";
  }

  return null;
}
