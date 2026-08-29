#!/usr/bin/env bun
/**
 * CLI script to publish an approved daily edition draft (AB-703).
 *
 * 1. Reads approved draft JSON from `content/drafts/<date>.json`.
 * 2. Sets status to "published" and reviewed to true.
 * 3. Validates against `editionSchema` and strict publishing validation rules.
 * 4. Writes to `content/editions/<date>.json`.
 * 5. Runs validation check to ensure readiness for deployment.
 */

import { editionSchema } from "@aaj-bas/schemas";
import {
  type ValidationPolicy,
  VALIDATION_EXIT_CODES,
  convertDraftToPublished,
  formatValidationText,
  validateEdition,
} from "@aaj-bas/domain";

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

Publishes an approved draft edition to content/editions/<date>.json.

Options:
  --date <YYYY-MM-DD>       Target edition date
  --draft-file <path>       Path to draft JSON (default: content/drafts/<date>.json)
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

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (!options.date && !options.draftFile) {
    console.error("Error: Either --date or --draft-file must be provided.");
    process.exit(VALIDATION_EXIT_CODES.usage);
  }

  const date = options.date ?? "custom";
  const draftPath = options.draftFile ?? `content/drafts/${date}.json`;
  const targetPath = `${options.outDir}/${date}.json`;

  try {
    if (!(await fileExists(draftPath))) {
      console.error(`Error: Draft edition file does not exist: ${draftPath}`);
      process.exit(VALIDATION_EXIT_CODES.usage);
    }

    const file = Bun.file(draftPath);
    const draftText = await file.text();
    const rawParsed: unknown = JSON.parse(draftText);
    const draftEdition = editionSchema.parse(rawParsed);

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
      console.log(`\n🎉 Edition published successfully to ${targetPath}`);
    } else {
      console.log(`\n[DRY RUN] Would write published edition to ${targetPath}`);
    }

    process.exit(VALIDATION_EXIT_CODES.ok);
  } catch (error) {
    console.error("Fatal error publishing edition:", error);
    process.exit(VALIDATION_EXIT_CODES.internal);
  }
}

void main();
