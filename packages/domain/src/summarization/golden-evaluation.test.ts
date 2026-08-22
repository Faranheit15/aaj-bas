import { describe, expect, it } from "vitest";
import { GOLDEN_PROMPT_DATASET_FULL } from "./golden-dataset";
import {
  evaluateGoldenDataset,
  formatGoldenEvaluationMarkdown,
  formatGoldenEvaluationText,
  goldenExitCodeFor,
  toGoldenEvaluationJson,
} from "./golden-evaluator";
import { compileSummarizePrompt } from "./prompt";

describe("Prompt golden dataset and evaluation harness (AB-604)", () => {
  it("contains exactly 50 distinct test cases across multiple topics", () => {
    expect(GOLDEN_PROMPT_DATASET_FULL).toHaveLength(50);

    const ids = new Set(GOLDEN_PROMPT_DATASET_FULL.map((c) => c.id));
    expect(ids.size).toBe(50);

    const topics = new Set(GOLDEN_PROMPT_DATASET_FULL.map((c) => c.topic));
    expect(topics.size).toBeGreaterThanOrEqual(5);
  });

  it("compiles summarize prompts successfully for all 50 clusters", () => {
    for (const testCase of GOLDEN_PROMPT_DATASET_FULL) {
      const compiled = compileSummarizePrompt({
        cluster: testCase.cluster,
        topic: testCase.topic,
      });
      expect(compiled.system).toContain(
        "NEVER invent, extrapolate, or hallucinate facts",
      );
      expect(compiled.user).toContain(
        `[SOURCE: ${testCase.cluster.primaryItem.sourceId}`,
      );
    }
  });

  it("evaluates full golden dataset with 100% pass rate and 100% trap detection", async () => {
    const report = await evaluateGoldenDataset(GOLDEN_PROMPT_DATASET_FULL);

    expect(report.reportVersion).toBe(1);
    expect(report.passed).toBe(true);
    expect(report.metrics.totalTestCases).toBe(50);
    expect(report.metrics.passedCount).toBe(50);
    expect(report.metrics.failedCount).toBe(0);
    expect(report.metrics.passRate).toBe(1.0);
    expect(report.metrics.trapDetectionRate).toBe(1.0);
    expect(report.metrics.numberContainmentScore).toBe(1.0);
    expect(report.metrics.entityContainmentScore).toBe(1.0);
    expect(report.metrics.attributionScore).toBe(1.0);
    expect(report.metrics.uncertaintyScore).toBe(1.0);

    expect(goldenExitCodeFor(report)).toBe(0);
  });

  it("formats markdown summary and JSON report with proper structure", async () => {
    const report = await evaluateGoldenDataset(GOLDEN_PROMPT_DATASET_FULL);

    const md = formatGoldenEvaluationMarkdown(report);
    expect(md).toContain("🏆 Prompt Golden Dataset Evaluation: ✅ PASS");
    expect(md).toContain("| **Golden Summary Pass Rate** | 100.0% |");
    expect(md).toContain(
      "All 50 golden story clusters and hallucination traps satisfied constitutional invariants.",
    );

    const text = formatGoldenEvaluationText(report);
    expect(text).toContain(
      "OK: Prompt golden evaluation completed (50/50 passed",
    );

    const json = toGoldenEvaluationJson(report);
    expect(json.reportVersion).toBe(1);
    expect(json.passed).toBe(true);
    expect(json.testCases).toHaveLength(50);
  });
});
