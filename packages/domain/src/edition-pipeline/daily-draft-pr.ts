/**
 * Domain functions for daily draft PR formatting and workflow conventions (AB-702).
 */

import { editionDateSchema } from "@aaj-bas/schemas";
import { editorialDateInIndia } from "./pipeline";

export interface DailyDraftPrOptions {
  date: string;
  sourcesPath: string;
  outDir: string;
  dryRun: boolean;
  useAi: boolean;
  useFixture: boolean;
  baseBranch: string;
  writeStepSummary?: boolean;
}

export function validateEditionDateInput(dateString: string): string {
  const result = editionDateSchema.safeParse(dateString);
  if (!result.success) {
    throw new Error(
      `Invalid edition date "${dateString}". Must be a valid calendar date in YYYY-MM-DD format.`,
    );
  }
  return result.data;
}

export function parseDailyDraftPrArgs(args: string[]): DailyDraftPrOptions {
  const today = editorialDateInIndia();
  const options: DailyDraftPrOptions = {
    date: today,
    sourcesPath: "content/sources.yml",
    outDir: "content/drafts",
    dryRun: false,
    useAi: false,
    useFixture: false,
    baseBranch: "develop",
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
    } else if (arg === "--base" && nextArg !== undefined) {
      options.baseBranch = nextArg;
      i += 1;
    } else if (arg?.startsWith("--base=")) {
      options.baseBranch = arg.slice("--base=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--use-ai") {
      options.useAi = true;
    } else if (arg === "--fixture") {
      options.useFixture = true;
    } else if (arg === "--step-summary") {
      options.writeStepSummary = true;
    }
  }

  return options;
}

export function formatPrBranchName(date: string): string {
  return `draft/${date}`;
}

export function formatPrTitle(date: string): string {
  return `Draft edition: ${date}`;
}

export function composePrBody(
  summaryMarkdown: string,
  hasBlockingIssues: boolean,
  date: string,
): string {
  const statusNotice = hasBlockingIssues
    ? `> ⚠️ **BLOCKING FINDINGS**: This draft edition for \`${date}\` contains blocking validation or factual support issues. Human editorial review and correction are required before publication.`
    : `> ✅ **READY FOR EDITORIAL REVIEW**: All automated factual support and schema validation checks passed. Ready for human review and merge.`;

  return [
    statusNotice,
    "",
    "---",
    "",
    summaryMarkdown,
    "",
    "---",
    "### Publication Checklist for Maintainers",
    "- [ ] Verify factual summary matches original source citations.",
    "- [ ] Check topic balance and diversity requirements.",
    "- [ ] Review any warnings or uncertainty notes.",
    "- [ ] Merge pull request to trigger automatic static publication on `develop`.",
  ].join("\n");
}
