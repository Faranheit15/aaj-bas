#!/usr/bin/env bun
/**
 * CLI script to generate draft daily edition artifacts.
 *
 * Runs the end-to-end editorial pipeline: ingestion, deduplication, clustering,
 * candidate ranking, summarization, and factual support validation.
 *
 * Writes:
 *   - content/drafts/<date>.json (Draft Edition JSON)
 *   - content/drafts/<date>-summary.md (Companion PR summary)
 */

import {
  type EditionPipelineInput,
  GOLDEN_PROMPT_DATASET_FULL,
  PIPELINE_EXIT_CODES,
  type SourceRegistry,
  createSummarizer,
  editorialDateInIndia,
  generateDraftEditionPipeline,
  sourceRegistrySchema,
} from "@aaj-bas/domain";

interface CliOptions {
  date: string;
  sourcesPath: string;
  outDir: string;
  dryRun: boolean;
  printJson: boolean;
  printSummary: boolean;
  useAi: boolean;
  writeStepSummary: boolean;
}

function parseCliArgs(args: string[]): CliOptions {
  const today = editorialDateInIndia();
  const options: CliOptions = {
    date: today,
    sourcesPath: "content/sources.yml",
    outDir: "content/drafts",
    dryRun: false,
    printJson: false,
    printSummary: false,
    useAi: false,
    writeStepSummary: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--date" && nextArg !== undefined) {
      options.date = nextArg;
      i += 1;
    } else if (arg?.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg === "--sources" && nextArg !== undefined) {
      options.sourcesPath = nextArg;
      i += 1;
    } else if (arg?.startsWith("--sources=")) {
      options.sourcesPath = arg.slice("--sources=".length);
    } else if (arg === "--out-dir" && nextArg !== undefined) {
      options.outDir = nextArg;
      i += 1;
    } else if (arg?.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.printJson = true;
    } else if (arg === "--summary") {
      options.printSummary = true;
    } else if (arg === "--use-ai") {
      options.useAi = true;
    } else if (arg === "--step-summary") {
      options.writeStepSummary = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    }
  }

  return options;
}

function printUsageAndExit(): never {
  console.log(`
Usage: bun scripts/generate-draft-edition.ts [options]

Generates draft edition artifacts and companion diagnostic PR summaries.

Options:
  --date <YYYY-MM-DD>   Target edition date (default: today)
  --sources <path>      Path to sources.yml registry (default: content/sources.yml)
  --out-dir <path>      Output directory (default: content/drafts)
  --dry-run             Run pipeline without writing files to disk
  --json                Print generated edition JSON to stdout
  --summary             Print diagnostic Markdown summary to stdout
  --use-ai              Enable Cloudflare Workers AI (if credentials present in env)
  --step-summary        Write markdown summary to GITHUB_STEP_SUMMARY if present
  --help, -h            Show this help message
`);
  process.exit(0);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

  try {
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
      // Offline fallback if registry file is not present or in dry-run
    }

    // 2. Prepare feed items (combining items from golden dataset for robust offline staging)
    const normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
      (tc) => tc.cluster.items,
    );

    // 3. Configure Summarizer
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

    // 4. Execute Pipeline
    const pipelineInput: EditionPipelineInput = {
      date: options.date,
      normalizedItems,
      sourceRegistry,
      summarizer,
    };

    const result = await generateDraftEditionPipeline(pipelineInput);

    // 5. Output Handling
    if (options.printJson) {
      console.log(result.editionJson);
    } else if (options.printSummary) {
      console.log(result.summaryMarkdown);
    } else {
      console.log(
        `✅ Draft edition for ${options.date} generated successfully in ${result.diagnostics.durationMs}ms`,
      );
      console.log(
        `   - Core stories: ${result.diagnostics.coreStoriesCount} | Pool stories: ${result.diagnostics.poolStoriesCount}`,
      );
      console.log(
        `   - Factual support check: ${result.factualReport.passed ? "PASS" : "BLOCK"}`,
      );
      console.log(
        `   - Edition validation: ${result.editionValidation.publishable ? "PASS" : "FAIL"}`,
      );
      if (result.editionValidation.findings.length > 0) {
        for (const f of result.editionValidation.findings) {
          console.log(`     * [${f.severity}] ${f.ruleId}: ${f.message}`);
        }
      }
    }

    // 6. Write artifacts to disk if not in dry-run mode
    if (!options.dryRun) {
      const editionPath = `${options.outDir}/${options.date}.json`;
      const summaryPath = `${options.outDir}/${options.date}-summary.md`;

      await Bun.write(editionPath, `${result.editionJson}\n`);
      await Bun.write(summaryPath, `${result.summaryMarkdown}\n`);

      console.log(`\n📄 Artifacts written to:`);
      console.log(`   - ${editionPath}`);
      console.log(`   - ${summaryPath}`);
    }

    // 7. Write to GitHub Step Summary if requested
    if (options.writeStepSummary && process.env.GITHUB_STEP_SUMMARY) {
      const summaryFile = process.env.GITHUB_STEP_SUMMARY;
      const existing = (await fileExists(summaryFile))
        ? await Bun.file(summaryFile).text()
        : "";
      await Bun.write(summaryFile, `${existing}\n${result.summaryMarkdown}\n`);
    }

    if (result.hasBlockingIssues) {
      console.error(
        "\n⚠️ Warning: Generated draft edition contains blocking factual or validation findings.",
      );
      process.exit(PIPELINE_EXIT_CODES.blockingFindings);
    }

    process.exit(PIPELINE_EXIT_CODES.pass);
  } catch (error) {
    console.error("Fatal error during draft edition generation:", error);
    process.exit(PIPELINE_EXIT_CODES.internal);
  }
}

void main();
