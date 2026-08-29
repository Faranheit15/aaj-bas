#!/usr/bin/env bun
/**
 * CLI runner for prompt golden dataset evaluation.
 *
 * Runs evaluation across the 50-cluster golden dataset and outputs results as
 * plain text, Markdown, or JSON.
 */

import {
  evaluateGoldenDataset,
  formatGoldenEvaluationMarkdown,
  formatGoldenEvaluationText,
  GOLDEN_EXIT_CODES,
  goldenExitCodeFor,
  toGoldenEvaluationJson,
} from "@aaj-bas/domain";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let format: "text" | "markdown" | "json" = "text";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      format = "json";
    } else if (arg === "--markdown" || arg === "--md") {
      format = "markdown";
    } else if (arg === "--text") {
      format = "text";
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun scripts/evaluate-golden-dataset.ts [--text | --markdown | --json]",
      );
      process.exit(GOLDEN_EXIT_CODES.pass);
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error(
        "Usage: bun scripts/evaluate-golden-dataset.ts [--text | --markdown | --json]",
      );
      process.exit(GOLDEN_EXIT_CODES.usage);
    }
  }

  try {
    const report = await evaluateGoldenDataset();

    if (format === "json") {
      console.log(JSON.stringify(toGoldenEvaluationJson(report), null, 2));
    } else if (format === "markdown") {
      console.log(formatGoldenEvaluationMarkdown(report));
    } else {
      console.log(formatGoldenEvaluationText(report));
    }

    process.exit(goldenExitCodeFor(report));
  } catch (err) {
    console.error("Fatal error during golden dataset evaluation:", err);
    process.exit(GOLDEN_EXIT_CODES.internal);
  }
}

void main();
