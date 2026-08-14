/**
 * `bun run content:validate` -- the command that decides whether the content in
 * this repository may be read and whether it may be deployed.
 *
 * The path is named in `docs/PRD.md`, so it is a decision this file inherits
 * rather than makes. Everything else about it is deliberately thin: parse
 * arguments, find files, read them, hand the text to `@aaj-bas/domain`, print,
 * exit. No rule, no severity, no threshold, and no editorial judgement lives
 * here. What is wrong with an edition is a domain question and is answerable
 * without a filesystem; this file exists only because the domain package must
 * not touch one.
 *
 * There is no `--ignore-rule` flag and there must never be one. Section 45 says
 * a validation failure must never be converted into automatic success and
 * section 47 forbids bypassing CI, and a per-rule mute is exactly the mechanism
 * that does both -- once in a workflow file, it is invisible. A rule that is
 * wrong gets changed in a reviewed pull request, where the change is a diff
 * somebody reads.
 */

import type { EditionSource, ValidationPolicy } from "@aaj-bas/domain";
import {
  exitCodeFor,
  formatValidationText,
  toValidationReportJson,
  VALIDATION_EXIT_CODES,
  validateEditions,
} from "@aaj-bas/domain";

const USAGE = [
  "Usage:",
  "  bun run content:validate                    validate every edition",
  "  bun run content:validate <path> [<path>…]   validate exactly these files",
  "",
  "Options:",
  "  --json      write the machine-readable report to stdout",
  "  --publish   treat a not-publishable edition as a blocking failure",
].join("\n");

/**
 * The repository root, from this file's own location rather than from the
 * working directory, so the command validates the same content whether it is
 * run from the root, from `apps/web`, or from a CI step with its own cwd.
 */
const REPOSITORY_ROOT = collapse(`${import.meta.dir}/..`);
const EDITIONS_DIRECTORY = `${REPOSITORY_ROOT}/content/editions`;

type ParsedArguments =
  | {
      readonly ok: true;
      readonly json: boolean;
      readonly publish: boolean;
      readonly paths: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

function parseArguments(argv: readonly string[]): ParsedArguments {
  let json = false;
  let publish = false;
  const paths: string[] = [];

  for (const argument of argv) {
    if (argument === "--json") {
      json = true;
    } else if (argument === "--publish") {
      publish = true;
    } else if (argument.startsWith("-")) {
      // Rejected rather than ignored: an unrecognised flag is usually a
      // misspelled one, and silently dropping it would run a different check
      // from the one that was asked for and then report success.
      return { ok: false, message: `unknown option: ${argument}` };
    } else {
      paths.push(argument);
    }
  }

  return { ok: true, json, publish, paths };
}

/**
 * Every `*.json` in `content/editions`, sorted.
 *
 * `Glob.scan` promises no order, and an unordered report would make two runs of
 * the same content produce different output. The sort is the default one, which
 * compares UTF-16 code units: deterministic everywhere. `localeCompare` would
 * order by the runner's locale, which is precisely the dependency to avoid.
 */
async function discoverEditions(): Promise<readonly string[]> {
  const names: string[] = [];

  for await (const name of new Bun.Glob("*.json").scan({
    cwd: EDITIONS_DIRECTORY,
    onlyFiles: true,
  })) {
    names.push(name.replace(/\\/g, "/"));
  }

  names.sort();

  return names.map((name) => `${EDITIONS_DIRECTORY}/${name}`);
}

/** Resolve `.` and `..` and normalise separators, keeping any root prefix. */
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

function toAbsolute(path: string): string {
  const normalised = path.replace(/\\/g, "/");

  return /^(\/|[A-Za-z]:\/)/.test(normalised)
    ? collapse(normalised)
    : collapse(`${process.cwd()}/${normalised}`);
}

/**
 * Repository-relative with forward slashes, so a finding reads the same in a CI
 * log and on a contributor's machine. A file genuinely outside the repository
 * keeps its absolute path, because there is no honest relative name for it.
 */
function toRepositoryRelative(absolute: string): string {
  const prefix = `${REPOSITORY_ROOT}/`;

  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Why this path cannot be validated, or `undefined` when it can be.
 *
 * A misspelled filename and a directory named by mistake are operator errors and
 * exit as usage errors, so that exit code 4 keeps meaning "this tool has a
 * defect" -- section 37 asks for failure modes a caller can tell apart, and a
 * typo that exits the same way as an unexpected exception tells nobody anything.
 * Anything else the read may throw is left to the caller, which still treats it
 * as internal.
 */
async function unusablePath(file: string): Promise<string | undefined> {
  const name = toRepositoryRelative(file);
  try {
    if ((await Bun.file(file).stat()).isDirectory()) {
      return `not a file: ${name} is a directory`;
    }
  } catch {
    return `no such file: ${name}`;
  }
  return undefined;
}

async function run(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));

  if (!parsed.ok) {
    // Usage goes to stderr even in --json mode, so `content:validate --json >
    // report.json` never writes a diagnostic into the report file.
    console.error(parsed.message);
    console.error(USAGE);
    return VALIDATION_EXIT_CODES.usage;
  }

  const files =
    parsed.paths.length > 0
      ? parsed.paths.map(toAbsolute)
      : await discoverEditions();

  const sources: EditionSource[] = [];
  for (const file of files) {
    // A path named on the command line that is missing or is a directory is an
    // operator error, not a content finding: reporting it as a validation
    // failure would put it in the report as if the edition were malformed.
    const unusable = await unusablePath(file);
    if (unusable !== undefined) {
      console.error(unusable);
      console.error(USAGE);
      return VALIDATION_EXIT_CODES.usage;
    }

    try {
      sources.push({
        file: toRepositoryRelative(file),
        text: await Bun.file(file).text(),
      });
    } catch (error) {
      // The path was a readable file a moment ago, so whatever stopped the read
      // -- a permission, a device error, a race with something deleting it -- is
      // not something the caller can be told to fix.
      console.error(
        `INTERNAL: cannot read ${toRepositoryRelative(file)}: ${describe(error)}`,
      );
      return VALIDATION_EXIT_CODES.internal;
    }
  }

  const report = validateEditions(sources);
  const policy: ValidationPolicy = { publish: parsed.publish };

  console.log(
    parsed.json
      ? JSON.stringify(toValidationReportJson(report, policy), null, 2)
      : formatValidationText(report, policy),
  );

  return exitCodeFor(report, policy);
}

/**
 * The exit code is taken only after the run resolves. Setting it earlier -- or
 * exiting from inside the scan -- would end the process while reads were still
 * in flight and report a partial run as a whole one.
 */
let code: number = VALIDATION_EXIT_CODES.internal;
try {
  code = await run();
} catch (error) {
  console.error(`INTERNAL: ${describe(error)}`);
}
process.exit(code);
