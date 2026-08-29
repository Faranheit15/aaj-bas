/**
 * bun run sources:fetch -- fetch the registry entries the validator approved.
 *
 * The command owns I/O only. The domain package has already decided which
 * entries are fetchable and which response policy applies; this file supplies
 * DNS and HTTPS implementations for that contract and never prints feed bytes.
 *
 * The request does not use fetch(). Node's HTTPS client accepts a custom
 * lookup function, which lets the request connect through the exact addresses
 * the domain package checked. That is the transport obligation in ADR-0012:
 * resolving a hostname and then letting another resolver choose the socket
 * would leave a DNS-rebinding gap.
 */

import { PRODUCTION_ENVIRONMENT } from "./fetch-environment";
import type {
  FetchableSource,
  RegistrySource,
  SourceRegistry,
} from "@aaj-bas/domain";
import {
  evaluateSourceHealth,
  fetchFeed,
  fetchableSourcesOf,
  formatRegistryText,
  formatSourceHealthJson,
  formatSourceHealthMarkdown,
  formatSourceHealthText,
  parseFetchSourcesCommand,
  registryExitCodeFor,
  REGISTRY_EXIT_CODES,
  type SourceFetchResultInput,
  sourceRegistrySchema,
  toRegistryReportJson,
  validateSourceRegistries,
} from "@aaj-bas/domain";

const REPOSITORY_ROOT = collapse(`${import.meta.dir}/..`);
const DEFAULT_REGISTRY = `${REPOSITORY_ROOT}/content/sources.yml`;

const USAGE = [
  "Usage:",
  "  bun run sources:fetch                    fetch content/sources.yml",
  "  bun run sources:fetch <path> [<path>...] fetch exactly these files",
  "",
  "Options:",
  "  --json       write health report to stdout as JSON",
  "  --markdown   write health report to stdout as Markdown",
  "  --summary    write summary Markdown to $GITHUB_STEP_SUMMARY or path",
].join("\n");

async function run(): Promise<number> {
  const parsed = parseFetchSourcesCommand(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(USAGE);
    return REGISTRY_EXIT_CODES.usage;
  }

  const files =
    parsed.paths.length === 0
      ? await discoverRegistry()
      : parsed.paths.map(toAbsolute);
  const sources = await readRegistries(files, parsed.paths.length > 0);
  if (!sources.ok) {
    console.error(sources.message);
    console.error(USAGE);
    return sources.code;
  }

  const report = validateSourceRegistries(sources.value);
  const validationCode = registryExitCodeFor(report);
  if (validationCode !== REGISTRY_EXIT_CODES.ok) {
    printValidation(report, parsed.json);
    return validationCode;
  }

  const registries = new Map<string, SourceRegistry>();
  for (const source of sources.value) {
    const result = sourceRegistrySchema.safeParse(source.value);
    if (result.success) {
      registries.set(source.file, result.data);
    }
  }

  const approved: FetchableSource[] = [];
  for (const validation of report.registries) {
    const registry = registries.get(validation.file);
    if (registry !== undefined) {
      approved.push(...fetchableSourcesOf(registry, validation.sources));
    }
  }

  if (report.warningCount > 0 && !parsed.json && !parsed.markdown) {
    console.error(formatRegistryText(report));
  }

  const measuredResults: SourceFetchResultInput[] = [];
  for (const source of approved) {
    const start = performance.now();
    const result = await fetchFeed(
      source,
      PRODUCTION_ENVIRONMENT,
      new Map().get(source.entry.id) ?? {},
    );
    const durationMs = Math.round(performance.now() - start);
    measuredResults.push({
      ...result,
      durationMs,
    });
  }

  const healthReport = evaluateSourceHealth(measuredResults, undefined);

  if (parsed.json) {
    console.log(formatSourceHealthJson(healthReport));
  } else if (parsed.markdown) {
    console.log(formatSourceHealthMarkdown(healthReport));
  } else {
    console.log(formatSourceHealthText(healthReport));
  }

  const stepSummaryTarget =
    parsed.summaryPath !== null && parsed.summaryPath !== ""
      ? parsed.summaryPath
      : process.env.GITHUB_STEP_SUMMARY;

  if (
    stepSummaryTarget &&
    (parsed.summaryPath !== null || process.env.GITHUB_STEP_SUMMARY)
  ) {
    try {
      const existing = await Bun.file(stepSummaryTarget)
        .text()
        .catch(() => "");
      const separator =
        existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
      await Bun.write(
        stepSummaryTarget,
        `${existing}${separator}${formatSourceHealthMarkdown(healthReport)}\n`,
      );
    } catch (error) {
      console.error(
        `WARN: failed to write step summary to ${stepSummaryTarget}: ${describe(error)}`,
      );
    }
  }

  return healthReport.failingCount > 0
    ? REGISTRY_EXIT_CODES.blocking
    : REGISTRY_EXIT_CODES.ok;
}

