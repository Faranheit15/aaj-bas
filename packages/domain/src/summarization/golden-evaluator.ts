/**
 * Evaluator and diagnostic reporter for golden summarization dataset.
 */

import { validateStoryFactualSupport } from "../factual-validation";
import { DeterministicFallbackSummarizer } from "./fallback";
import { GOLDEN_PROMPT_DATASET_FULL } from "./golden-dataset";
import {
  GOLDEN_EXIT_CODES,
  type GoldenClusterTestCase,
  type GoldenEvaluationMetrics,
  type GoldenEvaluationOptions,
  type GoldenEvaluationReport,
  type GoldenEvaluationReportJson,
  type GoldenTestCaseEvaluation,
} from "./golden-types";
import { compileSummarizePrompt, convertPromptResultToStory } from "./prompt";

/**
 * Evaluates prompt compilation, fallback summarization, golden containment,
 * and negative hallucination trap detection across the golden dataset.
 */
export async function evaluateGoldenDataset(
  dataset: readonly GoldenClusterTestCase[] = GOLDEN_PROMPT_DATASET_FULL,
  options: GoldenEvaluationOptions = {},
): Promise<GoldenEvaluationReport> {
  const fallbackSummarizer = new DeterministicFallbackSummarizer();
  const activeSummarizer = options.summarizer ?? fallbackSummarizer;

  const testCaseEvaluations: GoldenTestCaseEvaluation[] = [];

  let totalTraps = 0;
  let trapsCaught = 0;
  let numberContainmentPasses = 0;
  let entityContainmentPasses = 0;
  let attributionPasses = 0;
  let uncertaintyPasses = 0;

  for (const testCase of dataset) {
    const blockingFindings: string[] = [];
    const warningFindings: string[] = [];

    // 1. Check prompt compilation
    let promptCompiled = false;
    try {
      const compiled = compileSummarizePrompt({
        cluster: testCase.cluster,
        topic: testCase.topic,
      });
      promptCompiled = compiled.system.length > 50 && compiled.user.length > 50;
    } catch (err) {
      blockingFindings.push(
        `Prompt compilation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Check fallback summarization
    let fallbackPassed = false;
    try {
      const fallbackResult = await activeSummarizer.summarize({
        cluster: testCase.cluster,
        topic: testCase.topic,
      });
      const fallbackValidation = validateStoryFactualSupport(
        fallbackResult.story,
        testCase.cluster,
      );
      fallbackPassed = fallbackValidation.passed;
      if (!fallbackPassed) {
        for (const f of fallbackValidation.findings) {
          if (f.severity === "blocking") {
            blockingFindings.push(`Fallback: ${f.message}`);
          } else {
            warningFindings.push(`Fallback: ${f.message}`);
          }
        }
      }
    } catch (err) {
      blockingFindings.push(
        `Summarizer execution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 3. Check golden summary validation
    let goldenPassed = false;
    try {
      const goldenStory = convertPromptResultToStory(
        testCase.goldenResult,
        { cluster: testCase.cluster, topic: testCase.topic },
        "golden-baseline",
      );

      // Attach uncertainty if present in test case golden result
      if (testCase.goldenResult.uncertainty) {
        Object.assign(goldenStory, {
          uncertainty: testCase.goldenResult.uncertainty,
          confidence: "disputed",
        });
      }

      const goldenValidation = validateStoryFactualSupport(
        goldenStory,
        testCase.cluster,
        testCase.expectedFacts,
      );

      goldenPassed = goldenValidation.passed;

      if (goldenValidation.metrics.ungroundedNumbersCount === 0) {
        numberContainmentPasses += 1;
      }
      if (goldenValidation.metrics.ungroundedEntitiesCount === 0) {
        entityContainmentPasses += 1;
      }
      if (goldenValidation.metrics.sourceAttributionScore >= 1.0) {
        attributionPasses += 1;
      }

      const uncertaintyIssue = goldenValidation.findings.some(
        (f) => f.ruleId === "fact/uncertainty-on-conflict",
      );
      if (!uncertaintyIssue) {
        uncertaintyPasses += 1;
      }

      if (!goldenPassed) {
        for (const f of goldenValidation.findings) {
          if (f.severity === "blocking") {
            blockingFindings.push(`Golden: ${f.message}`);
          }
        }
      }
    } catch (err) {
      blockingFindings.push(
        `Golden validation exception: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 4. Check negative hallucination traps
    let caseTrapsCaught = 0;
    const caseTrapsTotal = testCase.negativeSamples.length;
    totalTraps += caseTrapsTotal;

    for (const trap of testCase.negativeSamples) {
      const dummyStory = convertPromptResultToStory(
        testCase.goldenResult,
        { cluster: testCase.cluster },
        "trap-test",
      );
      // Overlay poisoned fields
      Object.assign(dummyStory, trap.story);

      const trapValidation = validateStoryFactualSupport(
        dummyStory,
        testCase.cluster,
        testCase.expectedFacts,
      );

      const caughtExpected = trapValidation.findings.some(
        (f) =>
          f.ruleId === trap.expectedBlockedRule && f.severity === "blocking",
      );

      if (caughtExpected || !trapValidation.passed) {
        trapsCaught += 1;
        caseTrapsCaught += 1;
      } else {
        blockingFindings.push(
          `Negative trap '${trap.name}' was not caught by rule '${trap.expectedBlockedRule}'`,
        );
      }
    }

    const testCasePassed =
      promptCompiled &&
      fallbackPassed &&
      goldenPassed &&
      caseTrapsCaught === caseTrapsTotal &&
      blockingFindings.length === 0;

    testCaseEvaluations.push({
      testCaseId: testCase.id,
      topic: testCase.topic,
      passed: testCasePassed,
      promptCompiled,
      goldenPassed,
      fallbackPassed,
      negativeTrapsTotal: caseTrapsTotal,
      negativeTrapsCaught: caseTrapsCaught,
      blockingFindings,
      warningFindings,
    });
  }

  const passedCount = testCaseEvaluations.filter((t) => t.passed).length;
  const totalTestCases = dataset.length;
  const failedCount = totalTestCases - passedCount;
  const passRate = totalTestCases > 0 ? passedCount / totalTestCases : 1.0;
  const trapDetectionRate = totalTraps > 0 ? trapsCaught / totalTraps : 1.0;

  const numberContainmentScore =
    totalTestCases > 0 ? numberContainmentPasses / totalTestCases : 1.0;
  const entityContainmentScore =
    totalTestCases > 0 ? entityContainmentPasses / totalTestCases : 1.0;
  const attributionScore =
    totalTestCases > 0 ? attributionPasses / totalTestCases : 1.0;
  const uncertaintyScore =
    totalTestCases > 0 ? uncertaintyPasses / totalTestCases : 1.0;

  const overallPassed = failedCount === 0 && trapDetectionRate >= 1.0;

  const metrics: GoldenEvaluationMetrics = {
    totalTestCases,
    passedCount,
    failedCount,
    passRate,
    totalNegativeTraps: totalTraps,
    negativeTrapsCaught: trapsCaught,
    trapDetectionRate,
    numberContainmentScore,
    entityContainmentScore,
    attributionScore,
    uncertaintyScore,
  };

  return {
    reportVersion: 1,
    passed: overallPassed,
    evaluatedAt: new Date().toISOString(),
    summarizerName: activeSummarizer.name,
    metrics,
    testCases: testCaseEvaluations,
  };
}

/**
 * Returns process exit code for golden evaluation report.
 */
export function goldenExitCodeFor(report: GoldenEvaluationReport): number {
  return report.passed ? GOLDEN_EXIT_CODES.pass : GOLDEN_EXIT_CODES.fail;
}

/**
 * JSON serialization representation of golden evaluation report.
 */
export function toGoldenEvaluationJson(
  report: GoldenEvaluationReport,
): GoldenEvaluationReportJson {
  return {
    reportVersion: 1,
    passed: report.passed,
    evaluatedAt: report.evaluatedAt,
    summarizerName: report.summarizerName,
    metrics: { ...report.metrics },
    testCases: report.testCases.map((tc) => ({
      ...tc,
      blockingFindings: Array.from(tc.blockingFindings),
      warningFindings: Array.from(tc.warningFindings),
    })),
  };
}

/**
 * Formats golden evaluation report into a GitHub-flavored Markdown summary.
 */
export function formatGoldenEvaluationMarkdown(
  report: GoldenEvaluationReport,
): string {
  const lines: string[] = [];

  const statusBadge = report.passed
    ? "### 🏆 Prompt Golden Dataset Evaluation: ✅ PASS"
    : `### 🏆 Prompt Golden Dataset Evaluation: ❌ FAIL (${report.metrics.failedCount} failed case${report.metrics.failedCount === 1 ? "" : "s"})`;

  lines.push(statusBadge);
  lines.push("");
  lines.push(`- **Evaluated at**: \`${report.evaluatedAt}\``);
  lines.push(`- **Summarizer evaluated**: \`${report.summarizerName}\``);
  lines.push(
    `- **Dataset size**: **${report.metrics.totalTestCases}** clusters`,
  );
  lines.push(
    `- **Overall pass rate**: **${(report.metrics.passRate * 100).toFixed(1)}%** (${report.metrics.passedCount}/${report.metrics.totalTestCases})`,
  );
  lines.push(
    `- **Hallucination trap catch rate**: **${(report.metrics.trapDetectionRate * 100).toFixed(1)}%** (${report.metrics.negativeTrapsCaught}/${report.metrics.totalNegativeTraps})`,
  );
  lines.push("");

  lines.push("| Evaluation Metric | Score | Target | Status |");
  lines.push("| :--- | :---: | :---: | :---: |");
  lines.push(
    `| **Golden Summary Pass Rate** | ${(report.metrics.passRate * 100).toFixed(1)}% | 100.0% | ${report.metrics.passRate >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push(
    `| **Number Containment Rate** | ${(report.metrics.numberContainmentScore * 100).toFixed(1)}% | 100.0% | ${report.metrics.numberContainmentScore >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push(
    `| **Named Entity Containment Rate** | ${(report.metrics.entityContainmentScore * 100).toFixed(1)}% | 100.0% | ${report.metrics.entityContainmentScore >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push(
    `| **Source Attribution Compliance** | ${(report.metrics.attributionScore * 100).toFixed(1)}% | 100.0% | ${report.metrics.attributionScore >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push(
    `| **Uncertainty on Disputed Facts** | ${(report.metrics.uncertaintyScore * 100).toFixed(1)}% | 100.0% | ${report.metrics.uncertaintyScore >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push(
    `| **Negative Hallucination Trap Rate** | ${(report.metrics.trapDetectionRate * 100).toFixed(1)}% | 100.0% | ${report.metrics.trapDetectionRate >= 1.0 ? "✅ PASS" : "❌ FAIL"} |`,
  );
  lines.push("");

  const failures = report.testCases.filter((tc) => !tc.passed);
  if (failures.length > 0) {
    lines.push("<details>");
    lines.push(
      "<summary><strong>🔍 Failed Test Case Diagnostics</strong></summary>",
    );
    lines.push("");
    for (const f of failures) {
      lines.push(`#### Case \`${f.testCaseId}\` [${f.topic}]`);
      for (const finding of f.blockingFindings) {
        lines.push(`- 🛑 ${finding}`);
      }
      lines.push("");
    }
    lines.push("</details>");
  } else {
    lines.push(
      "✨ *All 50 golden story clusters and hallucination traps satisfied constitutional invariants.*",
    );
  }

  return lines.join("\n");
}

/**
 * Formats golden evaluation report into plain terminal text.
 */
export function formatGoldenEvaluationText(
  report: GoldenEvaluationReport,
): string {
  const lines: string[] = [];

  const prefix = report.passed ? "OK:" : "FAIL:";
  lines.push(
    `${prefix} Prompt golden evaluation completed (${report.metrics.passedCount}/${report.metrics.totalTestCases} passed, ${(report.metrics.trapDetectionRate * 100).toFixed(1)}% traps caught).`,
  );
  lines.push(
    `  - Number containment: ${(report.metrics.numberContainmentScore * 100).toFixed(1)}%`,
  );
  lines.push(
    `  - Entity containment: ${(report.metrics.entityContainmentScore * 100).toFixed(1)}%`,
  );
  lines.push(
    `  - Source attribution: ${(report.metrics.attributionScore * 100).toFixed(1)}%`,
  );
  lines.push(
    `  - Uncertainty compliance: ${(report.metrics.uncertaintyScore * 100).toFixed(1)}%`,
  );

  const failures = report.testCases.filter((tc) => !tc.passed);
  if (failures.length > 0) {
    lines.push("");
    for (const f of failures) {
      lines.push(`  FAIL: Case '${f.testCaseId}' (${f.topic})`);
      for (const finding of f.blockingFindings) {
        lines.push(`    - [BLOCK] ${finding}`);
      }
    }
  }

  return lines.join("\n");
}
