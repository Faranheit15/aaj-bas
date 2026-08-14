/**
 * The machine-readable report, for a pipeline step or a diff rather than a human.
 *
 * It carries no timestamp and no absolute path, and both omissions are the
 * point. A timestamp would make every run produce different bytes, which rules
 * out committing a golden report, diffing two runs to see what a change did, or
 * caching a result; the run time is knowable from whatever invoked the command
 * and does not belong in its findings. Paths stay repository-relative with
 * forward slashes for the same reason: the same content must produce the same
 * report on a contributor's machine and on a CI runner.
 *
 * This shape deliberately does not live in `packages/schemas`. That package is
 * the contract for what the product *publishes* -- editions a reader consumes --
 * and section 10 keeps its remit that narrow. A developer tool's diagnostic
 * output is not published content, and moving it there would make every future
 * change to a CLI's output a change to the public content contract.
 */

import type {
  FindingSeverity,
  ValidationPolicy,
  ValidationReport,
} from "./report";
import { exitCodeFor, VALIDATION_EXIT_CODES } from "./report";

export interface ValidationFindingJson {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  /** Omitted entirely, never null, when the finding belongs to no story. */
  readonly storyId?: string;
  readonly path?: string;
  readonly message: string;
}

export interface ValidationEditionJson {
  readonly file: string;
  /** Null, not omitted: "did not parse far enough to have a date" is a fact. */
  readonly editionDate: string | null;
  readonly publishable: boolean;
  readonly findings: readonly ValidationFindingJson[];
}

export interface ValidationReportJson {
  readonly reportVersion: 1;
  /** Which profile produced this, so `ok` can be read without guessing. */
  readonly publish: boolean;
  readonly ok: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly editions: readonly ValidationEditionJson[];
}

export function toValidationReportJson(
  report: ValidationReport,
  policy: ValidationPolicy,
): ValidationReportJson {
  return {
    reportVersion: report.reportVersion,
    publish: policy.publish,
    // Derived from `exitCodeFor` rather than recomputed, so the JSON `ok` and
    // the process exit code cannot ever disagree about the same run.
    ok: exitCodeFor(report, policy) === VALIDATION_EXIT_CODES.ok,
    blockingCount: report.blockingCount,
    warningCount: report.warningCount,
    editions: report.editions.map((edition) => ({
      file: edition.file,
      editionDate: edition.editionDate,
      publishable: edition.publishable,
      findings: edition.findings.map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        // Spread rather than assigned: `exactOptionalPropertyTypes` is on, so
        // an absent story must be an absent key, not a key holding undefined
        // that `JSON.stringify` would drop and a `in` check would still see.
        ...(finding.storyId === undefined ? {} : { storyId: finding.storyId }),
        ...(finding.path === undefined ? {} : { path: finding.path }),
        message: finding.message,
      })),
    })),
  };
}
