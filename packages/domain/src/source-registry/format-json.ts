/**
 * The machine-readable report, for a pipeline step or a diff rather than a
 * human.
 *
 * It carries no timestamp and no absolute path, and both omissions are the
 * point: a timestamp would make every run produce different bytes, ruling out a
 * committed golden report or a diff between two runs, and a machine-specific
 * path would make the same registry report differently on a contributor's
 * machine and on a CI runner.
 *
 * The shape is flat. The edition report nests findings under the edition they
 * belong to because a run covers many editions; a registry run covers one file
 * in practice, and a consumer of this report -- AB-402's fetcher, first -- wants
 * "which sources may I fetch" and "what is wrong", not a tree to walk. Each row
 * carries its own `file`, so flatness costs nothing and the two questions are
 * one array lookup each.
 *
 * This shape deliberately does not live in `packages/schemas`. That package is
 * the contract for what the product publishes; a developer tool's diagnostic
 * output is not published content.
 */

import type { RegistryFindingSeverity, RegistryReport } from "./report";
import { REGISTRY_EXIT_CODES, registryExitCodeFor } from "./report";

export interface RegistryFindingJson {
  readonly file: string;
  readonly ruleId: string;
  readonly severity: RegistryFindingSeverity;
  /** Omitted entirely, never null, when the finding belongs to no one source. */
  readonly sourceId?: string;
  readonly path?: string;
  readonly message: string;
}

export interface RegistrySourceJson {
  readonly file: string;
  readonly sourceId: string;
  readonly fetchable: boolean;
}

export interface RegistryReportJson {
  readonly reportVersion: 1;
  readonly ok: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly sources: readonly RegistrySourceJson[];
  readonly findings: readonly RegistryFindingJson[];
}

export function toRegistryReportJson(
  report: RegistryReport,
): RegistryReportJson {
  return {
    reportVersion: report.reportVersion,
    // Derived from `registryExitCodeFor` rather than recomputed, so the JSON
    // `ok` and the process exit code cannot ever disagree about the same run.
    ok: registryExitCodeFor(report) === REGISTRY_EXIT_CODES.ok,
    blockingCount: report.blockingCount,
    warningCount: report.warningCount,
    sources: report.registries.flatMap((registry) =>
      registry.sources.map((entry) => ({
        file: registry.file,
        sourceId: entry.sourceId,
        fetchable: entry.fetchable,
      })),
    ),
    findings: report.registries.flatMap((registry) =>
      registry.findings.map((finding) => ({
        file: registry.file,
        ruleId: finding.ruleId,
        severity: finding.severity,
        // Spread rather than assigned: `exactOptionalPropertyTypes` is on, so
        // an absent source must be an absent key, not a key holding undefined
        // that `JSON.stringify` would drop and an `in` check would still see.
        ...(finding.sourceId === undefined
          ? {}
          : { sourceId: finding.sourceId }),
        ...(finding.path === undefined ? {} : { path: finding.path }),
        message: finding.message,
      })),
    ),
  };
}