async function discoverRegistry(): Promise<readonly string[]> {
  try {
    return (await Bun.file(DEFAULT_REGISTRY).stat()).isDirectory()
      ? []
      : [DEFAULT_REGISTRY];
  } catch {
    return [];
  }
}

async function readRegistries(
  files: readonly string[],
  explicit: boolean,
): Promise<
  | { readonly ok: true; readonly value: readonly RegistrySource[] }
  | { readonly ok: false; readonly code: number; readonly message: string }
> {
  const sources: RegistrySource[] = [];
  for (const file of files) {
    try {
      if ((await Bun.file(file).stat()).isDirectory()) {
        return {
          ok: false,
          code: REGISTRY_EXIT_CODES.usage,
          message:
            "not a file: " + toRepositoryRelative(file) + " is a directory",
        };
      }
    } catch {
      if (explicit) {
        return {
          ok: false,
          code: REGISTRY_EXIT_CODES.usage,
          message: "no such file: " + toRepositoryRelative(file),
        };
      }
      continue;
    }

    let text: string;
    try {
      text = await Bun.file(file).text();
    } catch (error) {
      return {
        ok: false,
        code: REGISTRY_EXIT_CODES.internal,
        message:
          "INTERNAL: cannot read " +
          toRepositoryRelative(file) +
          ": " +
          describe(error),
      };
    }

    try {
      sources.push({
        file: toRepositoryRelative(file),
        value: Bun.YAML.parse(text),
      });
    } catch (error) {
      return {
        ok: false,
        code: REGISTRY_EXIT_CODES.blocking,
        message:
          "FAIL: " +
          toRepositoryRelative(file) +
          " is not valid YAML: " +
          describe(error),
      };
    }
  }
  return { ok: true, value: sources };
}

function printValidation(
  report: ReturnType<typeof validateSourceRegistries>,
  json: boolean,
): void {
  console.log(
    json
      ? JSON.stringify(toRegistryReportJson(report), null, 2)
      : formatRegistryText(report),
  );
}

function toAbsolute(path: string): string {
  const normalised = path.replace(/\\/g, "/");
  const isWindowsAbsolute =
    normalised.length >= 3 && normalised[1] === ":" && normalised[2] === "/";
  return normalised.startsWith("/") || isWindowsAbsolute
    ? collapse(normalised)
    : collapse(process.cwd() + "/" + normalised);
}

function toRepositoryRelative(absolute: string): string {
  const prefix = REPOSITORY_ROOT + "/";
  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

function collapse(path: string): string {
  const normalised = path.replace(/\\/g, "/");
  const root = /^(\/|[A-Za-z]:\/)/.exec(normalised)?.[0] ?? "";
  const segments: string[] = [];

  for (const segment of normalised.slice(root.length).split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." && segments.length > 0) {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return root + segments.join("/");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let code: number = REGISTRY_EXIT_CODES.internal;
try {
  code = await run();
} catch (error) {
  console.error(`INTERNAL: ${describe(error)}`);
}
process.exit(code);
