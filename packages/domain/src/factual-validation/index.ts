export {
  checkDateContainment,
  checkEditorialAlignment,
  checkEntityContainment,
  checkNumberContainment,
  checkSourceAttribution,
  checkUncertaintyOnConflict,
  getClusterFullText,
  getStoryFullText,
} from "./containment";
export {
  COMMON_INITIAL_WORDS,
  extractDates,
  extractFactTokens,
  extractNamedEntities,
  extractNumbers,
  normalizeNumberToken,
} from "./extractors";
export {
  type FactualFindingJson,
  type FactualValidationReportJson,
  type StoryFactualValidationJson,
  toFactualValidationReportJson,
} from "./format-json";
export { formatFactualValidationMarkdown } from "./format-markdown";
export { formatFactualValidationText } from "./format-text";
export {
  FACTUAL_VALIDATION_DEFAULTS,
  type FactualExtractedTokens,
  type FactualFinding,
  type FactualFindingSeverity,
  type FactualRuleId,
  type FactualValidationOptions,
  type FactualValidationReport,
  type StoryFactualValidation,
} from "./types";
export {
  validateFactualSupport,
  validateStoryFactualSupport,
} from "./validator";
