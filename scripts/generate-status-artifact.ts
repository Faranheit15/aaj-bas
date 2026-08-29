#!/usr/bin/env bun
/**
 * CLI script to generate the static system health and status artifact (AB-803).
 *
 * Emits content/status.json conforming to statusArtifactSchema.
 */

import {
  type StatusArtifact,
  type SystemHealthStatus,
  editionIndexSchema,
  editionSchema,
  statusArtifactSchema,
} from "@aaj-bas/schemas";
import { validateSourceRegistry } from "@aaj-bas/domain";

interface StatusCliOptions {
  editionsDir: string;
  sourcesFile: string;
  indexFile: string;
  outFile: string;
  dryRun: boolean;
}

function parseCliArgs(args: string[]): StatusCliOptions {
  const options: StatusCliOptions = {
    editionsDir: "content/editions",
    sourcesFile: "content/sources.yml",
    indexFile: "content/latest.json",
    outFile: "content/status.json",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--out" && nextArg !== undefined) {
      options.outFile = nextArg;
      i += 1;
    } else if (arg?.startsWith("--out=")) {
      options.outFile = arg.slice("--out=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Bun.file(path).stat();
    return !stat.isDirectory();
  } catch {
    return false;
  }
}

export async function generateStatusArtifact(
  options: StatusCliOptions,
): Promise<StatusArtifact> {
  const checks: { name: string; passed: boolean; detail?: string }[] = [];

  // 1. Check sources registry
  let totalSources = 0;
  let activeSources = 0;
  try {
    if (await fileExists(options.sourcesFile)) {
      const yamlText = await Bun.file(options.sourcesFile).text();
      const parsedYaml = Bun.YAML.parse(yamlText);
      const registryResult = validateSourceRegistry({
        file: options.sourcesFile,
        value: parsedYaml,
      });

      const blockingFindings = registryResult.findings.filter(
        (f) => f.severity === "blocking",
      );
      totalSources = registryResult.declaredSources ?? 0;
      activeSources = registryResult.sources.filter((s) => s.fetchable).length;

      if (blockingFindings.length === 0) {
        checks.push({
          name: "source_registry",
          passed: true,
          detail: `${activeSources}/${totalSources} sources active`,
        });
      } else {
        checks.push({
          name: "source_registry",
          passed: false,
          detail: `Registry has ${blockingFindings.length} blocking findings`,
        });
      }
    } else {
      checks.push({
        name: "source_registry",
        passed: false,
        detail: `Missing sources file: ${options.sourcesFile}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "source_registry",
      passed: false,
      detail: err instanceof Error ? err.message : "Error reading sources",
    });
  }

  // 2. Discover published editions
  let publishedCount = 0;
  const publishedDates: string[] = [];

  for await (const file of new Bun.Glob("*.json").scan({
    cwd: options.editionsDir,
    onlyFiles: true,
  })) {
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
    if (dateMatch?.[1]) {
      try {
        const text = await Bun.file(`${options.editionsDir}/${file}`).text();
        const parsed = editionSchema.parse(JSON.parse(text));
        if (parsed.status === "published" || parsed.status === "corrected") {
          publishedCount += 1;
          publishedDates.push(dateMatch[1]);
        }
      } catch {
        // Skip unparseable
      }
    }
  }

  publishedDates.sort();
  const latestDiscoveredDate =
    publishedDates.length > 0
      ? (publishedDates[publishedDates.length - 1] ?? null)
      : null;

  checks.push({
    name: "published_editions",
    passed: publishedCount > 0,
    detail: `${publishedCount} published editions found`,
  });

  // 3. Verify latest pointer
  let indexLatest: string | null = null;
  try {
    if (await fileExists(options.indexFile)) {
      const indexText = await Bun.file(options.indexFile).text();
      const parsedIndex = editionIndexSchema.parse(JSON.parse(indexText));
      indexLatest = parsedIndex.latest;
      checks.push({
        name: "latest_pointer",
        passed: true,
        detail: `Pointer targets: ${indexLatest ?? "none"}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "latest_pointer",
      passed: false,
      detail: err instanceof Error ? err.message : "Invalid index pointer",
    });
  }

  // Determine overall status
  const allChecksPassed = checks.every((c) => c.passed);
  let status: SystemHealthStatus = "healthy";

  if (!allChecksPassed) {
    status = activeSources === 0 ? "offline" : "degraded";
  } else if (publishedCount === 0) {
    status = "warning";
  }

  const artifact: StatusArtifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    latestEditionDate: indexLatest ?? latestDiscoveredDate,
    publishedEditionsCount: publishedCount,
    sources: {
      total: totalSources,
      active: activeSources,
    },
    checks,
  };

  return statusArtifactSchema.parse(artifact);
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  try {
    const artifact = await generateStatusArtifact(options);
    const jsonOutput = `${JSON.stringify(artifact, null, 2)}\n`;

    if (!options.dryRun) {
      await Bun.write(options.outFile, jsonOutput);
      console.log(`✅ Health status artifact written to ${options.outFile}`);
    } else {
      console.log(
        `[DRY RUN] Would write status artifact to ${options.outFile}:`,
      );
    }
    console.log(jsonOutput);
    process.exit(0);
  } catch (err) {
    console.error("Fatal error generating status artifact:", err);
    process.exit(1);
  }
}

void main();
