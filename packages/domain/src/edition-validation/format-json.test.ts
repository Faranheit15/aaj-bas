import { describe, expect, it } from "vitest";
import { toValidationReportJson } from "./format-json";
import type { EditionValidation, ValidationReport } from "./report";

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

describe("toValidationReportJson", () => {
  it("carries the whole report, versioned and with the profile it ran under", () => {
    const json = toValidationReportJson(
      report([
        edition({
          findings: [
            {
              ruleId: "publisher-diversity",
              severity: "warning",
              message: "5 publishers across 10 stories.",
              storyId: "story-3",
              path: "stories[3].sourceIds",
            },
          ],
        }),
      ]),
      DEVELOPMENT,
    );

    expect(json).toEqual({
      reportVersion: 1,
      publish: false,
      ok: true,
      blockingCount: 0,
      warningCount: 1,
      editions: [
        {
          file: "content/editions/2026-07-21.json",
          editionDate: "2026-07-21",
          publishable: true,
          findings: [
            {
              ruleId: "publisher-diversity",
              severity: "warning",
              storyId: "story-3",
              path: "stories[3].sourceIds",
              message: "5 publishers across 10 stories.",
            },
          ],
        },
      ],
    });
  });

  it("omits storyId and path entirely rather than emitting null", () => {
    const json = toValidationReportJson(
      report([
        edition({
          findings: [
            {
              ruleId: "edition-story-count",
              severity: "blocking",
              message: "edition carries 9 stories.",
            },
          ],
        }),
      ]),
      DEVELOPMENT,
    );
    const finding = json.editions[0]?.findings[0];

    expect(finding && "storyId" in finding).toBe(false);
    expect(finding && "path" in finding).toBe(false);
    expect(Object.keys(finding ?? {})).toEqual([
      "ruleId",
      "severity",
      "message",
    ]);
  });

  it("keeps a null edition date, because not parsing far enough is a fact", () => {
    const json = toValidationReportJson(
      report([edition({ editionDate: null })]),
      DEVELOPMENT,
    );

    expect(json.editions[0]?.editionDate).toBeNull();
  });

  it("reports ok false when a blocking finding is present", () => {
    const json = toValidationReportJson(
      report([
        edition({
          findings: [
            {
              ruleId: "story-source-mapping",
              severity: "blocking",
              message: "story cites an undefined sourceId.",
            },
          ],
        }),
      ]),
      DEVELOPMENT,
    );

    expect(json.ok).toBe(false);
    expect(json.blockingCount).toBe(1);
  });

  it("reports ok false for an unpublishable edition only under the publish profile", () => {
    const unpublishable = report([edition({ publishable: false })]);

    expect(toValidationReportJson(unpublishable, DEVELOPMENT).ok).toBe(true);
    expect(toValidationReportJson(unpublishable, PUBLISH).ok).toBe(false);
    expect(toValidationReportJson(unpublishable, PUBLISH).publish).toBe(true);
  });

  it("refuses to call a run that checked nothing a success", () => {
    expect(toValidationReportJson(report([]), DEVELOPMENT).ok).toBe(false);
  });

  it("serialises to identical bytes across runs, carrying no timestamp", () => {
    const same = report([edition()]);
    const first = JSON.stringify(toValidationReportJson(same, DEVELOPMENT));
    const second = JSON.stringify(toValidationReportJson(same, DEVELOPMENT));

    expect(first).toBe(second);
    // Asserted as an exact key set: a future "generatedAt" or "durationMs"
    // would pass every other test here while making a committed golden report
    // impossible to diff.
    expect(Object.keys(toValidationReportJson(same, DEVELOPMENT))).toEqual([
      "reportVersion",
      "publish",
      "ok",
      "blockingCount",
      "warningCount",
      "editions",
    ]);
  });
});
