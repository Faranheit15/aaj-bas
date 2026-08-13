/**
 * Public content contracts for Aaj, Bas.
 *
 * This package is the single source of truth for the shape of published
 * content, per section 16. Applications derive their types from here and never
 * restate them; an interface copied into an app is a second contract that will
 * disagree with this one eventually.
 *
 * Zod is the only dependency, and section 10 keeps it that way: no React, no
 * browser APIs, no application packages.
 */
export {
  CORE_STORY_COUNT,
  EDITION_STATUSES,
  INTEREST_STORY_COUNT,
  editionSchema,
  editionStatusSchema,
} from "./edition";
export type { Edition, EditionStatus } from "./edition";

export { correctionNoteSchema } from "./correction-note";
export type { CorrectionNote } from "./correction-note";

export { editionDateSchema, timestampSchema } from "./dates";
export type { EditionDate, Timestamp } from "./dates";

export { boundedText, identifierSchema } from "./identifiers";
export type { Identifier } from "./identifiers";

export { editionJsonSchema } from "./json-schema";

export {
  INTEREST_SLUGS,
  TOPIC_SLUGS,
  interestSlugSchema,
  topicSlugSchema,
} from "./slugs";
export type { InterestSlug, TopicSlug } from "./slugs";

export {
  SOURCE_TYPES,
  sourceReferenceSchema,
  sourceTypeSchema,
  sourceUrlSchema,
} from "./source-reference";
export type { SourceReference, SourceType } from "./source-reference";

export {
  CONFIDENCE_LEVELS,
  REPORTING_TYPES,
  confidenceSchema,
  reportingTypeSchema,
  storySchema,
} from "./story";
export type { Confidence, ReportingType, Story } from "./story";
