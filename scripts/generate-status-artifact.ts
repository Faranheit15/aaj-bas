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

export interface StatusCliOptions {
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
    } else if (arg === "--editions" && nextArg !== undefined) {
      options.editionsDir = nextArg;
      i += 1;
    } else if (arg?.startsWith("--editions=")) {
      options.editionsDir = arg.slice("--editions=".length);
    } else if (arg === "--sources" && nextArg !== undefined) {
      options.sourcesFile = nextArg;
      i += 1;
    } else if (arg?.startsWith("--sources=")) {
      options.sourcesFile = arg.slice("--sources=".length);
    } else if (arg === "--index" && nextArg !== undefined) {
      options.indexFile = nextArg;
      i += 1;
    } else if (arg?.startsWith("--index=")) {
      options.indexFile = arg.slice("--index=".length);
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
  const generatedAt = new Date().toISOString();
  const checks: { name: string; passed: boolean; detail?: string }[] = [];

  // 1. Validate source registry
  let totalSourcesCount = 0;
  let activeSourceCount = 0;
  try {
    if (await fileExists(options.sourcesFile)) {
      const text = await Bun.file(options.sourcesFile).text();
      if (Bun.YAML?.parse) {
        const parsed = Bun.YAML.parse(text);
        const report = validateSourceRegistry({
          file: options.sourcesFile,
          value: parsed,
        });
        totalSourcesCount = report.declaredSources ?? 0;
        const hasBlocking = report.findings.some(
          (f) => f.severity === "blocking",
        );
        if (!hasBlocking) {
          activeSourceCount = report.sources.filter(
            (s) => s.fetchable === true,
          ).length;
          if (activeSourceCount === 0) {
            checks.push({
              name: "source_registry",
              passed: false,
              detail:
                "Source registry contains 0 active sources; editorial pipeline cannot fetch news",
            });
          } else {
            checks.push({
              name: "source_registry",
              passed: true,
              detail: `Source registry is valid with ${activeSourceCount} active sources`,
            });
          }
        } else {
          checks.push({
            name: "source_registry",
            passed: false,
            detail: `Source registry validation failed: ${report.findings.length} findings`,
          });
        }
      } else {
        checks.push({
          name: "source_registry",
          passed: false,
          detail: "YAML parser unavailable in runtime environment",
        });
      }
    } else {
      checks.push({
        name: "source_registry",
        passed: false,
        detail: `Source registry file missing: ${options.sourcesFile}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "source_registry",
      passed: false,
      detail: `Failed reading source registry: ${String(err)}`,
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
    passed: true,
    detail: `${publishedCount} published editions found`,
  });

  // 3. Verify latest pointer (checking options.indexFile, fallback to staged index if default)
  let resolvedIndexFile = options.indexFile;
  if (!(await fileExists(resolvedIndexFile))) {
    if (await fileExists("apps/web/public/content/latest.json")) {
      resolvedIndexFile = "apps/web/public/content/latest.json";
    } else if (await fileExists("apps/web/dist/content/latest.json")) {
      resolvedIndexFile = "apps/web/dist/content/latest.json";
    }
  }

  let indexLatest: string | null = null;
  try {
    if (await fileExists(resolvedIndexFile)) {
      const indexText = await Bun.file(resolvedIndexFile).text();
      const parsedIndex = editionIndexSchema.parse(JSON.parse(indexText));
      indexLatest = parsedIndex.latest;

      if (indexLatest === null) {
        if (publishedCount === 0) {
          checks.push({
            name: "latest_pointer",
            passed: true,
            detail: "No editions published yet (valid initial state)",
          });
        } else {
          checks.push({
            name: "latest_pointer",
            passed: false,
            detail: `latest pointer is null despite ${publishedCount} published editions`,
          });
        }
      } else {
        const targetPath = `${options.editionsDir}/${indexLatest}.json`;
        if (!(await fileExists(targetPath))) {
          checks.push({
            name: "latest_pointer",
            passed: false,
            detail: `latest.json targets missing file: ${targetPath}`,
          });
        } else {
          const targetText = await Bun.file(targetPath).text();
          const targetParsed = editionSchema.parse(JSON.parse(targetText));
          if (
            targetParsed.status !== "published" &&
            targetParsed.status !== "corrected"
          ) {
            checks.push({
              name: "latest_pointer",
              passed: false,
              detail: `target edition has invalid status '${targetParsed.status}', expected 'published' or 'corrected'`,
            });
          } else {
            checks.push({
              name: "latest_pointer",
              passed: true,
              detail: `Pointer targets valid edition: ${indexLatest} (${targetParsed.status}, v${targetParsed.editionVersion})`,
            });
          }
        }
      }
    } else {
      if (publishedCount === 0) {
        checks.push({
          name: "latest_pointer",
          passed: true,
          detail: "No editions published yet (valid initial state)",
        });
      } else {
        checks.push({
          name: "latest_pointer",
          passed: false,
          detail: `Missing latest.json pointer file: ${options.indexFile}`,
        });
      }
    }
  } catch (err) {
    checks.push({
      name: "latest_pointer",
      passed: false,
      detail: `Failed parsing latest.json index: ${String(err)}`,
    });
  }

  // 4. Derive overall status
  const allPassed = checks.every((c) => c.passed);
  let status: SystemHealthStatus = "healthy";

  if (!allPassed) {
    const failedChecks = checks.filter((c) => !c.passed);
    const sourceRegistryFailed = failedChecks.some(
      (c) => c.name === "source_registry",
    );
    const pointerFailed = failedChecks.some((c) => c.name === "latest_pointer");

    if (sourceRegistryFailed && pointerFailed) {
      status = "offline";
    } else if (sourceRegistryFailed || activeSourceCount === 0) {
      status = "offline";
    } else if (pointerFailed) {
      status = "degraded";
    } else {
      status = "warning";
    }
  }

  const rawArtifact = {
    schemaVersion: 1 as const,
    generatedAt,
    status,
    latestEditionDate: indexLatest ?? latestDiscoveredDate,
    publishedEditionsCount: publishedCount,
    sources: {
      total: totalSourcesCount,
      active: activeSourceCount,
    },
    checks,
  };

  const artifact = statusArtifactSchema.parse(rawArtifact);

  if (!options.dryRun) {
    await Bun.write(options.outFile, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`✅ Status artifact written to ${options.outFile}`);
  }

  return artifact;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

  try {
    const artifact = await generateStatusArtifact(options);
    console.log(
      `📊 System Status: ${artifact.status.toUpperCase()} (latest: ${artifact.latestEditionDate ?? "none"})`,
    );
    for (const check of artifact.checks) {
      console.log(
        `   ${check.passed ? "✓" : "✗"} ${check.name}: ${check.detail ?? ""}`,
      );
    }
  } catch (error) {
    console.error("Fatal error generating status artifact:", error);
    process.exit(1);
  }
}

void main();
