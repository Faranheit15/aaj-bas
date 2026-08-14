/**
 * The exit code, which is the only part of the report a workflow reads.
 *
 * AB-103's first acceptance criterion is that the command exits non-zero for a
 * blocking failure, and CI branches on nothing else: a wrong code here turns a
 * failed validation into a green run, which is the "empty success state after a
 * failure" section 37 forbids. So the table below is exhaustive over the states
 * a report can be in, under both policies, rather than a few examples.
 */
import { describe, expect, it } from "vitest";
import type { EditionValidation, ValidationReport } from "./report";
import { exitCodeFor, VALIDATION_EXIT_CODES } from "./report";

const DEVELOPMENT = { publish: false } as const;
const PUBLISH = { publish: true } as const;

function edition(
  overrides: Partial<EditionValidation> = {},
): EditionValidation {
  return {
    file: "content/editions/2026-08-13.json",
    editionDate: "2026-08-13",
    publishable: true,
    findings: [],
    ...overrides,
  };
}

/** Counts are taken from the findings, as `validateEditions` computes them. */
function report(editions: readonly EditionValidation[]): ValidationReport {
  const findings = editions.flatMap((each) => each.findings);
  return {
    reportVersion: 1,
    editions,
    blockingCount: findings.filter((f) => f.severity === "blocking").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

const WARNING = {
  ruleId: "url/https-only",
  severity: "warning",
  message: "source src-0 links over plain http",
} as const;

const BLOCKING = {
  ruleId: "diversity/topic-cap",
  severity: "blocking",
  message: "4 core stories carry the topic india",
} as const;

describe("exitCodeFor", () => {
  const cases: readonly {
    readonly name: string;
    readonly report: ValidationReport;
    readonly development: number;
    readonly publish: number;
  }[] = [
    {
      name: "no editions at all",
      report: report([]),
      // Both, and before every other check: a run that validated nothing must
      // never report success, whichever profile asked for it.
      development: VALIDATION_EXIT_CODES.noEditionsFound,
      publish: VALIDATION_EXIT_CODES.noEditionsFound,
    },
    {
      name: "a clean, publishable edition",
      report: report([edition()]),
      development: VALIDATION_EXIT_CODES.ok,
      publish: VALIDATION_EXIT_CODES.ok,
    },
    {
      name: "warnings only",
      report: report([edition({ findings: [WARNING] })]),
      // Warnings are advisory under both profiles. A warning that failed the
      // command under `--publish` would be a blocking rule wearing a warning's
      // name.
      development: VALIDATION_EXIT_CODES.ok,
      publish: VALIDATION_EXIT_CODES.ok,
    },
    {
      name: "a blocking finding",
      report: report([edition({ publishable: false, findings: [BLOCKING] })]),
      development: VALIDATION_EXIT_CODES.blocking,
      publish: VALIDATION_EXIT_CODES.blocking,
    },
    {
      name: "not publishable with nothing blocking",
      // Sample data: every rule passes and the content still may not reach a
      // reader. This row is the only one where the two profiles disagree, and
      // it is the whole reason the publish profile exists.
      report: report([edition({ publishable: false, findings: [WARNING] })]),
      development: VALIDATION_EXIT_CODES.ok,
      publish: VALIDATION_EXIT_CODES.blocking,
    },
    {
      name: "one clean edition beside one that is not publishable",
      report: report([edition(), edition({ publishable: false })]),
      development: VALIDATION_EXIT_CODES.ok,
      publish: VALIDATION_EXIT_CODES.blocking,
    },
    {
      name: "no editions found beats a blocking count that cannot exist",
      report: { ...report([]), blockingCount: 1 },
      development: VALIDATION_EXIT_CODES.noEditionsFound,
      publish: VALIDATION_EXIT_CODES.noEditionsFound,
    },
  ];

  for (const each of cases) {
    it(`exits ${each.development} for ${each.name} in development`, () => {
      expect(exitCodeFor(each.report, DEVELOPMENT)).toBe(each.development);
    });

    it(`exits ${each.publish} for ${each.name} under --publish`, () => {
      expect(exitCodeFor(each.report, PUBLISH)).toBe(each.publish);
    });
  }

  it("keeps the codes distinct, since a caller tells failures apart by them", () => {
    const codes = Object.values(VALIDATION_EXIT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(VALIDATION_EXIT_CODES.ok).toBe(0);
  });
});
