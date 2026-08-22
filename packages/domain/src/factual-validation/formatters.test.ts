import { describe, expect, it } from "vitest";
import { toFactualValidationReportJson } from "./format-json";
import { formatFactualValidationMarkdown } from "./format-markdown";
import { formatFactualValidationText } from "./format-text";
import type { FactualValidationReport } from "./types";

describe("Factual validation formatters", () => {
  const cleanReport: FactualValidationReport = {
    reportVersion: 1,
    passed: true,
    publishable: true,
    blockingCount: 0,
    warningCount: 0,
    stories: [
      {
        storyId: "s-isro-launch",
        headline: "ISRO launches NVS-02 navigation satellite into orbit",
        clusterId: "c-isro",
        passed: true,
        publishable: true,
        blockingCount: 0,
        warningCount: 0,
        findings: [],
        metrics: {
          totalNumbersChecked: 2,
          ungroundedNumbersCount: 0,
          totalEntitiesChecked: 3,
          ungroundedEntitiesCount: 0,
          sourceAttributionScore: 1.0,
        },
      },
    ],
  };

  const failingReport: FactualValidationReport = {
    reportVersion: 1,
    passed: false,
    publishable: false,
    blockingCount: 1,
    warningCount: 1,
    stories: [
      {
        storyId: "s-bad-facts",
        headline: "Unverified claims reported in local incident",
        clusterId: "c-bad",
        passed: false,
        publishable: false,
        blockingCount: 1,
        warningCount: 1,
        findings: [
          {
            ruleId: "fact/number-containment",
            severity: "blocking",
            message: "Story contains ungrounded number: 999",
            storyId: "s-bad-facts",
            ungroundedTokens: ["999"],
          },
          {
            ruleId: "fact/date-containment",
            severity: "warning",
            message: "Story contains ungrounded weekday reference",
            storyId: "s-bad-facts",
            ungroundedTokens: ["tuesday"],
          },
        ],
        metrics: {
          totalNumbersChecked: 1,
          ungroundedNumbersCount: 1,
          totalEntitiesChecked: 1,
          ungroundedEntitiesCount: 0,
          sourceAttributionScore: 1.0,
        },
      },
    ],
  };

  it("formats JSON accurately without undefined fields", () => {
    const json = toFactualValidationReportJson(failingReport);
    expect(json.reportVersion).toBe(1);
    expect(json.passed).toBe(false);
    expect(json.stories[0]?.findings[0]?.ungroundedTokens).toEqual(["999"]);
  });

  it("formats GitHub Markdown summary with status badges and tables", () => {
    const mdClean = formatFactualValidationMarkdown(cleanReport);
    expect(mdClean).toContain("🛡️ Factual Support Validation: ✅ PASS");
    expect(mdClean).toContain("| `s-isro-launch` |");

    const mdFail = formatFactualValidationMarkdown(failingReport);
    expect(mdFail).toContain("🛡️ Factual Support Validation: ❌ BLOCKED");
    expect(mdFail).toContain("<details>");
    expect(mdFail).toContain("🛑 `BLOCKING`");
  });

  it("formats terminal text output with OK, WARN, and FAIL lines", () => {
    const textClean = formatFactualValidationText(cleanReport);
    expect(textClean).toContain("OK: Factual validation passed");

    const textFail = formatFactualValidationText(failingReport);
    expect(textFail).toContain("FAIL: Factual validation failed");
    expect(textFail).toContain("  FAIL: Story 's-bad-facts'");
  });
});
