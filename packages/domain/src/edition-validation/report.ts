/**
 * The vocabulary every validation rule and both report formats are written
 * against.
 *
 * Severity is the whole design. A rule that blocks publication for something an
 * editor may legitimately have meant is worse than no rule, because it teaches
 * people to route around the validator; a rule that only warns about a broken
 * source mapping would let the failure section 18 exists to prevent reach a
 * reader. So blocking is reserved for facts about the file that cannot be
 * defended, and warning carries the heuristics and the editorial signals.
 *
 * Findings are reported, never thrown. A run reports every problem in every
 * edition rather than stopping at the first, because an editor fixing an
 * edition wants the list, not the first item of it.
 */

/**
 * `blocking` fails the command. `warning` is printed, counted, and does not.
 *
 * There is deliberately no severity that can be silenced. Section 45 requires
 * that a validation failure never turn into automatic success, and an
 * ignore-rule flag is precisely that mechanism. A rule that is wrong is changed
 * in a reviewed pull request.
 */
export type FindingSeverity = "blocking" | "warning";

/** One thing a rule objected to, located precisely enough to fix. */
export interface ValidationFinding {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly message: string;
  /** Absent for edition-level findings that belong to no single story. */
  readonly storyId?: string;
  /** A path into the edition, such as `stories[3].sourceIds`. */
  readonly path?: string;
}

export interface EditionValidation {
  /** Repository-relative, forward slashes, so output is identical everywhere. */
  readonly file: string;
  /** Null when the file did not parse far enough to have a date. */
  readonly editionDate: string | null;
  /**
   * Whether this edition may be deployed.
   *
   * False when the edition carries any blocking finding, when
   * `url/sample-data-hosts` fired, or when the file did not parse. True only
   * when all three are clear, so a pipeline may branch on this field alone.
   *
   * Computed on every run rather than only under the publish profile, so the
   * answer is visible in an ordinary report instead of being a property that
   * only exists when someone remembers to ask for it.
   */
  readonly publishable: boolean;
  readonly findings: readonly ValidationFinding[];
}

export interface ValidationReport {
  /**
   * Bumped only when the machine-readable shape changes, so a consumer built
   * for version 1 can refuse a report it does not understand. Mirrors the
   * schemaVersion precedent from ADR-0005.
   */
  readonly reportVersion: 1;
  readonly editions: readonly EditionValidation[];
  readonly blockingCount: number;
  readonly warningCount: number;
}

/**
 * What the caller is asking of the content, as opposed to what the content is.
 *
 * `publish` does not change what is computed. It only decides whether an
 * edition that is not publishable is fatal, which keeps one code path producing
 * one set of findings and avoids a second, quieter definition of correct.
 */
export interface ValidationPolicy {
  readonly publish: boolean;
}

/**
 * Distinct codes because section 37 wants failure modes distinguished. The one
 * that matters is `noEditionsFound`: a glob that matches nothing would
 * otherwise report success, and a validator that validated nothing passing its
 * own check suite is the exact "empty success state after a failure" that
 * section forbids.
 */
export const VALIDATION_EXIT_CODES = {
  ok: 0,
  blocking: 1,
  usage: 2,
  noEditionsFound: 3,
  internal: 4,
} as const;

export function exitCodeFor(
  report: ValidationReport,
  policy: ValidationPolicy,
): number {
  if (report.editions.length === 0) {
    return VALIDATION_EXIT_CODES.noEditionsFound;
  }
  if (report.blockingCount > 0) {
    return VALIDATION_EXIT_CODES.blocking;
  }
  if (policy.publish && report.editions.some((e) => !e.publishable)) {
    return VALIDATION_EXIT_CODES.blocking;
  }
  return VALIDATION_EXIT_CODES.ok;
}
