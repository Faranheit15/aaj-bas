export {
  calculateTimeDeltaHours,
  classifyDuplicate,
  getExactDuplicateReason,
  isExactDuplicate,
  isNearDuplicate,
} from "./duplicate";
export { GOLDEN_DUPLICATE_DATASET } from "./golden";
export type { GoldenDuplicateTestCase } from "./golden";
export {
  calculateDiceCoefficient,
  calculateTitleSimilarity,
  findCommonTokens,
  hasNumericConflict,
} from "./similarity";
export { cleanTitle, tokenizeTitle } from "./tokens";
export type {
  DeduplicationOptions,
  DuplicateMatchResult,
  ExactDuplicateReason,
  TitleTokens,
} from "./types";
export { DEDUPLICATION_DEFAULTS } from "./types";
