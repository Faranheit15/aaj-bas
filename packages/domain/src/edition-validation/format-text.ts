/**
 * The report an editor reads in a terminal.
 *
 * Two design constraints shape it.
 *
 * There is no colour. Both existing repository checks -- `check-agents-md-size.sh`
 * and `check-package-manager.sh` -- print plain `OK:`/`WARN:`/`FAIL:` lines, CI
 * logs are plain text anyway, and TTY detection would push a runtime concern into
 * a pure function for no gain. Matching that register keeps one vocabulary across
 * every check in the repository.
 *
 * Each finding is two lines: a locator, then the message indented beneath it. The
 * locator stays short enough to survive an 80-column terminal without wrapping,
 * so `grep FAIL` returns whole, readable records rather than fragments; the
 * message is the part allowed to be long, and it wraps where it cannot damage a
 * locator.
 *
 * Ordering is whatever order the report carries, which is the order the caller
 * supplied files in and the order the rules produced findings in. Nothing here
 * re-sorts, so nothing here can introduce a time-dependent or locale-dependent
 * ordering, and identical input produces byte-identical output on every machine.
 */

import type {
  EditionValidation,
  ValidationFinding,
  ValidationPolicy,
  ValidationReport,
} from "./report";
import { exitCodeFor, VALIDATION_EXIT_CODES } from "./report";

/** `-` rather than an empty column, so the field count per line never changes. */
const ABSENT = "-";

export function formatValidationText(
  report: ValidationReport,
  policy: ValidationPolicy,
): string {
  const lines: string[] = [];

  for (const edition of report.editions) {
    for (const finding of edition.findings) {
      lines.push(locatorLine(edition, finding));
      lines.push(`  ${finding.message}`);
    }
  }

  // The publish profile does not add findings -- it changes what an existing
  // fact about the edition costs. Reporting it as its own line keeps that
  // distinction visible instead of disguising it as a rule the edition broke.
  if (policy.publish) {
    for (const edition of report.editions) {
      if (!edition.publishable) {
        lines.push(
          `FAIL: ${edition.file} is development sample data and cannot be deployed.`,
        );
      }
    }
  }

  lines.push(...summaryLines(report, policy));

  return lines.join("\n");
}

/**
 * `FAIL: <file> <editionDate> <storyId> [<ruleId>] <severity>`
 *
 * The severity appears twice, as the prefix and as the last field. The prefix is
 * what a human scans for and what matches the other repository checks; the
 * trailing field sits in a fixed column so a machine-ish filter can select on it
 * without the prefix vocabulary having to stay stable forever.
 */
function locatorLine(
  edition: EditionValidation,
  finding: ValidationFinding,
): string {
  const prefix = finding.severity === "blocking" ? "FAIL" : "WARN";
  const date = edition.editionDate ?? ABSENT;
  const story = finding.storyId ?? ABSENT;

  return `${prefix}: ${edition.file} ${date} ${story} [${finding.ruleId}] ${finding.severity}`;
}

function summaryLines(
  report: ValidationReport,
  policy: ValidationPolicy,
): readonly string[] {
  // A run that matched no files is a failure, not a vacuous success; section 37
  // forbids reporting an empty success state after nothing happened.
  if (report.editions.length === 0) {
    return [
      "FAIL: no editions to validate.",
      "  Nothing matched, so nothing was checked.",
    ];
  }

  const editions = plural(report.editions.length, "edition");
  const blocking = `${report.blockingCount} blocking`;
  const warnings = plural(report.warningCount, "warning");

  if (exitCodeFor(report, policy) !== VALIDATION_EXIT_CODES.ok) {
    // The publish profile adds no findings, so an edition can fail this run
    // while every count on the line reads zero. Saying why on the summary line
    // itself keeps a reader who skims only the last line from concluding the
    // run passed.
    const unpublishable = policy.publish
      ? report.editions.filter((edition) => !edition.publishable).length
      : 0;
    const reason =
      unpublishable > 0
        ? ` ${plural(unpublishable, "edition")} not publishable.`
        : "";

    return [`FAIL: ${editions}, ${blocking}, ${warnings}.${reason}`];
  }

  if (report.warningCount > 0) {
    return [
      `WARN: ${editions}, ${blocking}, ${warnings}.`,
      "  Warnings are advisory and do not block publication.",
    ];
  }

  // Naming the directory makes the success line say what was covered rather
  // than only how much, which is the difference between "this passed" and "this
  // passed over the content you meant". Derived from the files themselves so an
  // explicit list of paths is described as accurately as a whole directory is.
  const directory = commonDirectory(report.editions);
  const scope = directory === null ? "" : ` in ${directory}`;

  return [`OK: ${editions}${scope} passed with ${blocking}, ${warnings}.`];
}

function commonDirectory(
  editions: readonly EditionValidation[],
): string | null {
  let shared: string | null = null;

  for (const edition of editions) {
    const cut = edition.file.lastIndexOf("/");
    if (cut === -1) {
      return null;
    }
    const directory = edition.file.slice(0, cut);
    if (shared === null) {
      shared = directory;
    } else if (shared !== directory) {
      return null;
    }
  }

  return shared;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
