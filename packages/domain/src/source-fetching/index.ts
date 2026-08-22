/**
 * Source-fetching policy and the runtime boundary it requires.
 *
 * The actual DNS and HTTPS adapter lives in scripts/fetch-sources.ts; this
 * package remains free of filesystem and network access so the security policy
 * can be exercised with deterministic fixtures.
 */
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
  ResolvedFeedAddress,
} from "./fetch";
export {
  FEED_FETCH_DEFAULTS,
  fetchFeed,
  fetchFeeds,
} from "./fetch";
export type { FetchableSource, FetchableSourceStatus } from "./source";
export { fetchableSourceOf, fetchableSourcesOf } from "./source";
