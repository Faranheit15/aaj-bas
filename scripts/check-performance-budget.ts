#!/usr/bin/env bun
/**
 * CLI script to enforce application performance budgets (AB-902).
 *
 * Checks:
 * - apps/landing client JS gzip size <= 80 kB (PRD total budget 200 kB)
 * - apps/web client JS gzip size <= 150 kB (PRD total budget 200 kB)
 * - apps/web client CSS gzip size <= 25 kB
 * - content/editions/*.json uncompressed size <= 150 kB (PRD section 17)
 * - content/editions/*.json gzip size <= 50 kB
 */

interface BudgetConfig {
  landingJsGzipMaxBytes: number;
  webJsGzipMaxBytes: number;
  webCssGzipMaxBytes: number;
  editionJsonMaxBytes: number;
  editionJsonGzipMaxBytes: number;
}

const BUDGETS: BudgetConfig = {
  landingJsGzipMaxBytes: 80 * 1024, // 80 kB
  webJsGzipMaxBytes: 150 * 1024, // 150 kB
  webCssGzipMaxBytes: 25 * 1024, // 25 kB
  editionJsonMaxBytes: 150 * 1024, // 150 kB
  editionJsonGzipMaxBytes: 50 * 1024, // 50 kB
};

interface BudgetFinding {
  target: string;
  metric: string;
  actualBytes: number;
  maxBytes: number;
  passed: boolean;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} kB (${bytes} bytes)`;
}

async function inspectDirFiles(
  dir: string,
  globPattern: string,
): Promise<{ path: string; bytes: number; gzipBytes: number }[]> {
  const results: { path: string; bytes: number; gzipBytes: number }[] = [];
  try {
    for await (const file of new Bun.Glob(globPattern).scan({
      cwd: dir,
      onlyFiles: true,
    })) {
      const fullPath = `${dir}/${file}`;
      const arrayBuffer = await Bun.file(fullPath).arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const gzipped = Bun.gzipSync(uint8);
      results.push({
        path: fullPath,
        bytes: uint8.byteLength,
        gzipBytes: gzipped.byteLength,
      });
    }
  } catch {
    // Directory might not exist if not built yet
  }
  return results;
}

export async function checkPerformanceBudgets(): Promise<{
  passed: boolean;
  findings: BudgetFinding[];
}> {
  const findings: BudgetFinding[] = [];

  // 1. Landing JS bundles
  const landingJs = await inspectDirFiles("apps/landing/dist/assets", "*.js");
  for (const item of landingJs) {
    findings.push({
      target: item.path,
      metric: "JS gzip size",
      actualBytes: item.gzipBytes,
      maxBytes: BUDGETS.landingJsGzipMaxBytes,
      passed: item.gzipBytes <= BUDGETS.landingJsGzipMaxBytes,
    });
  }

  // 2. Web JS bundles
  const webJs = await inspectDirFiles("apps/web/dist/assets", "*.js");
  for (const item of webJs) {
    findings.push({
      target: item.path,
      metric: "JS gzip size",
      actualBytes: item.gzipBytes,
      maxBytes: BUDGETS.webJsGzipMaxBytes,
      passed: item.gzipBytes <= BUDGETS.webJsGzipMaxBytes,
    });
  }

  // 3. Web CSS bundles
  const webCss = await inspectDirFiles("apps/web/dist/assets", "*.css");
  for (const item of webCss) {
    findings.push({
      target: item.path,
      metric: "CSS gzip size",
      actualBytes: item.gzipBytes,
      maxBytes: BUDGETS.webCssGzipMaxBytes,
      passed: item.gzipBytes <= BUDGETS.webCssGzipMaxBytes,
    });
  }

  // 4. Edition JSON payloads
  const editions = await inspectDirFiles("content/editions", "*.json");
  for (const item of editions) {
    findings.push({
      target: item.path,
      metric: "Edition JSON uncompressed size",
      actualBytes: item.bytes,
      maxBytes: BUDGETS.editionJsonMaxBytes,
      passed: item.bytes <= BUDGETS.editionJsonMaxBytes,
    });
    findings.push({
      target: item.path,
      metric: "Edition JSON gzip size",
      actualBytes: item.gzipBytes,
      maxBytes: BUDGETS.editionJsonGzipMaxBytes,
      passed: item.gzipBytes <= BUDGETS.editionJsonGzipMaxBytes,
    });
  }

  const allPassed = findings.length > 0 && findings.every((f) => f.passed);
  return { passed: allPassed, findings };
}

async function main(): Promise<void> {
  console.log("🔍 Checking performance budgets (AB-902)...\n");

  const { passed, findings } = await checkPerformanceBudgets();

  if (findings.length === 0) {
    console.error(
      "❌ No built assets found. Run `bun run build` before checking performance budgets.",
    );
    process.exit(1);
  }

  for (const f of findings) {
    const icon = f.passed ? "✅" : "❌";
    console.log(
      `${icon} ${f.target} (${f.metric}): ${formatBytes(f.actualBytes)} / max ${formatBytes(f.maxBytes)}`,
    );
  }

  if (!passed) {
    console.error("\n❌ Performance budget violation(s) detected!");
    process.exit(1);
  }

  console.log("\n🎉 All performance budgets satisfied!");
  process.exit(0);
}

void main();
