#!/usr/bin/env bun
/**
 * CLI script to orchestrate the daily edition draft PR workflow (AB-702).
 *
 * 1. Generates draft edition artifacts (JSON and companion Markdown summary).
 * 2. Safely prepares branch `draft/<date>` without force-pushing.
 * 3. Commits and pushes artifacts to origin.
 * 4. Opens or updates a draft PR on GitHub targeting `develop`.
 * 5. Handles diagnostic draft generation when blocking findings exist.
 */

import { execFileSync } from "node:child_process";
import {
  type DailyDraftPrOptions,
  type EditionPipelineInput,
  type NormalizedFeedItem,
  GOLDEN_PROMPT_DATASET_FULL,
  PIPELINE_EXIT_CODES,
  type SourceRegistry,
  composePrBody,
  createSummarizer,
  fetchableSourcesOf,
  formatPrBranchName,
  formatPrTitle,
  generateDraftEditionPipeline,
  parseDailyDraftPrArgs,
  sourceRegistrySchema,
  validateSourceRegistries,
} from "@aaj-bas/domain";

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error: unknown) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr}`);
  }
}

export async function runDailyDraftWorkflow(
  options: DailyDraftPrOptions,
): Promise<{
  success: boolean;
  branchName: string;
  prTitle: string;
  hasBlockingIssues: boolean;
  editionPath: string;
  summaryPath: string;
}> {
  const branchName = formatPrBranchName(options.date);
  const prTitle = formatPrTitle(options.date);
  const editionPath = `${options.outDir}/${options.date}.json`;
  const summaryPath = `${options.outDir}/${options.date}-summary.md`;

  // 1. Load source registry if present
  let sourceRegistry: SourceRegistry | undefined;
  let normalizedItems: NormalizedFeedItem[] = [];

  if (await fileExists(options.sourcesPath)) {
    const file = Bun.file(options.sourcesPath);
    const fileContent = await file.text();
    if (Bun.YAML?.parse) {
      const parsed: unknown = Bun.YAML.parse(fileContent);
      sourceRegistry = sourceRegistrySchema.parse(parsed);
    }
  }

  // 2. Determine feed items
  if (options.useFixture || !sourceRegistry) {
    console.log("ℹ️ Ingesting stories from golden dataset fixtures.");
    normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );
  } else {
    const validationReport = validateSourceRegistries([
      { file: options.sourcesPath, registry: sourceRegistry },
    ]);
    const validatedRegistry = validationReport.registries[0];
    const fetchable = validatedRegistry
      ? fetchableSourcesOf(sourceRegistry, validatedRegistry.sources)
      : [];

    if (fetchable.length === 0) {
      console.log(
        "ℹ️ No active production sources configured in registry. Using staging fixtures.",
      );
      normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
        (tc) => tc.cluster.items,
      );
    } else {
      console.log(
        `📡 Ingesting from ${fetchable.length} active registry source(s)...`,
      );
      normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
        (tc) => tc.cluster.items,
      );
    }
  }

  // 3. Summarizer
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  const summarizer =
    options.useAi && accountId && apiToken
      ? createSummarizer({
          provider: "cloudflare-workers-ai",
          accountId,
          apiToken,
        })
      : createSummarizer({ provider: "fallback" });

  // 4. Run pipeline
  const pipelineInput: EditionPipelineInput = {
    date: options.date,
    normalizedItems,
    sourceRegistry,
    summarizer,
  };

  const result = await generateDraftEditionPipeline(pipelineInput);

  // 5. Write artifacts
  const prBody = composePrBody(
    result.summaryMarkdown,
    result.hasBlockingIssues,
    options.date,
  );

  if (!options.dryRun) {
    await Bun.write(editionPath, `${result.editionJson}\n`);
    await Bun.write(summaryPath, `${prBody}\n`);
  }

  // 6. GitHub Step Summary if requested
  if (options.writeStepSummary && process.env.GITHUB_STEP_SUMMARY) {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    const existing = (await fileExists(summaryFile))
      ? await Bun.file(summaryFile).text()
      : "";
    await Bun.write(summaryFile, `${existing}\n${prBody}\n`);
  }

  console.log(`\n📅 Daily Draft Workflow for ${options.date}`);
  console.log(`   - Branch: ${branchName}`);
  console.log(`   - Title: ${prTitle}`);
  console.log(
    `   - Blocking findings: ${result.hasBlockingIssues ? "YES (Diagnostic PR)" : "NO (Clean)"}`,
  );
  console.log(`   - Artifacts: ${editionPath}, ${summaryPath}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Completed without git/PR modifications.");
    return {
      success: true,
      branchName,
      prTitle,
      hasBlockingIssues: result.hasBlockingIssues,
      editionPath,
      summaryPath,
    };
  }

  // 7. Safe Git & PR Operations (No force push, strict failure reporting)
  try {
    runCommand("git", ["config", "user.name", "github-actions[bot]"]);
    runCommand("git", [
      "config",
      "user.email",
      "github-actions[bot]@users.noreply.github.com",
    ]);

    // Check if remote branch exists
    const remoteBranches = runCommand("git", [
      "ls-remote",
      "--heads",
      "origin",
      branchName,
    ]);

    if (remoteBranches.length > 0) {
      console.log(`Fetching existing remote branch ${branchName}...`);
      runCommand("git", ["fetch", "origin", `${branchName}:${branchName}`]);
      runCommand("git", ["checkout", branchName]);
    } else {
      console.log(`Creating new draft branch ${branchName}...`);
      runCommand("git", ["checkout", "-b", branchName]);
    }

    runCommand("git", ["add", editionPath, summaryPath]);

    const hasDiff =
      runCommand("git", ["status", "--porcelain", editionPath, summaryPath])
        .length > 0;

    if (hasDiff) {
      runCommand("git", [
        "commit",
        "-m",
        `feat(content): generate draft edition for ${options.date}`,
      ]);
      console.log("Committed updated draft artifacts.");
    } else {
      console.log("No artifact changes to commit.");
    }

    console.log(`Pushing ${branchName} to origin (safe fast-forward)...`);
    runCommand("git", ["push", "-u", "origin", branchName]);

    // Check for existing PR
    const existingPrRaw = runCommand("gh", [
      "pr",
      "list",
      "--head",
      branchName,
      "--base",
      options.baseBranch,
      "--json",
      "number",
      "--jq",
      ".[0].number",
    ]);

    if (existingPrRaw && existingPrRaw.trim().length > 0) {
      const prNumber = existingPrRaw.trim();
      console.log(`Updating existing PR #${prNumber}...`);
      runCommand("gh", [
        "pr",
        "edit",
        prNumber,
        "--title",
        prTitle,
        "--body-file",
        summaryPath,
      ]);
    } else {
      console.log(`Creating new draft PR for ${branchName}...`);
      runCommand("gh", [
        "pr",
        "create",
        "--draft",
        "--base",
        options.baseBranch,
        "--head",
        branchName,
        "--title",
        prTitle,
        "--body-file",
        summaryPath,
        "--label",
        "draft-edition",
      ]);
    }

    console.log(
      `\n🎉 Daily Draft PR successfully processed for ${options.date}`,
    );
  } catch (error) {
    console.error("Error performing Git or GitHub PR operations:", error);
    throw error;
  }

  return {
    success: true,
    branchName,
    prTitle,
    hasBlockingIssues: result.hasBlockingIssues,
    editionPath,
    summaryPath,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseDailyDraftPrArgs(args);

  try {
    const outcome = await runDailyDraftWorkflow(options);
    if (outcome.hasBlockingIssues) {
      console.warn(
        "\n⚠️ Workflow generated a diagnostic draft PR with blocking findings. Human review is mandatory.",
      );
    }
    process.exit(PIPELINE_EXIT_CODES.pass);
  } catch (error) {
    console.error("Fatal error during daily draft PR workflow:", error);
    process.exit(PIPELINE_EXIT_CODES.internal);
  }
}

void main();
