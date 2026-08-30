#!/usr/bin/env bun
/**
 * CLI script to generate draft daily edition artifacts (AB-701, AB-702).
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
  type IngestionDiagnostics,
  type NormalizedFeedItem,
  type SourceIngestionDiagnostic,
  GOLDEN_PROMPT_DATASET_FULL,
  PIPELINE_EXIT_CODES,
  type SourceRegistry,
  createSummarizer,
  editorialDateInIndia,
  fetchFeed,
  fetchableSourcesOf,
  getFixtureModeUsageError,
  generateDraftEditionPipeline,
  normalizeFeedItems,
  parseRawFeed,
  sourceRegistrySchema,
  validateEditionDateInput,
  validateSourceRegistries,
} from "@aaj-bas/domain";
import { PRODUCTION_ENVIRONMENT } from "./fetch-environment";

interface CliOptions {
  date: string;
  sourcesPath: string;
  outDir: string;
  dryRun: boolean;
  printJson: boolean;
  printSummary: boolean;
  useAi: boolean;
  useFixture: boolean;
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
    useFixture: false,
    writeStepSummary: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--date" && nextArg !== undefined) {
      options.date = validateEditionDateInput(nextArg);
      i += 1;
    } else if (arg?.startsWith("--date=")) {
      options.date = validateEditionDateInput(arg.slice("--date=".length));
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
    } else if (arg === "--fixture") {
      options.useFixture = true;
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
  --date <YYYY-MM-DD>   Target edition date (default: today in India)
  --sources <path>      Path to sources.yml registry (default: content/sources.yml)
  --out-dir <path>      Output directory (default: content/drafts)
  --dry-run             Run pipeline without writing files to disk
  --json                Print generated edition JSON to stdout
  --summary             Print diagnostic Markdown summary to stdout
  --use-ai              Enable Cloudflare Workers AI (if credentials present in env)
  --fixture             Use offline golden dataset fixture (requires --dry-run; no --use-ai or --step-summary)
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

function runCommand(command: string, args: string[]): void {
  const result = Bun.spawnSync([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${stderr}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);
  const fixtureModeUsageError = getFixtureModeUsageError(options);

  if (fixtureModeUsageError) {
    console.error(`Usage error: ${fixtureModeUsageError}`);
    process.exit(PIPELINE_EXIT_CODES.usage);
  }

  try {
    // 1. Load and validate source registry if present
    let sourceRegistry: SourceRegistry | undefined;
    let normalizedItems: NormalizedFeedItem[] = [];

    let parsedYaml: unknown;
    if (!options.useFixture && (await fileExists(options.sourcesPath))) {
      const file = Bun.file(options.sourcesPath);
      const fileContent = await file.text();
      if (Bun.YAML?.parse) {
        parsedYaml = Bun.YAML.parse(fileContent);
        sourceRegistry = sourceRegistrySchema.parse(parsedYaml);
      }
    }

    // 2. Determine feed items and collect diagnostics
    let ingestionDiagnostics: IngestionDiagnostics;

    if (options.useFixture) {
      console.log(
        "ℹ️ Ingesting stories from golden dataset fixtures (--fixture).",
      );
      normalizedItems = GOLDEN_PROMPT_DATASET_FULL.flatMap(
        (tc) => tc.cluster.items,
      );
      ingestionDiagnostics = {
        fixtureMode: true,
        totalActiveSources: 0,
        successfulSources: 0,
        notModifiedSources: 0,
        failedSources: 0,
        totalParsedItems: normalizedItems.length,
        sources: [],
      };
    } else if (!sourceRegistry || parsedYaml === undefined) {
      console.log("⚠️ No valid source registry found in content/sources.yml.");
      normalizedItems = [];
      ingestionDiagnostics = {
        fixtureMode: false,
        totalActiveSources: 0,
        successfulSources: 0,
        notModifiedSources: 0,
        failedSources: 0,
        totalParsedItems: 0,
        sources: [],
      };
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
          "⚠️ No active production sources configured in registry (0 fetchable sources).",
        );
        normalizedItems = [];
        ingestionDiagnostics = {
          fixtureMode: false,
          totalActiveSources: 0,
          successfulSources: 0,
          notModifiedSources: 0,
          failedSources: 0,
          totalParsedItems: 0,
          sources: [],
        };
      } else {
        console.log(
          `📡 Ingesting from ${fetchable.length} active registry source(s)...`,
        );
        const sourceDiagnostics: SourceIngestionDiagnostic[] = [];
        const items: NormalizedFeedItem[] = [];
        let successfulCount = 0;
        let notModifiedCount = 0;
        let failedCount = 0;

        for (const source of fetchable) {
          const startTime = performance.now();
          const res = await fetchFeed(source, PRODUCTION_ENVIRONMENT);
          const durationMs = Math.round(performance.now() - startTime);

          if (res.kind === "success") {
            try {
              const rawItems = parseRawFeed(res.body, res.contentType);
              const normalized = normalizeFeedItems(res.sourceId, rawItems);
              items.push(...normalized);
              successfulCount += 1;
              sourceDiagnostics.push({
                sourceId: res.sourceId,
                status: "success",
                httpStatus: res.status,
                itemCount: normalized.length,
                durationMs,
              });
              console.log(
                `   ✓ Source ${res.sourceId}: fetched & parsed ${normalized.length} item(s)`,
              );
            } catch (parseErr) {
              failedCount += 1;
              const msg =
                parseErr instanceof Error ? parseErr.message : String(parseErr);
              sourceDiagnostics.push({
                sourceId: res.sourceId,
                status: "parse-failure",
                httpStatus: res.status,
                itemCount: 0,
                durationMs,
                error: `Feed parse error: ${msg.slice(0, 200)}`,
              });
              console.warn(
                `   ✗ Source ${res.sourceId}: feed parsing failed: ${msg}`,
              );
            }
          } else if (res.kind === "not-modified") {
            notModifiedCount += 1;
            sourceDiagnostics.push({
              sourceId: res.sourceId,
              status: "not-modified",
              httpStatus: 304,
              itemCount: 0,
              durationMs,
            });
            console.log(`   - Source ${res.sourceId}: 304 Not Modified`);
          } else {
            failedCount += 1;
            sourceDiagnostics.push({
              sourceId: res.sourceId,
              status: "fetch-failure",
              itemCount: 0,
              durationMs,
              error: `${res.code}: ${res.message.slice(0, 200)}`,
            });
            console.warn(
              `   ✗ Source ${res.sourceId}: fetch failure (${res.code}): ${res.message}`,
            );
          }
        }

        normalizedItems = items;
        ingestionDiagnostics = {
          fixtureMode: false,
          totalActiveSources: fetchable.length,
          successfulSources: successfulCount,
          notModifiedSources: notModifiedCount,
          failedSources: failedCount,
          totalParsedItems: items.length,
          sources: sourceDiagnostics,
        };
      }
    }

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
      ingestionDiagnostics,
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
      runCommand("bunx", ["@biomejs/biome", "format", "--write", editionPath]);
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
      console.warn(
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
