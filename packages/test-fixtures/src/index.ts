/**
 * Deterministic test-only fixtures.
 *
 * Section 10: production applications must not import this package at runtime.
 * Section 29: tests depend on these rather than on live feeds, live models, or
 * network availability.
 */
export {
  correctedEdition,
  invalidEditions,
  validEdition,
} from "./editions";
