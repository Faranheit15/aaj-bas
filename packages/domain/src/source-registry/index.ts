/**
 * The source registry: the contract a registry file must satisfy, the rules it
 * must pass, and the two ways a run reports them.
 *
 * The public surface is the schema, one entry point per question -- what is
 * wrong with this registry, how does a human read it, how does a machine read
 * it, what should the process exit with -- and the vocabulary they speak.
 * Individual rules stay internal: a caller reaching for one rule directly would
 * be building a second, quieter definition of "a source we may fetch", which is
 * the thing this module exists to have exactly one of.
 */

export type {
  RegistryFindingJson,
  RegistryReportJson,
  RegistrySourceJson,
} from "./format-json";
export { toRegistryReportJson } from "./format-json";
export { formatRegistryText } from "./format-text";
export type {
  ActiveSourceEntry,
  PermittedUse,
  SourceEntry,
  SourceLanguage,
  SourceRegion,
  SourceRegistry,
} from "./registry";
export {
  PERMITTED_USES,
  SOURCE_LANGUAGES,
  SOURCE_REGIONS,
  permittedUseSchema,
  sourceEntrySchema,
  sourceLanguageSchema,
  sourceRegionSchema,
  sourceRegistrySchema,
} from "./registry";
export type {
  RegistryFinding,
  RegistryFindingSeverity,
  RegistryReport,
  RegistryValidation,
  SourceStatus,
} from "./report";
export { REGISTRY_EXIT_CODES, registryExitCodeFor } from "./report";
export type { RegistrySource } from "./validate";
export { validateSourceRegistries, validateSourceRegistry } from "./validate";
export type { SourcesCommand } from "./command";
export { parseSourcesCommand } from "./command";
