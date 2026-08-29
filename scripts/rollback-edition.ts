#!/usr/bin/env bun
/**
 * CLI script to rollback published edition to a prior version/date (AB-703).
 *
 * Safely withdraws a problematic published edition or repoints the latest pointer
 * to an earlier known-good edition.
 */

import { editionSchema } from "@aaj-bas/schemas";

interface RollbackCliOptions {
  targetDate?: string;
  toPrevious: boolean;
  withdrawCurrent: boolean;
  editionsDir: string;
  dryRun: boolean;
}

function parseCliArgs(args: string[]): RollbackCliOptions {
  const options: RollbackCliOptions = {
    toPrevious: false,
    withdrawCurrent: false,
    editionsDir: "content/editions",
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
  --withdraw-current          Move current latest edition to draft status to prevent publishing
  --dry-run                   Preview rollback actions without modifying files
  --help, -h                  Show this help message
`);
  process.exit(0);
}

export async function discoverPublishedDates(
  editionsDir: string,
): Promise<string[]> {
  const dates: string[] = [];
  for await (const file of new Bun.Glob("*.json").scan({
    cwd: editionsDir,
    onlyFiles: true,
  })) {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
    if (dateMatch?.[1]) {
      try {
        const text = await Bun.file(`${editionsDir}/${file}`).text();
        const parsed = editionSchema.parse(JSON.parse(text));
        if (parsed.status === "published") {
          dates.push(dateMatch[1]);
        }
      } catch {
        // Skip invalid/unparseable files
      }
    }
  }
  dates.sort();
  return dates;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  try {
    const publishedDates = await discoverPublishedDates(options.editionsDir);

    if (publishedDates.length === 0) {
      console.log(
        "No published editions currently exist in",
        options.editionsDir,
      );
      process.exit(0);
    }

    const currentLatest = publishedDates[publishedDates.length - 1];
    let selectedDate: string | undefined = options.targetDate;

    if (options.toPrevious) {
      if (publishedDates.length < 2) {
        console.error(
          "Error: Cannot rollback to previous edition; only 1 published edition exists.",
        );
        process.exit(1);
      }
      selectedDate = publishedDates[publishedDates.length - 2];
    }

    if (!selectedDate) {
      console.error(
        "Error: Please specify --target-date <YYYY-MM-DD> or --to-previous.",
      );
      process.exit(1);
    }

    if (!publishedDates.includes(selectedDate)) {
      console.error(
        `Error: Selected rollback date '${selectedDate}' is not a published edition.`,
      );
      console.error("Available published dates:", publishedDates.join(", "));
      process.exit(1);
    }

    console.log(`\n🔄 Rollback Plan:`);
    console.log(`   - Current latest: ${currentLatest}`);
    console.log(`   - Target rollback: ${selectedDate}`);

    if (options.withdrawCurrent && currentLatest) {
      const currentPath = `${options.editionsDir}/${currentLatest}.json`;
      console.log(
        `   - Action: Withdrawing ${currentPath} (converting to draft)`,
      );
      if (!options.dryRun) {
        const text = await Bun.file(currentPath).text();
        const edition = JSON.parse(text);
        edition.status = "draft";
        await Bun.write(currentPath, `${JSON.stringify(edition, null, 2)}\n`);
      }
    }

    console.log(`\n📋 Next steps:`);
    console.log(`   1. Run 'bun run content:stage' to update staging.`);
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
