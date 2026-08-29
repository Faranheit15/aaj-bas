#!/usr/bin/env bun
/**
 * Post-deployment / pre-deployment smoke test for published editions (AB-703).
 *
 * Verifies that the deployed reader index (`/content/latest.json`) and the latest
 * edition document (`/content/editions/<date>.json`) are reachable and satisfy all
 * structural invariants.
 */

import { editionIndexSchema, editionSchema } from "@aaj-bas/schemas";

interface SmokeCliOptions {
  baseUrl?: string;
  dirPath?: string;
  timeoutMs: number;
}

function parseCliArgs(args: string[]): SmokeCliOptions {
  const options: SmokeCliOptions = {
    dirPath: "apps/web/dist",
    timeoutMs: 10000,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--url" && nextArg !== undefined) {
      options.baseUrl = nextArg.replace(/\/$/, "");
      i += 1;
    } else if (arg?.startsWith("--url=")) {
      options.baseUrl = arg.slice("--url=".length).replace(/\/$/, "");
    } else if (arg === "--dir" && nextArg !== undefined) {
      options.dirPath = nextArg;
      i += 1;
    } else if (arg?.startsWith("--dir=")) {
      options.dirPath = arg.slice("--dir=".length);
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    }
  }

  return options;
}

function printUsageAndExit(): never {
  console.log(`
Usage: bun scripts/smoke-test-edition.ts [options]

Smoke tests deployed or staged edition content.

Options:
  --url <baseUrl>       Base URL of deployed web reader (e.g. https://aaj-bas-web.pages.dev)
  --dir <path>          Local build directory to test (default: apps/web/dist)
  --help, -h            Show this help message
`);
  process.exit(0);
}

export async function fetchOrReadFile(
  relativePath: string,
  options: SmokeCliOptions,
): Promise<string> {
  if (options.baseUrl) {
    const fullUrl = `${options.baseUrl}/${relativePath.replace(/^\//, "")}`;
    const response = await fetch(fullUrl, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} for ${fullUrl}`,
      );
    }
    return await response.text();
  }

  const localPath = `${options.dirPath}/${relativePath.replace(/^\//, "")}`;
  try {
    const stat = await Bun.file(localPath).stat();
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${localPath}`);
    }
  } catch (error) {
    throw new Error(`File does not exist: ${localPath}`);
  }
  return await Bun.file(localPath).text();
}

export async function runSmokeTest(options: SmokeCliOptions): Promise<{
  passed: boolean;
  latestDate: string | null;
  coreStoriesCount: number;
  checks: string[];
}> {
  const checks: string[] = [];

  // 1. Fetch & validate latest.json
  const indexText = await fetchOrReadFile("content/latest.json", options);
  const rawIndex: unknown = JSON.parse(indexText);
  const index = editionIndexSchema.parse(rawIndex);
  checks.push(
    `✅ Index verified: contentSet=${index.contentSet}, latest=${index.latest ?? "none"}`,
  );

  if (index.latest === null) {
    checks.push(
      "ℹ️ No published edition currently staged (legitimate initial state).",
    );
    return {
      passed: true,
      latestDate: null,
      coreStoriesCount: 0,
      checks,
    };
  }

  // 2. Fetch & validate target edition
  const editionPath = `content/editions/${index.latest}.json`;
  const editionText = await fetchOrReadFile(editionPath, options);
  const rawEdition: unknown = JSON.parse(editionText);
  const edition = editionSchema.parse(rawEdition);

  checks.push(`✅ Edition schema validated for ${index.latest}`);

  // 3. Status invariant
  if (edition.status !== "published") {
    throw new Error(
      `Expected edition status to be 'published', received '${edition.status}'`,
    );
  }
  checks.push("✅ Edition status is 'published'");

  // 4. Core stories invariant (exactly 8 core stories)
  if (edition.coreStoryIds.length !== 8) {
    throw new Error(
      `Expected exactly 8 coreStoryIds, found ${edition.coreStoryIds.length}`,
    );
  }
  checks.push("✅ Core stories count is exactly 8");

  // 5. Referential integrity
  const storyIds = new Set(edition.stories.map((s: { id: string }) => s.id));
  for (const coreId of edition.coreStoryIds) {
    if (!storyIds.has(coreId)) {
      throw new Error(`Core story ID '${coreId}' missing from edition.stories`);
    }
  }
  checks.push("✅ Core story references exist in stories list");

  const sourceIds = new Set(edition.sources.map((s: { id: string }) => s.id));
  for (const story of edition.stories) {
    for (const src of story.sourceIds) {
      if (!sourceIds.has(src)) {
        throw new Error(
          `Cited sourceId '${src}' in story '${story.id}' is missing from edition.sources`,
        );
      }
    }
  }
  checks.push("✅ All cited story source IDs resolved in edition.sources");

  return {
    passed: true,
    latestDate: index.latest,
    coreStoriesCount: edition.coreStoryIds.length,
    checks,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  console.log(
    `\n🔍 Starting smoke test (${options.baseUrl ?? options.dirPath})...`,
  );

  try {
    const result = await runSmokeTest(options);
    for (const check of result.checks) {
      console.log(`   ${check}`);
    }
    console.log(`\n🎉 Smoke test PASSED successfully.`);
    process.exit(0);
  } catch (error) {
    console.error(
      `\n❌ Smoke test FAILED:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

void main();
