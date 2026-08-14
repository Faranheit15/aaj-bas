/**
 * Pure product behavior for Aaj, Bas.
 *
 * AB-103 is the scoped backlog item this package was waiting for: edition
 * validation is the first concrete domain contract, deterministic and free of
 * network, filesystem, and UI dependencies as section 10 requires. Reading and
 * writing files belongs to `scripts/validate-edition.ts`; deciding what is wrong
 * with an edition belongs here.
 */

export type {
  EditionSource,
  EditionValidation,
  FindingSeverity,
  ValidationEditionJson,
  ValidationFinding,
  ValidationFindingJson,
  ValidationPolicy,
  ValidationReport,
  ValidationReportJson,
} from "./edition-validation";
export {
  exitCodeFor,
  formatValidationText,
  toValidationReportJson,
  VALIDATION_EXIT_CODES,
  validateEdition,
  validateEditions,
} from "./edition-validation";
