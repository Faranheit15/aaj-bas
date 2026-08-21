/**
 * `bun run sources:validate` -- the command that decides whether the source
 * registry in this repository may be fetched from.
 *
 * It is `validate-edition.ts` pointed at a different file, and deliberately as
 * thin: parse arguments, find the file, read it, parse the YAML, hand the value
 * to `@aaj-bas/domain`, print, exit. No rule, no severity, and no judgement
 * about what makes a source fetchable lives here. Which entries may be fetched
 * is a domain question and is answerable without a filesystem; this file exists
 * only because the domain package must not touch one.
 *
 * One deviation from its sibling, recorded in ADR-0012. The validation entry
 * point takes a parsed value rather than the file's text, because the registry
 * is YAML, `Bun.YAML.parse` is the parser, and `Bun` is undefined under Vitest.
 * So the parse happens here and the judgement happens there -- the same split
 * `stage-content.ts` and `planStaging` already use.
 *
 * There is no `--force`, no `--ignore-rule`, and no per-rule mute, and there
 * must never be one. Section 45 says a validation failure must never be
 * converted into automatic success and section 47 forbids bypassing CI, and a
 * per-rule mute is exactly the mechanism that does both -- once in a workflow
 * file, it is invisible. That is sharper here than for an edition: every rule
 * this command enforces is the record of a human having read a publisher's
 * terms, or the classification of a host something will later fetch, and a flag
 * that silences either is the flag that publishes an unreviewed source. A rule
 * that is wrong gets changed in a reviewed pull request, where the change is a
 * diff somebody reads.
 */

import type { RegistrySource } from "@aaj-bas/domain";
import {
  formatRegistryText,
  parseSourcesCommand,
  REGISTRY_EXIT_CODES,
  registryExitCodeFor,
  toRegistryReportJson,
  validateSourceRegistries,
} from "@aaj-bas/domain";

const USAGE = [
  "Usage:",
  "  bun run sources:validate                    validate content/sources.yml",
  "  bun run sources:validate <path> [<path>…]   validate exactly these files",
  "",
  "Options:",
  "  --json      write the machine-readable report to stdout",
].join("\n");

/**
 * The repository root, from this file's own location rather than from the
 * working directory, so the command validates the same registry whether it is
 * run from the root, from `apps/web`, or from a CI step with its own cwd.
 */
const REPOSITORY_ROOT = collapse(`${import.meta.dir}/..`);
const DEFAULT_REGISTRY = `${REPOSITORY_ROOT}/content/sources.yml`;

/**
 * The default registry, or nothing when the repository carries none.
 *
 * A missing `content/sources.yml` is not an operator error the way a mistyped
 * path is -- nobody named it -- so it is reported as a run that matched no
 * file. The domain already answers that case: an empty list produces a report
 * whose summary is "no source registry to validate" and whose exit code is
 * `nothingValidated`. Section 37 wants "nothing was checked" told apart from
 * "something is wrong", and this is the seam where the two would otherwise be
 * confused.
 */
async function discoverRegistry(): Promise<readonly string[]> {
  try {
    return (await Bun.file(DEFAULT_REGISTRY).stat()).isDirectory()
      ? []
      : [DEFAULT_REGISTRY];
  } catch {
    return [];
  }
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
  const parsed = parseSourcesCommand(process.argv.slice(2));

  if (!parsed.ok) {
    // Usage goes to stderr even in --json mode, so `sources:validate --json >
    // report.json` never writes a diagnostic into the report file.
    console.error(parsed.message);
    console.error(USAGE);
    return REGISTRY_EXIT_CODES.usage;
  }

  const files =
    parsed.paths.length > 0
      ? parsed.paths.map(toAbsolute)
      : await discoverRegistry();

  const sources: RegistrySource[] = [];
  for (const file of files) {
    // A path named on the command line that is missing or is a directory is an
    // operator error, not a registry finding: reporting it as a validation
    // failure would put it in the report as if the registry were malformed.
    const unusable = await unusablePath(file);
    if (unusable !== undefined) {
      console.error(unusable);
      console.error(USAGE);
      return REGISTRY_EXIT_CODES.usage;
    }

    let text: string;
    try {
      text = await Bun.file(file).text();
    } catch (error) {
      // The path was a readable file a moment ago, so whatever stopped the read
      // -- a permission, a device error, a race with something deleting it -- is
      // not something the caller can be told to fix.
      console.error(
        `INTERNAL: cannot read ${toRepositoryRelative(file)}: ${describe(error)}`,
      );
      return REGISTRY_EXIT_CODES.internal;
    }

    try {
      sources.push({
        file: toRepositoryRelative(file),
        value: Bun.YAML.parse(text),
      });
    } catch (error) {
      // A document that never became a value has no entries to report findings
      // against, so it cannot travel into the report the way a schema failure
      // does. It is still a blocking failure and is reported as one: a file
      // this command could not read is emphatically not a file that held
      // nothing, and treating it as `nothingValidated` would let a corrupted
      // registry look like an empty one. The message goes to stderr for the
      // same reason the usage text does.
      console.error(
        `FAIL: ${toRepositoryRelative(file)} is not valid YAML: ${describe(error)}`,
      );
      return REGISTRY_EXIT_CODES.blocking;
    }
  }

  const report = validateSourceRegistries(sources);

  console.log(
    parsed.json
      ? JSON.stringify(toRegistryReportJson(report), null, 2)
      : formatRegistryText(report),
  );

  return registryExitCodeFor(report);
}

/**
 * The exit code is taken only after the run resolves. Setting it earlier -- or
 * exiting from inside the loop -- would end the process while reads were still
 * in flight and report a partial run as a whole one.
 */
let code: number = REGISTRY_EXIT_CODES.internal;
try {
  code = await run();
} catch (error) {
  console.error(`INTERNAL: ${describe(error)}`);
}
process.exit(code);
