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
  fetchFeeds,
  formatPrBranchName,
  formatPrTitle,
  generateDraftEditionPipeline,
  normalizeFeedItems,
  parseDailyDraftPrArgs,
  parseRawFeed,
  sourceRegistrySchema,
  validateSourceRegistries,
} from "@aaj-bas/domain";
import { PRODUCTION_ENVIRONMENT } from "./fetch-environment";

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr}`);
  }

  return result.stdout ? new TextDecoder().decode(result.stdout).trim() : "";
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

  let parsedYaml: unknown;
  if (await fileExists(options.sourcesPath)) {
    const file = Bun.file(options.sourcesPath);
    const fileContent = await file.text();
    if (Bun.YAML?.parse) {
      parsedYaml = Bun.YAML.parse(fileContent);
      sourceRegistry = sourceRegistrySchema.parse(parsedYaml);
    }
  }

  // 2. Determine feed items
  if (options.useFixture) {
    console.log(
      "ℹ️ Ingesting stories from golden dataset fixtures (--fixture).",
    );
    normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );
  } else if (!sourceRegistry || parsedYaml === undefined) {
    console.log(
      "ℹ️ No source registry found. Using fixtures for local development.",
    );
    normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );
  } else {
    const validationReport = validateSourceRegistries([
      { file: options.sourcesPath, value: parsedYaml },
    ]);
    const validatedRegistry = validationReport.registries[0];
    const fetchable = validatedRegistry
      ? fetchableSourcesOf(sourceRegistry, validatedRegistry.sources)
      : [];

    if (fetchable.length === 0) {
      console.log(
        "ℹ️ No active production sources configured in registry. Using staging fixtures for local development.",
      );
      normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
        (tc) => tc.cluster.items,
      );
    } else {
      console.log(
        `📡 Ingesting from ${fetchable.length} active registry source(s)...`,
      );
      const fetchResults = await fetchFeeds(fetchable, PRODUCTION_ENVIRONMENT);
      const items: NormalizedFeedItem[] = [];

      for (const res of fetchResults) {
        if (res.kind === "success") {
          try {
            const rawItems = parseRawFeed(res.body, res.contentType);
            const normalized = normalizeFeedItems(res.sourceId, rawItems);
            items.push(...normalized);
            console.log(
              `   ✓ Source ${res.sourceId}: fetched & parsed ${normalized.length} item(s)`,
            );
          } catch (parseErr) {
            console.warn(
              `   ✗ Source ${res.sourceId}: feed parsing failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
            );
          }
        } else if (res.kind === "not-modified") {
          console.log(`   - Source ${res.sourceId}: 304 Not Modified`);
        } else {
          console.warn(
            `   ✗ Source ${res.sourceId}: fetch failure (${res.code}): ${res.message}`,
          );
        }
      }

      normalizedItems = items;
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
