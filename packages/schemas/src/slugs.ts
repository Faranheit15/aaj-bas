/**
 * The editorial vocabularies.
 *
 * Topics and interests deliberately share one vocabulary: `InterestSlug` is a
 * strict subset of `TopicSlug`, so an interest boost means nothing more than
 * "more stories whose topic is this". A separate interest taxonomy joined to
 * topics by a mapping table would put an editorial decision inside a lookup
 * nobody reads, which section 22 forbids — ranking must stay inspectable.
 *
 * `india` and `world` are topics with no matching interest. PRD section 5.3 is
 * explicit that India belongs to the shared core and is not something a reader
 * opts into, and world affairs is core coverage for the same reason.
 *
 * These slugs are written into every published edition. Renaming one is a
 * content migration across the archive, not a refactor.
 */
import { z } from "zod";

/** Editorial topics, from PRD section 5.2 coverage plus the interest areas. */
export const TOPIC_SLUGS = [
  "india",
  "world",
  "business-economy",
  "science-health-climate",
  "technology-ai",
  "culture-entertainment",
  "sports",
  "policy-geopolitics",
] as const;

export const topicSlugSchema = z.enum(TOPIC_SLUGS);
export type TopicSlug = z.infer<typeof topicSlugSchema>;

/** The interest boosts a reader may choose, from PRD section 5.3. */
export const INTEREST_SLUGS = [
  "business-economy",
  "science-health-climate",
  "technology-ai",
  "culture-entertainment",
  "sports",
  "policy-geopolitics",
] as const;

export const interestSlugSchema = z.enum(INTEREST_SLUGS);
export type InterestSlug = z.infer<typeof interestSlugSchema>;

// Adding an interest that is not also a topic must fail to compile here.
// Without it the subset relationship is a comment rather than a guarantee, and
// interest pools could reference a topic no story can carry.
const _interestsAreTopics: readonly TopicSlug[] = INTEREST_SLUGS;
