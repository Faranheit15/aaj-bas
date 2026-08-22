/**
 * The one source shape a fetcher may receive.
 *
 * `SourceEntry` is deliberately broader than this: it includes inactive
 * drafting entries and unfetchable samples. The registry validator already
 * computed the `fetchable` verdict, so this adapter pairs that verdict with the
 * parsed entry without re-running any rule or accepting a URL string.
 */
import type {
  ActiveSourceEntry,
  SourceEntry,
  SourceRegistry,
  SourceStatus,
} from "../source-registry";

export type FetchableSourceStatus = Extract<
  SourceStatus,
  { readonly fetchable: true }
>;

export interface FetchableSource {
  readonly entry: ActiveSourceEntry;
  readonly status: FetchableSourceStatus;
}

/** Pair an entry with the validator's already-computed positive verdict. */
export function fetchableSourceOf(
  entry: SourceEntry,
  status: SourceStatus,
): FetchableSource | undefined {
  if (!status.fetchable || status.sourceId !== entry.id || !entry.active) {
    return undefined;
  }

  return { entry, status };
}

/** Keep registry order while selecting only entries the validator approved. */
export function fetchableSourcesOf(
  registry: SourceRegistry,
  statuses: readonly SourceStatus[],
): readonly FetchableSource[] {
  const statusById = new Map(
    statuses.map((status) => [status.sourceId, status]),
  );

  return registry.sources.flatMap((entry) => {
    const status = statusById.get(entry.id);
    const fetchable =
      status === undefined ? undefined : fetchableSourceOf(entry, status);
    return fetchable === undefined ? [] : [fetchable];
  });
}
