#!/usr/bin/env bun
/**
 * CLI script to apply an additive correction to a published edition (AB-704).
 *
 * Enforces:
 * - Version bump (version 1 -> 2, etc.)
 * - Creation of timestamped correction note
 * - Standalone audit trail in content/corrections/<id>.json
 * - Update of target story text and timestamps
 * - Strict schema and domain validation check
 */

import {
  VALIDATION_EXIT_CODES,
  applyEditionCorrection,
  formatValidationText,
  validateEdition,
} from "@aaj-bas/domain";
import { type Edition, editionSchema } from "@aaj-bas/schemas";

interface CorrectionCliOptions {
  date?: string;
  storyId?: string;
  summary?: string;
  detail?: string;
  updatedHeadline?: string;
  updatedDeck?: string;
  updatedWhyItMatters?: string;
  editionsDir: string;
  correctionsDir: string;
  dryRun: boolean;
}

function parseCliArgs(args: string[]): CorrectionCliOptions {
  const options: CorrectionCliOptions = {
    editionsDir: "content/editions",
    correctionsDir: "content/corrections",
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
    } else if (arg === "--story-id" && nextArg !== undefined) {
      options.storyId = nextArg;
      i += 1;
    } else if (arg?.startsWith("--story-id=")) {
      options.storyId = arg.slice("--story-id=".length);
    } else if (arg === "--summary" && nextArg !== undefined) {
      options.summary = nextArg;
      i += 1;
    } else if (arg?.startsWith("--summary=")) {
      options.summary = arg.slice("--summary=".length);
    } else if (arg === "--detail" && nextArg !== undefined) {
      options.detail = nextArg;
      i += 1;
    } else if (arg?.startsWith("--detail=")) {
      options.detail = arg.slice("--detail=".length);
    } else if (arg === "--updated-headline" && nextArg !== undefined) {
      options.updatedHeadline = nextArg;
      i += 1;
    } else if (arg === "--updated-deck" && nextArg !== undefined) {
      options.updatedDeck = nextArg;
      i += 1;
    } else if (arg === "--updated-why-it-matters" && nextArg !== undefined) {
      options.updatedWhyItMatters = nextArg;
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
Usage: bun scripts/create-correction.ts [options]

Applies an additive, version-incremented correction to a published edition.

Required Options:
  --date <YYYY-MM-DD>       Target edition date to correct
  --story-id <id>           ID of the story being corrected
  --summary <text>          Concise explanation of what was corrected (10-500 chars)

Optional Options:
  --detail <text>           Extended detail on the correction
  --updated-headline <text> Replacement headline
  --updated-deck <text>     Replacement deck
  --updated-why-it-matters <text> Replacement why-it-matters
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

  if (!options.date || !options.storyId || !options.summary) {
    console.error("Error: --date, --story-id, and --summary are required.");
    process.exit(VALIDATION_EXIT_CODES.usage);
  }

  const editionPath = `${options.editionsDir}/${options.date}.json`;

  try {
    if (!(await fileExists(editionPath))) {
      console.error(`Error: Edition file not found: ${editionPath}`);
      process.exit(VALIDATION_EXIT_CODES.usage);
    }

    const fileContent = await Bun.file(editionPath).text();
    const edition = editionSchema.parse(JSON.parse(fileContent));

    const updatedFields: {
      headline?: string;
      deck?: string;
      whyItMatters?: string;
    } = {};

    if (options.updatedHeadline)
      updatedFields.headline = options.updatedHeadline;
    if (options.updatedDeck) updatedFields.deck = options.updatedDeck;
    if (options.updatedWhyItMatters)
      updatedFields.whyItMatters = options.updatedWhyItMatters;

    const result = applyEditionCorrection({
      edition,
      storyId: options.storyId,
      summary: options.summary,
      detail: options.detail,
      updatedStoryFields:
        Object.keys(updatedFields).length > 0 ? updatedFields : undefined,
    });

    const updatedEditionJson = `${JSON.stringify(result.edition, null, 2)}\n`;
    const correctionNoteJson = `${JSON.stringify(result.correctionNote, null, 2)}\n`;

    // Validate with domain rules
    const validationResult = validateEdition({
      file: editionPath,
      text: updatedEditionJson,
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
      console.error(formatValidationText(report, { publish: true }));
      console.error(
        "\n❌ Cannot apply correction: blocking validation findings detected.",
      );
      process.exit(VALIDATION_EXIT_CODES.blocking);
    }

    console.log(formatValidationText(report, { publish: true }));

    const correctionPath = `${options.correctionsDir}/${result.correctionNote.id}.json`;

    if (!options.dryRun) {
      await Bun.write(editionPath, updatedEditionJson);
      await Bun.write(correctionPath, correctionNoteJson);
      console.log(`\n🎉 Correction applied successfully!`);
      console.log(
        `   - Edition updated: ${editionPath} (v${result.edition.editionVersion})`,
      );
      console.log(`   - Correction record: ${correctionPath}`);
    } else {
      console.log(
        `\n[DRY RUN] Would write updated edition to ${editionPath} and note to ${correctionPath}`,
      );
    }

    process.exit(VALIDATION_EXIT_CODES.ok);
  } catch (error) {
    console.error("Fatal error applying correction:", error);
    process.exit(VALIDATION_EXIT_CODES.internal);
  }
}

void main();
