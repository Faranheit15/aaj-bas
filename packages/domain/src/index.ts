export type {
  AddressReach,
  IpAddress,
} from "./public-address";
export {
  classifyAddress,
  isPubliclyRoutable,
  parseIpAddress,
} from "./public-address";
export type { HostReach } from "./public-address";
export { canonicalHostname, classifyHostname } from "./public-address";
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
export type { PrecachePlan } from "./service-worker";
export { buildIdFor, planPrecache } from "./service-worker";
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
  SourcesCommand,
  SourceStatus,
} from "./source-registry";
export {
  formatRegistryText,
  parseSourcesCommand,
  PERMITTED_USES,
  permittedUseSchema,
  REGISTRY_EXIT_CODES,
  registryExitCodeFor,
  sourceEntrySchema,
  sourceLanguageSchema,
  SOURCE_LANGUAGES,
  sourceRegionSchema,
  SOURCE_REGIONS,
  sourceRegistrySchema,
  toRegistryReportJson,
  validateSourceRegistries,
  validateSourceRegistry,
} from "./source-registry";
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
export type {
  FeedItemNormalizationOptions,
  NormalizedFeedItem,
  RawFeedItem,
} from "./feed-normalization";
export {
  canonicalizeUrl,
  contentHashFor,
  deduplicateFeedItems,
  FEED_ITEM_NORMALIZATION_DEFAULTS,
  normalizeFeedDate,
  normalizeFeedItem,
  normalizeFeedItems,
  sanitizeHtmlToText,
} from "./feed-normalization";
export type {
  EvaluateSourceHealthOptions,
  FetchSourcesCommand,
  FetchSourcesCommandError,
  FetchSourcesCommandResult,
  SourceFetchMeasurement,
  SourceFetchResultInput,
  SourceHealthRecord,
  SourceHealthReport,
  SourceHealthStatus,
  SourceHealthThresholds,
  SourceHealthWarning,
  SourceHealthWarningRule,
} from "./source-health";
export {
  evaluateSourceHealth,
  formatSourceHealthJson,
  formatSourceHealthMarkdown,
  formatSourceHealthText,
  parseFetchSourcesCommand,
  SOURCE_HEALTH_DEFAULTS,
} from "./source-health";
export type {
  DeduplicationOptions,
  DuplicateMatchResult,
  ExactDuplicateReason,
  GoldenDuplicateTestCase,
  TitleTokens,
} from "./deduplication";
export {
  calculateDiceCoefficient,
  calculateTimeDeltaHours,
  calculateTitleSimilarity,
  classifyDuplicate,
  cleanTitle,
  DEDUPLICATION_DEFAULTS,
  findCommonTokens,
  getExactDuplicateReason,
  GOLDEN_DUPLICATE_DATASET,
  hasNumericConflict,
  isExactDuplicate,
  isNearDuplicate,
  tokenizeTitle,
} from "./deduplication";
export type {
  ClusteringOptions,
  ClusterMergeReason,
  ClusterMergeReasonType,
  RepresentativeTitleResult,
  SemanticClusteringProvider,
  SemanticMergeDecision,
  StoryCluster,
} from "./clustering";
export {
  clusterFeedItems,
  clusterFeedItemsAsync,
  CLUSTERING_DEFAULTS,
  NoopSemanticClusteringProvider,
  selectRepresentativeTitle,
} from "./clustering";
export type {
  CandidateFeatureScores,
  CandidateRankingResult,
  FeatureWeights,
  RankedStoryCandidate,
  RankingOptions,
  SelectionDecisionReason,
  SelectionDecisionType,
  SelectionReasonCode,
} from "./candidate-ranking";
export {
  calculateCompositeScore,
  calculateCorroborationScore,
  calculateIndiaRelevanceScore,
  calculateRecencyScore,
  calculateRepetitionPenalty,
  calculateSourceTierScore,
  calculateTopicWeight,
  classifyStoryTopic,
  composeEditionCandidates,
  RANKING_DEFAULTS,
  rankAndComposeCandidates,
} from "./candidate-ranking";
export type {
  PromptExtractedFacts,
  PromptSummaryResult,
  SentenceWithSources,
  StorySummarizer,
  StorySummarizerInput,
  StorySummarizerOutput,
  SummarizerConfig,
  SummarizerOptions,
} from "./summarization";
export {
  CloudflareWorkersAiSummarizer,
  compileSummarizePrompt,
  convertPromptResultToStory,
  createSummarizer,
  DeterministicFallbackSummarizer,
  parsePromptSummaryResult,
  promptSummaryResultSchema,
  SUMMARIZE_PROMPT_VERSION,
  SUMMARIZER_DEFAULTS,
} from "./summarization";
export type {
  FactualExtractedTokens,
  FactualFinding,
  FactualFindingJson,
  FactualFindingSeverity,
  FactualRuleId,
  FactualValidationOptions,
  FactualValidationReport,
  FactualValidationReportJson,
  StoryFactualValidation,
  StoryFactualValidationJson,
} from "./factual-validation";
export {
  checkDateContainment,
  checkEditorialAlignment,
  checkEntityContainment,
  checkNumberContainment,
  checkSourceAttribution,
  checkUncertaintyOnConflict,
  COMMON_INITIAL_WORDS,
  extractDates,
  extractFactTokens,
  extractNamedEntities,
  extractNumbers,
  FACTUAL_VALIDATION_DEFAULTS,
  formatFactualValidationMarkdown,
  formatFactualValidationText,
  getClusterFullText,
  getStoryFullText,
  normalizeNumberToken,
  toFactualValidationReportJson,
  validateFactualSupport,
  validateStoryFactualSupport,
} from "./factual-validation";
