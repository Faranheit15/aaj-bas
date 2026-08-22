/**
 * The vocabulary every registry rule and both report formats are written
 * against.
 *
 * It mirrors `edition-validation/report.ts` and shares no type with it, which
 * is a deliberate cost. A registry finding is located by `sourceId`, not by
 * `storyId`; `publishable` and `editionDate` are edition vocabulary and mean
 * nothing here. A shared finding type would have to carry both vocabularies and
 * would then describe neither file accurately, and every consumer would learn
 * to check which half applied.
 *
 * Severity carries the same meaning as it does there: blocking is reserved for
 * facts about the file that cannot be defended, warning carries the heuristics.
 * Findings are reported rather than thrown, so a run reports every problem in
 * every entry instead of the first one.
 */

/**
 * `blocking` fails the command. `warning` is printed, counted, and does not.
 *
 * Duplicated from `edition-validation/report.ts` rather than imported, for the
 * same reason as the exit codes below: two CLIs with independent lifetimes
 * should not be coupled by a type neither of them owns. `exit-codes.test.ts`
 * pins the numbers together so the two cannot drift into meaning different
 * things by the same code.
 */
export type RegistryFindingSeverity = "blocking" | "warning";

/** One thing a rule objected to, located precisely enough to fix. */
export interface RegistryFinding {
  readonly ruleId: string;
  readonly severity: RegistryFindingSeverity;
  readonly message: string;
  /** Absent for registry-level findings that belong to no single source. */
  readonly sourceId?: string;
  /** A path into the registry, such as `sources[3].feedUrl`. */
  readonly path?: string;
}

/**
 * What a single entry may be used for, computed once here.
 *
 * `fetchable` is to the registry what `publishable` is to an edition in
 * AB-103: a fact the validator already knows, exported so the next slice reads
 * it instead of recomputing it. AB-201 consumed `publishable` exactly this way,
 * and a second definition of "may we fetch this" is how a source nobody
 * approved ends up being fetched.
 */
export type SourceStatus =
  | { readonly sourceId: string; readonly fetchable: true }
  | { readonly sourceId: string; readonly fetchable: false };

export interface RegistryValidation {
  /** Repository-relative, forward slashes, so output is identical everywhere. */
  readonly file: string;
  /**
   * How many entries the file declared, before any of them were judged. Null
   * when the file did not parse far enough to say.
   *
   * Kept separate from `sources.length`, which counts the entries that survived
   * the schema, because zero declared entries and zero surviving entries are
   * different failures and `registryExitCodeFor` answers them differently.
   */
  readonly declaredSources: number | null;
  readonly sources: readonly SourceStatus[];
  readonly findings: readonly RegistryFinding[];
}

export interface RegistryReport {
  /**
   * Bumped only when the machine-readable shape changes, so a consumer built
   * for version 1 can refuse a report it does not understand. Mirrors the
   * schemaVersion precedent from ADR-0005.
   */
  readonly reportVersion: 1;
  readonly registries: readonly RegistryValidation[];
  readonly blockingCount: number;
  readonly warningCount: number;
}

/**
 * The same five codes as `VALIDATION_EXIT_CODES`, with the same numbers, named
 * for this command's vocabulary.
 *
 * They are duplicated on purpose. Importing them would make one CLI's contract
 * with its callers depend on another CLI's file, and the two commands can
 * reasonably be changed at different times. What must not drift is the meaning
 * of a number, so `exit-codes.test.ts` asserts them equal field for field, and
 * a change to either side fails there rather than in a CI script that quietly
 * reads 3 as 1.
 */
export const REGISTRY_EXIT_CODES = {
  ok: 0,
  blocking: 1,
  usage: 2,
  nothingValidated: 3,
  internal: 4,
} as const;

/**
 * `nothingValidated` is checked before `blocking`, and that order is the point.
 *
 * A registry that declares no sources is a run that checked nothing, and
 * section 37 distinguishes that from a run that found something wrong: reported
 * as blocking, "the file is empty" would be indistinguishable from "a source is
 * fetching over http", and the two want different responses from whoever reads
 * the exit code. Both are still failures, and both still stop CI.
 */
export function registryExitCodeFor(report: RegistryReport): number {
  if (report.registries.length === 0) {
    return REGISTRY_EXIT_CODES.nothingValidated;
  }
  // `every`, not `some`: a run that validated one full registry and one empty
  // file did check something, and the empty file's own finding says so.
  if (report.registries.every((registry) => registry.declaredSources === 0)) {
    return REGISTRY_EXIT_CODES.nothingValidated;
  }
  if (report.blockingCount > 0) {
    return REGISTRY_EXIT_CODES.blocking;
  }
  return REGISTRY_EXIT_CODES.ok;
}
