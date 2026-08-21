/**
 * The report a maintainer reads in a terminal.
 *
 * The register is `edition-validation/format-text.ts`'s, and for the same
 * reasons: no colour, because every other check in this repository prints plain
 * `OK:`/`WARN:`/`FAIL:` lines and TTY detection would push a runtime concern
 * into a pure function; and two lines per finding, a short locator followed by
 * the message indented beneath it, so `grep FAIL` returns whole records.
 *
 * The locator carries four fields, not five. The edition report's date column
 * has no counterpart here — a registry is not dated — and a column that would
 * read `-` on every line of every run is noise pretending to be structure.
 *
 * Nothing here re-sorts, so nothing here can introduce a time-dependent or
 * locale-dependent ordering, and identical input produces byte-identical output
 * on every machine.
 */

import type {
  RegistryFinding,
  RegistryReport,
  RegistryValidation,
} from "./report";
import { REGISTRY_EXIT_CODES, registryExitCodeFor } from "./report";

/** `-` rather than an empty column, so the field count per line never changes. */
const ABSENT = "-";

export function formatRegistryText(report: RegistryReport): string {
  const lines: string[] = [];

  for (const registry of report.registries) {
    for (const finding of registry.findings) {
      lines.push(locatorLine(registry, finding));
      lines.push(`  ${finding.message}`);
    }
  }

  lines.push(...summaryLines(report));

  return lines.join("\n");
}

/**
 * `FAIL: <file> <sourceId> [<ruleId>] <severity>`
 *
 * The severity appears twice, as the prefix and as the last field. The prefix is
 * what a human scans for and what matches the other repository checks; the
 * trailing field sits in a fixed column so a machine-ish filter can select on it
 * without the prefix vocabulary having to stay stable forever.
 */
function locatorLine(
  registry: RegistryValidation,
  finding: RegistryFinding,
): string {
  const prefix = finding.severity === "blocking" ? "FAIL" : "WARN";
  const source = finding.sourceId ?? ABSENT;

  return `${prefix}: ${registry.file} ${source} [${finding.ruleId}] ${finding.severity}`;
}

function summaryLines(report: RegistryReport): readonly string[] {
  // A run that matched no files is a failure, not a vacuous success; section 37
  // forbids reporting an empty success state after nothing happened. The same
  // refusal applies one level in: a registry that declared no sources checked
  // nothing, and a summary line calling that a pass would be the lie.
  if (report.registries.length === 0) {
    return [
      "FAIL: no source registry to validate.",
      "  Nothing matched, so nothing was checked.",
    ];
  }

  const exitCode = registryExitCodeFor(report);
  if (exitCode === REGISTRY_EXIT_CODES.nothingValidated) {
    return [
      "FAIL: no sources to validate.",
      "  Every registry declared none, so nothing was checked.",
    ];
  }

  const checked = report.registries.reduce(
    (total, registry) => total + registry.sources.length,
    0,
  );
  const sources = plural(checked, "source");
  const blocking = `${report.blockingCount} blocking`;
  const warnings = plural(report.warningCount, "warning");

  if (exitCode !== REGISTRY_EXIT_CODES.ok) {
    return [`FAIL: ${sources}, ${blocking}, ${warnings}.`];
  }

  if (report.warningCount > 0) {
    return [
      `WARN: ${sources}, ${blocking}, ${warnings}.`,
      "  Warnings are advisory and do not block a fetch.",
    ];
  }

  // Naming the file makes the success line say what was covered rather than
  // only how much, which is the difference between "this passed" and "this
  // passed over the registry you meant".
  const fetchable = report.registries.reduce(
    (total, registry) =>
      total + registry.sources.filter((entry) => entry.fetchable).length,
    0,
  );

  return [
    `OK: ${sources}${scopeOf(report)} passed with ${blocking}, ${warnings}.`,
    `  ${fetchable} of ${checked} are fetchable.`,
  ];
}

/** The file, when a run covered exactly one and naming it is unambiguous. */
function scopeOf(report: RegistryReport): string {
  const only =
    report.registries.length === 1 ? report.registries[0] : undefined;
  return only === undefined ? "" : ` in ${only.file}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
