#!/usr/bin/env bun
/**
 * CLI script to orchestrate the daily edition draft PR workflow (AB-702).
 *
 * 1. Generates draft edition artifacts (JSON and companion Markdown summary).
 * 2. Prepares branch `draft/<date>`.
 * 3. Commits and pushes artifacts to origin.
 * 4. Opens or updates a draft PR on GitHub targeting `develop`.
 * 5. Decorates PR body with blocker/readiness notices.
 */

import {
  type DailyDraftPrOptions,
  type EditionPipelineInput,
  GOLDEN_PROMPT_DATASET_FULL,
  PIPELINE_EXIT_CODES,
  type SourceRegistry,
  composePrBody,
  createSummarizer,
  formatPrBranchName,
  formatPrTitle,
  generateDraftEditionPipeline,
  parseDailyDraftPrArgs,
  sourceRegistrySchema,
} from "@aaj-bas/domain";

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
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
  try {
    if (await fileExists(options.sourcesPath)) {
      const file = Bun.file(options.sourcesPath);
      const fileContent = await file.text();
      if (Bun.YAML?.parse) {
        const parsed: unknown = Bun.YAML.parse(fileContent);
        sourceRegistry = sourceRegistrySchema.parse(parsed);
      }
    }
  } catch {
    // Graceful offline fallback
  }

  // 2. Feed items
  const normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
    (tc) => tc.cluster.items,
  );

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

  console.log(`\n📅 Daily Draft Workflow for ${options.date}`);
  console.log(`   - Branch: ${branchName}`);
  console.log(`   - Title: ${prTitle}`);
  console.log(
    `   - Blocking issues: ${result.hasBlockingIssues ? "YES (Review Required)" : "NO (Clean)"}`,
  );
  console.log(`   - Artifacts: ${editionPath}, ${summaryPath}`);

  if (options.dryRun) {
    console.log("\n[DRY RUN] Would execute:");
    console.log(`  git checkout -B ${branchName}`);
    console.log(`  git add ${editionPath} ${summaryPath}`);
    console.log(
      `  git commit -m "feat(content): generate draft edition for ${options.date}"`,
    );
    console.log(`  git push -u origin ${branchName}`);
    console.log(
      `  gh pr create --draft --base ${options.baseBranch} --head ${branchName} --title "${prTitle}" --body-file ${summaryPath}`,
    );
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
        "\n⚠️ Workflow finished with blocking findings. Human review is mandatory.",
      );
      process.exit(PIPELINE_EXIT_CODES.blockingFindings);
    }
    process.exit(PIPELINE_EXIT_CODES.pass);
  } catch (error) {
    console.error("Fatal error during daily draft PR workflow:", error);
    process.exit(PIPELINE_EXIT_CODES.internal);
  }
}

void main();
