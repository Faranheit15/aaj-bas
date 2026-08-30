#!/usr/bin/env bun
/**
 * CLI script to promote an approved draft edition to a published edition (AB-703).
 *
 * 1. Loads approved draft from content/drafts/<date>.json (or --draft-file).
 * 2. Enforces preconditions (status: "draft", version 1, 0 corrections).
 * 3. Derives correct date and output target path content/editions/<date>.json.
 * 4. Converts draft status to "published" and marks stories reviewed: true.
 * 5. Runs validation check to ensure readiness for deployment.
 */

import {
  type ValidationPolicy,
  VALIDATION_EXIT_CODES,
  convertDraftToPublished,
  formatValidationText,
  validateEdition,
} from "@aaj-bas/domain";
import { editionSchema } from "@aaj-bas/schemas";

interface PublishCliOptions {
  date?: string;
  draftFile?: string;
  outDir: string;
  dryRun: boolean;
}

function parseCliArgs(args: string[]): PublishCliOptions {
  const options: PublishCliOptions = {
    outDir: "content/editions",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--date" && nextArg !== undefined) {
      options.date = nextArg;
      i += 1;
    } else if (arg?.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg === "--draft-file" && nextArg !== undefined) {
      options.draftFile = nextArg;
      i += 1;
    } else if (arg?.startsWith("--draft-file=")) {
      options.draftFile = arg.slice("--draft-file=".length);
    } else if (arg === "--out-dir" && nextArg !== undefined) {
      options.outDir = nextArg;
      i += 1;
    } else if (arg?.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    }
  }

  return options;
}

function printUsageAndExit(): never {
  console.log(`
Usage: bun scripts/publish-edition.ts [options]

Promotes an approved draft edition to published status for deployment.

Options:
  --date <YYYY-MM-DD>       Target date of draft to publish
  --draft-file <path>       Direct path to draft JSON file
  --out-dir <path>          Output directory (default: content/editions)
  --dry-run                 Validate without writing to disk
  --help, -h                Show this help message
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
  const options = parseCliArgs(process.argv.slice(2));

  if (!options.date && !options.draftFile) {
    console.error("Error: Either --date or --draft-file must be provided.");
    process.exit(VALIDATION_EXIT_CODES.usage);
  }

  const draftPath =
    options.draftFile ??
    (options.date ? `content/drafts/${options.date}.json` : undefined);

  if (!draftPath || !(await fileExists(draftPath))) {
    console.error(
      `Error: Draft edition file does not exist: ${draftPath ?? "unspecified"}`,
    );
    process.exit(VALIDATION_EXIT_CODES.usage);
  }

  try {
    const file = Bun.file(draftPath);
    const draftText = await file.text();
    const rawParsed: unknown = JSON.parse(draftText);
    const draftEdition = editionSchema.parse(rawParsed);

    if (draftEdition.status !== "draft") {
      console.error(
        `Error: Edition at ${draftPath} has status '${draftEdition.status}', expected 'draft'.`,
      );
      process.exit(VALIDATION_EXIT_CODES.usage);
    }

    if (options.date && options.date !== draftEdition.date) {
      console.error(
        `Error: Provided --date (${options.date}) does not match draft edition date (${draftEdition.date}).`,
      );
      process.exit(VALIDATION_EXIT_CODES.usage);
    }

    const targetDate = draftEdition.date;
    const targetPath = `${options.outDir}/${targetDate}.json`;

    // Convert draft to published edition
    const publishedEdition = convertDraftToPublished(draftEdition);
    const validated = editionSchema.parse(publishedEdition);
    const publishedJson = `${JSON.stringify(validated, null, 2)}\n`;

    // Validate with domain rules
    const policy: ValidationPolicy = { publish: true };
    const validationResult = validateEdition({
      file: targetPath,
      text: publishedJson,
    });

    const report = {
      reportVersion: 1 as const,
      editions: [validationResult],
      totalFindings: validationResult.findings.length,
      blockingCount: validationResult.findings.filter(
        (f) => f.severity === "blocking",
      ).length,
      warningCount: validationResult.findings.filter(
        (f) => f.severity === "warning",
      ).length,
    };

    if (report.blockingCount > 0) {
      console.error(formatValidationText(report, policy));
      console.error(
        "\n❌ Cannot publish edition: blocking validation findings detected.",
      );
      process.exit(VALIDATION_EXIT_CODES.blocking);
    }

    console.log(formatValidationText(report, policy));

    if (!options.dryRun) {
      await Bun.write(targetPath, publishedJson);
      // The source draft is generated JSON, while repository CI formats all
      // checked-in JSON. Validate first, then format the exact output that is
      // written for publication.
      runCommand("bunx", ["@biomejs/biome", "format", "--write", targetPath]);
      console.log(`\n🎉 Edition successfully published to ${targetPath}`);
    } else {
      console.log(
        `\n[DRY RUN] Edition validated. Would write to ${targetPath}`,
      );
    }

    process.exit(VALIDATION_EXIT_CODES.ok);
  } catch (error) {
    console.error("Fatal error publishing edition:", error);
    process.exit(VALIDATION_EXIT_CODES.internal);
  }
}

void main();
