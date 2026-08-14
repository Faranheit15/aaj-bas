/**
 * Edition validation: the rules `bun run content:validate` runs, and the two
 * ways it reports them.
 *
 * The public surface is deliberately four functions and the vocabulary they
 * speak. Rule implementations stay internal, because a caller reaching for one
 * rule directly would be building a second, quieter definition of valid --
 * exactly what section 45 forbids. There is one entry point per question: what
 * is wrong with this content, how do I read it, how does a machine read it, and
 * what should the process exit with.
 */

export type {
  ValidationEditionJson,
  ValidationFindingJson,
  ValidationReportJson,
} from "./format-json";

export { toValidationReportJson } from "./format-json";
export { formatValidationText } from "./format-text";
export type {
  EditionValidation,
  FindingSeverity,
  ValidationFinding,
  ValidationPolicy,
  ValidationReport,
} from "./report";
export { exitCodeFor, VALIDATION_EXIT_CODES } from "./report";
export type { EditionSource } from "./validate";
export { validateEdition, validateEditions } from "./validate";
