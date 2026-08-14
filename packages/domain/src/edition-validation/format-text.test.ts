/**
 * The reports are built inline here rather than by running the validator.
 *
 * A formatter test that produced its input by validating a real edition would
 * fail whenever a rule changed, reporting a rule regression as a formatting
 * regression. These reports are hand-made so the only thing under test is the
 * rendering.
 */

import { describe, expect, it } from "vitest";
import { formatValidationText } from "./format-text";
import type {
  EditionValidation,
  ValidationFinding,
  ValidationReport,
} from "./report";

const PUBLISH = { publish: true } as const;
const DEVELOPMENT = { publish: false } as const;

function edition(
  overrides: Partial<EditionValidation> = {},
): EditionValidation {
  return {
    file: "content/editions/2026-07-21.json",
    editionDate: "2026-07-21",
    publishable: true,
    findings: [],
    ...overrides,
  };
}

function report(editions: readonly EditionValidation[]): ValidationReport {
  const findings = editions.flatMap((one) => one.findings);

  return {
    reportVersion: 1,
    editions,
    blockingCount: findings.filter((f) => f.severity === "blocking").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

const blockingFinding: ValidationFinding = {
  ruleId: "story-source-mapping",
  severity: "blocking",
  message: "story cites sourceId src-9, which the edition does not define.",
  storyId: "story-3",
  path: "stories[3].sourceIds",
};

const warningFinding: ValidationFinding = {
  ruleId: "publisher-diversity",
  severity: "warning",
  message: "5 publishers across 10 stories; 6 is the editorial floor.",
};

describe("formatValidationText", () => {
  it("reports a clean run as OK and names the directory covered", () => {
    const text = formatValidationText(report([edition()]), DEVELOPMENT);

    expect(text).toBe(
      "OK: 1 edition in content/editions passed with 0 blocking, 0 warnings.",
    );
  });

  it("omits the directory when the editions do not share one", () => {
    const text = formatValidationText(
      report([edition(), edition({ file: "content/drafts/2026-07-22.json" })]),
      DEVELOPMENT,
    );

    expect(text).toBe("OK: 2 editions passed with 0 blocking, 0 warnings.");
  });

  it("puts the locator on its own line and indents the message beneath it", () => {
    const text = formatValidationText(
      report([edition({ findings: [blockingFinding] })]),
      DEVELOPMENT,
    );

    expect(text.split("\n").slice(0, 2)).toEqual([
      "FAIL: content/editions/2026-07-21.json 2026-07-21 story-3 [story-source-mapping] blocking",
      "  story cites sourceId src-9, which the edition does not define.",
    ]);
  });

  it("keeps the whole locator on one greppable line", () => {
    const text = formatValidationText(
      report([edition({ findings: [blockingFinding] })]),
      DEVELOPMENT,
    );
    const locator = text.split("\n")[0] ?? "";

    expect(locator.startsWith("FAIL: ")).toBe(true);
    expect(locator.length).toBeLessThanOrEqual(96);
  });

  it("writes a dash where a finding has no story and the file has no date", () => {
    const text = formatValidationText(
      report([edition({ editionDate: null, findings: [warningFinding] })]),
      DEVELOPMENT,
    );

    expect(text.split("\n")[0]).toBe(
      "WARN: content/editions/2026-07-21.json - - [publisher-diversity] warning",
    );
  });

  it("counts warnings without failing, and says they do not block", () => {
    const text = formatValidationText(
      report([edition({ findings: [warningFinding] })]),
      DEVELOPMENT,
    );

    expect(text.split("\n").slice(-2)).toEqual([
      "WARN: 1 edition, 0 blocking, 1 warning.",
      "  Warnings are advisory and do not block publication.",
    ]);
  });

  it("summarises a blocking run as FAIL", () => {
    const text = formatValidationText(
      report([edition({ findings: [blockingFinding, warningFinding] })]),
      DEVELOPMENT,
    );

    expect(text.split("\n").at(-1)).toBe(
      "FAIL: 1 edition, 1 blocking, 1 warning.",
    );
  });

  it("passes an unpublishable edition under the ordinary profile", () => {
    const text = formatValidationText(
      report([edition({ publishable: false })]),
      DEVELOPMENT,
    );

    expect(text.startsWith("OK: ")).toBe(true);
  });

  it("fails an unpublishable edition under the publish profile", () => {
    const text = formatValidationText(
      report([edition({ publishable: false })]),
      PUBLISH,
    );

    // The counts all read zero because the publish profile adds no findings, so
    // the summary has to carry the reason itself.
    expect(text.split("\n")).toEqual([
      "FAIL: content/editions/2026-07-21.json is development sample data and cannot be deployed.",
      "FAIL: 1 edition, 0 blocking, 0 warnings. 1 edition not publishable.",
    ]);
  });

  it("refuses to call a run that checked nothing a success", () => {
    const text = formatValidationText(report([]), DEVELOPMENT);

    expect(text).toBe(
      "FAIL: no editions to validate.\n  Nothing matched, so nothing was checked.",
    );
  });

  it("renders the same report identically every time", () => {
    const same = report([
      edition({ findings: [blockingFinding, warningFinding] }),
      edition({ file: "content/editions/2026-07-22.json" }),
    ]);

    expect(formatValidationText(same, DEVELOPMENT)).toBe(
      formatValidationText(same, DEVELOPMENT),
    );
  });

  it("preserves the order the report supplied rather than re-sorting", () => {
    const text = formatValidationText(
      report([
        edition({
          file: "content/editions/b.json",
          findings: [warningFinding],
        }),
        edition({
          file: "content/editions/a.json",
          findings: [warningFinding],
        }),
      ]),
      DEVELOPMENT,
    );

    expect(text.indexOf("b.json")).toBeLessThan(text.indexOf("a.json"));
  });
});
