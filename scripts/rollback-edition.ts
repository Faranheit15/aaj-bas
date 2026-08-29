#!/usr/bin/env bun
/**
 * CLI script to rollback published edition to a prior version/date (AB-703, AB-803).
 *
 * Safely withdraws a problematic published edition and repoints the latest pointer
 * to an earlier known-good edition using pure domain rollback planning.
 */

import { type RollbackEditionSummary, planRollback } from "@aaj-bas/domain";
import { editionSchema } from "@aaj-bas/schemas";

interface RollbackCliOptions {
  targetDate?: string;
  toPrevious: boolean;
  withdrawCurrent: boolean;
  editionsDir: string;
  draftsDir: string;
  dryRun: boolean;
}

function parseCliArgs(args: string[]): RollbackCliOptions {
  const options: RollbackCliOptions = {
    toPrevious: false,
    withdrawCurrent: false,
    editionsDir: "content/editions",
    draftsDir: "content/drafts",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--target-date" && nextArg !== undefined) {
      options.targetDate = nextArg;
      i += 1;
    } else if (arg?.startsWith("--target-date=")) {
      options.targetDate = arg.slice("--target-date=".length);
    } else if (arg === "--to-previous") {
      options.toPrevious = true;
    } else if (arg === "--withdraw-current") {
      options.withdrawCurrent = true;
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
Usage: bun scripts/rollback-edition.ts [options]

Rolls back the published latest edition pointer or withdraws a bad edition.

Options:
  --target-date <YYYY-MM-DD>  Rollback to a specific prior edition date
  --to-previous               Rollback to the immediately preceding published edition
  --withdraw-current          Move editions newer than target date to drafts
  --dry-run                   Preview rollback actions without modifying files
  --help, -h                  Show this help message
`);
  process.exit(0);
}

export async function discoverAvailableEditions(
  editionsDir: string,
): Promise<RollbackEditionSummary[]> {
  const editions: RollbackEditionSummary[] = [];
  for await (const file of new Bun.Glob("*.json").scan({
    cwd: editionsDir,
    onlyFiles: true,
  })) {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
    if (dateMatch?.[1]) {
      const fullPath = `${editionsDir}/${file}`;
      try {
        const text = await Bun.file(fullPath).text();
        const parsed = editionSchema.parse(JSON.parse(text));
        editions.push({
          date: parsed.date,
          status: parsed.status,
          editionVersion: parsed.editionVersion,
          hasCorrections:
            Boolean(parsed.correctionNotes) &&
            parsed.correctionNotes.length > 0,
          filePath: fullPath,
        });
      } catch {
        // Skip invalid/unparseable files
      }
    }
  }
  editions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return editions;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  try {
    const available = await discoverAvailableEditions(options.editionsDir);

    if (available.length === 0) {
      console.log("No editions currently exist in", options.editionsDir);
      process.exit(0);
    }

    const result = planRollback(available, {
      targetDate: options.targetDate,
      toPrevious: options.toPrevious,
      withdrawCurrent: options.withdrawCurrent,
    });

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      console.error(
        "Available published/corrected dates:",
        available
          .filter((e) => e.status === "published" || e.status === "corrected")
          .map((e) => e.date)
          .join(", "),
      );
      process.exit(1);
    }

    const { plan } = result;

    console.log(`\n🔄 Rollback Plan:`);
    console.log(`   - Current latest: ${plan.currentLatest}`);
    console.log(
      `   - Target rollback: ${plan.targetDate} (${plan.targetEdition.status}, v${plan.targetEdition.editionVersion})`,
    );
    console.log(
      `   - Editions to withdraw: ${plan.editionsToWithdraw.length > 0 ? plan.editionsToWithdraw.map((e) => e.date).join(", ") : "none"}`,
    );
    console.log(
      `   - Remaining published dates: ${plan.remainingPublishedDates.join(", ")}`,
    );

    for (const editionToWithdraw of plan.editionsToWithdraw) {
      const sourcePath = editionToWithdraw.filePath;
      const draftTargetPath = `${options.draftsDir}/${editionToWithdraw.date}.json`;
      console.log(
        `   - Action: Withdrawing ${sourcePath} -> moving to ${draftTargetPath}`,
      );

      if (!options.dryRun) {
        const text = await Bun.file(sourcePath).text();
        const edition = JSON.parse(text);

        // If published without corrections, reset to draft
        if (
          edition.status === "published" &&
          (!edition.correctionNotes || edition.correctionNotes.length === 0)
        ) {
          edition.status = "draft";
          edition.stories = edition.stories.map(
            (s: { reviewed?: boolean }) => ({ ...s, reviewed: false }),
          );
        }

        await Bun.write(
          draftTargetPath,
          `${JSON.stringify(edition, null, 2)}\n`,
        );
        await Bun.file(sourcePath).delete();
      }
    }

    console.log(`\n📋 Next steps:`);
    console.log(`   1. Run 'bun run content:stage' to update staging index.`);
    console.log(`   2. Run 'bun run check' to verify suite passes.`);
    console.log(
      `   3. Commit and deploy to complete the rollback in production.`,
    );

    process.exit(0);
  } catch (error) {
    console.error("Fatal error during rollback:", error);
    process.exit(1);
  }
}

void main();
