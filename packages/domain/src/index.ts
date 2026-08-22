/**
 * Pure product behavior for Aaj, Bas.
 *
 * AB-103 is the scoped backlog item this package was waiting for: edition
 * validation is the first concrete domain contract, deterministic and free of
 * network, filesystem, and UI dependencies as section 10 requires. Reading and
 * writing files belongs to `scripts/validate-edition.ts`; deciding what is wrong
 * with an edition belongs here.
 *
 * AB-201 adds the second contract on the same split: `scripts/stage-content.ts`
 * copies bytes and deletes files, while deciding which validated editions a
 * build may carry, what pointer to write for them, and which already-staged
 * files must go first, belongs here.
 *
 * AB-401 adds `public-address`, which is not that split but the other kind of
 * shared contract: one place that decides whether a host is on the public
 * internet, because the URL rules and the source registry both have to ask, and
 * a security check with two implementations has two answers.
 *
 * AB-206 adds the third, and it is the same split once more:
 * `scripts/build-service-worker.ts` scans a built directory and writes one
 * file, while deciding which of those files a service worker may install --
 * never published content, which corrections rewrite in place -- and what to
 * call the build they came from, belongs here.
 */

export type {
  SkippedEdition,
  StagedEdition,
  StagedIndexValidation,
  StagingMode,
  StagingPlan,
  StagingRemoval,
} from "./content-staging";
export {
  planRemoval,
  planStaging,
  validateStagedIndex,
} from "./content-staging";
export type {
  AddressReach,
  HostReach,
  IpAddress,
} from "./public-address";
export {
  canonicalHostname,
  classifyAddress,
  classifyHostname,
  isPubliclyRoutable,
  parseIpAddress,
} from "./public-address";
export type { PrecachePlan } from "./service-worker";
export { buildIdFor, planPrecache } from "./service-worker";
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

export type {
  ActiveSourceEntry,
  PermittedUse,
  RegistryFinding,
  RegistryFindingJson,
  RegistryFindingSeverity,
  RegistryReport,
  RegistryReportJson,
  RegistrySource,
  RegistrySourceJson,
  RegistryValidation,
  SourceEntry,
  SourceLanguage,
  SourceRegion,
  SourceRegistry,
  SourceStatus,
} from "./source-registry";
export {
  formatRegistryText,
  PERMITTED_USES,
  permittedUseSchema,
  REGISTRY_EXIT_CODES,
  registryExitCodeFor,
  SOURCE_LANGUAGES,
  SOURCE_REGIONS,
  sourceEntrySchema,
  sourceLanguageSchema,
  sourceRegionSchema,
  sourceRegistrySchema,
  toRegistryReportJson,
  validateSourceRegistries,
  validateSourceRegistry,
} from "./source-registry";
export type { SourcesCommand } from "./source-registry/command";
export { parseSourcesCommand } from "./source-registry/command";
export type {
  FeedCacheValidators,
  FeedFetchEnvironment,
  FeedFetchFailure,
  FeedFetchFailureCode,
  FeedFetchNotModified,
  FeedFetchOptions,
  FeedFetchResult,
  FeedFetchSuccess,
  FeedResolver,
  FeedTransport,
  FeedTransportFailure,
  FeedTransportFailureCode,
  FeedTransportRequest,
  FeedTransportResponse,
  FeedTransportResult,
  FetchableSource,
  FetchableSourceStatus,
  ResolvedFeedAddress,
} from "./source-fetching";
export {
  FEED_FETCH_DEFAULTS,
  fetchableSourceOf,
  fetchableSourcesOf,
  fetchFeed,
  fetchFeeds,
} from "./source-fetching";
