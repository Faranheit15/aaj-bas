/**
 * `bun run content:stage` -- the step that copies validated editions out of
 * `content/` and into the web application's build, and `--verify-index`, which
 * reads a built pointer back.
 *
 * It is the filesystem half of AB-201 and holds no judgement of its own. What
 * is wrong with an edition is answered by `validateEditions`, which editions a
 * build may carry by `planStaging`, and which already-staged files must be
 * deleted first by `planRemoval`; all three live in `@aaj-bas/domain`, are pure,
 * and are tested as values. This file discovers files, reads them, executes the
 * plan, prints, and exits, exactly as `validate-edition.ts` does for the
 * validation command.
 *
 * Two behaviours here are load-bearing rather than incidental, and both are
 * commented where they happen: the staging directory is emptied of anything
 * this run will not write, and staged editions are copied byte for byte rather
 * than re-serialised.
 *
 * `--verify-index <path>` is the same split pointed at a build rather than at
 * `content/`: it reads one file and asks `validateStagedIndex` whether a reader
 * could read it. It exists because the deploy gate re-checks every staged
 * edition and nothing re-checked the document that points at them -- and a
 * corrupt pointer is not one broken edition but a site-wide failure, since it
 * is the first request every reader makes. It writes nothing and deletes
 * nothing, so it is safe to run against a directory that is about to ship.
 *
 * There is no `--force` and there must never be one. A blocking finding stops
 * the build (section 37: a failure may not become an empty success), and a flag
 * that staged content anyway would be the automatic-success conversion section
 * 45 forbids. `--include-sample-data` is not that flag: it relaxes who may see
 * invented content, never whether the content is correct.
 */

import type {
  EditionSource,
  StagingMode,
  StagingPlan,
  StagingRemoval,
} from "@aaj-bas/domain";
import {
  formatValidationText,
  planRemoval,
  planStaging,
  VALIDATION_EXIT_CODES,
  validateEditions,
  validateStagedIndex,
} from "@aaj-bas/domain";

const USAGE = [
  "Usage:",
  "  bun run content:stage                       stage publishable editions",
  "  bun run content:stage --verify-index <path> check a built index is readable",
  "",
  "Options:",
  "  --include-sample-data   also stage editions flagged as sample data,",
  "                          for local development only",
].join("\n");

/**
 * The repository root, from this file's own location rather than from the
 * working directory, so the command stages the same content whether it is run
 * from the root, from `apps/web` (where `bun run dev` runs it), or from a CI
 * step with its own cwd.
 */
const REPOSITORY_ROOT = collapse(`${import.meta.dir}/..`);
const EDITIONS_DIRECTORY = `${REPOSITORY_ROOT}/content/editions`;

/**
 * Vite copies `public/` into `dist/` verbatim, so this is where a static asset
 * has to land to be served at `/content/...`. The directory is git-ignored: it
 * is a build artifact, and committing it would give every edition two versions
 * that can disagree.
 */
const STAGING_DIRECTORY = `${REPOSITORY_ROOT}/apps/web/public/content`;
const INDEX_FILE = "latest.json";

/**
 * The two things this file can be asked to do.
 *
 * Kept as a union rather than as a flag on one options object, because they
 * share no arguments and touch different directories: staging writes into
 * `apps/web/public/content` from `content/`, verification reads one file
 * anywhere and changes nothing.
 */
type Command =
  | { readonly kind: "stage"; readonly mode: StagingMode }
  | { readonly kind: "verify"; readonly index: string };

type ParsedArguments =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly message: string };

function parseArguments(argv: readonly string[]): ParsedArguments {
  if (argv[0] === "--verify-index") {
    const index = argv[1];

    // Exactly one path, and no other option alongside it: this command has no
    // relationship to `--include-sample-data`, and accepting a combination it
    // ignores would answer a question nobody asked.
    if (index === undefined || argv.length > 2) {
      return {
        ok: false,
        message: "--verify-index takes exactly one path",
      };
    }

    return { ok: true, command: { kind: "verify", index } };
  }

  let mode: StagingMode = "published";

  for (const argument of argv) {
    if (argument === "--include-sample-data") {
      mode = "sample";
    } else {
      // Rejected rather than ignored, including bare paths: staging is always
      // the whole of `content/editions`, because an index built from a subset
      // would point at fewer editions than the archive actually has. Silently
      // dropping an argument would run a different command from the one asked
      // for and then report success.
      return { ok: false, message: `unknown option: ${argument}` };
    }
  }

  return { ok: true, command: { kind: "stage", mode } };
}

/**
 * Every `*.json` in `content/editions`, sorted.
 *
 * `Glob.scan` promises no order, and an unordered read would let two runs of
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

  return names;
}

/**
 * Every file already staged, relative to the staging directory, sorted.
 *
 * Every file, not every `*.json`. `public/` is copied into the build verbatim,
 * so a `.json.bak` left by an editor, a swap file, or a stray note is published
 * exactly as a stale edition would be. A sweep that matched only the extension
 * this command writes could never remove anything else, and the residue would
 * ship on every build from then on.
 */
async function discoverStaged(): Promise<readonly string[]> {
  // Missing on a clean checkout, which is the ordinary first-run state and not
  // a failure: `Glob.scan` would throw ENOENT, so the directory is checked
  // rather than the error swallowed.
  if (!(await isDirectory(STAGING_DIRECTORY))) {
    return [];
  }

  const names: string[] = [];

  // `dot: true` because the residue most likely to be missed is hidden: editor
  // swap and lock files are dotfiles, and the default scan would walk past them.
  for await (const name of new Bun.Glob("**/*").scan({
    cwd: STAGING_DIRECTORY,
    onlyFiles: true,
    dot: true,
  })) {
    names.push(name.replace(/\\/g, "/"));
  }

  names.sort();

  return names;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
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

/**
 * Repository-relative with forward slashes, so a line reads the same in a CI
 * log and on a contributor's machine.
 */
function toRepositoryRelative(absolute: string): string {
  const prefix = `${REPOSITORY_ROOT}/`;

  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

const STAGING_NAME = toRepositoryRelative(STAGING_DIRECTORY);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Removes every staged file this run is not about to write.
 *
 * Which files those are is `planRemoval`'s decision, and it is tested there
 * against a set of names rather than against a directory: that a staging run
 * never names a path outside `apps/web/public/content`, and never deletes a
 * file it is about to write, are the two properties worth holding, and neither
 * needs a filesystem to assert. What is left here is the deleting.
 *
 * It runs before the writes, so a file being replaced is deleted and rewritten
 * rather than left behind by a mistaken skip.
 */
async function removeStale(keep: ReadonlySet<string>): Promise<StagingRemoval> {
  const removal = planRemoval(await discoverStaged(), keep);

  for (const name of removal.remove) {
    await Bun.file(`${STAGING_DIRECTORY}/${name}`).delete();
  }

  return removal;
}

async function stage(plan: StagingPlan): Promise<void> {
  for (const edition of plan.staged) {
    // Copied byte for byte, never re-serialised through `JSON.parse` and
    // `JSON.stringify`. The deployed file has to be identical to the file a
    // human reviewed and merged, so that no formatting change, key reordering,
    // or number-precision quirk can alter published content on its way to a
    // reader. `Bun.write` creates the parent directory.
    await Bun.write(
      `${STAGING_DIRECTORY}/editions/${edition.date}.json`,
      Bun.file(`${REPOSITORY_ROOT}/${edition.file}`),
    );
  }

  // The index is genuinely generated here, so it is serialised here -- and only
  // from the plan, so it cannot name an edition that was not staged above.
  await Bun.write(
    `${STAGING_DIRECTORY}/${INDEX_FILE}`,
    `${JSON.stringify(plan.index, null, 2)}\n`,
  );
}

function reportLines(
  plan: StagingPlan,
  removal: StagingRemoval,
): readonly string[] {
  const lines: string[] = [];

  for (const edition of plan.staged) {
    lines.push(`OK: ${edition.file} ${edition.date} staged`);
  }

  for (const edition of plan.skipped) {
    lines.push(`WARN: ${edition.file} withheld`);
    lines.push(`  ${edition.reason}`);
  }

  if (removal.remove.length > 0) {
    lines.push(
      `OK: removed ${plural(removal.remove.length, "stale file")} from ${STAGING_NAME}`,
    );
  }

  // Never seen from a directory scan, which produces plain relative names.
  // Reported rather than dropped anyway: a file the sweep declined to touch is
  // residue that the next build will deploy, so the run that left it there is
  // the only place a human can find out.
  for (const name of removal.refused) {
    lines.push(`WARN: left ${name} in place; it is not a name this run wrote.`);
  }

  const skipped = plural(plan.skipped.length, "edition");

  // Zero staged editions is a legitimate outcome, not a failure. Before the
  // first real edition is published there is genuinely nothing to deploy, and
  // `content:validate` -- which does treat an empty run as a failure, because a
  // validator that validated nothing must not pass -- has already run above.
  // The index says so honestly and the reader renders its no-edition state.
  if (plan.staged.length === 0) {
    lines.push(
      `WARN: nothing staged into ${STAGING_NAME}; ${skipped} withheld.`,
    );
    lines.push(
      "  The index points at no edition, so the reader will render its no-edition state.",
    );
    return lines;
  }

  return [
    ...lines,
    `OK: ${plural(plan.staged.length, "edition")} staged into ${STAGING_NAME}; ${skipped} withheld.`,
    `  Content set ${plan.index.contentSet}, latest ${plan.index.latest}.`,
  ];
}

/**
 * Reads a built index and reports whether a reader could read it.
 *
 * A failure is `blocking` rather than `internal` whatever went wrong with the
 * file, because the caller is a deploy gate and the answer it needs is the
 * same: this build must not ship. The distinction between an unreadable file
 * and an invalid one is in the message, where it is actionable.
 */
async function verifyIndex(path: string): Promise<number> {
  let text: string;

  try {
    text = await Bun.file(path).text();
  } catch (error) {
    console.error(`FAIL: cannot read ${path}: ${describe(error)}`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  const checked = validateStagedIndex(text);

  if (!checked.ok) {
    console.error(`FAIL: ${path} is not an index this reader could read.`);
    for (const problem of checked.problems) {
      console.error(`  ${problem}`);
    }
    return VALIDATION_EXIT_CODES.blocking;
  }

  // An index pointing at nothing is a legitimate build, so it is reported as
  // such rather than as a failure: before the first edition is published the
  // reader renders its no-edition state from exactly this document.
  console.log(
    `OK: ${path} points at ${checked.index.latest ?? "no edition"}; ${plural(checked.index.editions.length, "edition")} listed.`,
  );

  return VALIDATION_EXIT_CODES.ok;
}

async function stageContent(mode: StagingMode): Promise<number> {
  const sources: EditionSource[] = [];
  for (const name of await discoverEditions()) {
    const file = `${EDITIONS_DIRECTORY}/${name}`;
    try {
      sources.push({
        file: toRepositoryRelative(file),
        text: await Bun.file(file).text(),
      });
    } catch (error) {
      // The glob listed it a moment ago, so whatever stopped the read -- a
      // permission, a device error, a race with something deleting it -- is not
      // something the caller can be told to fix.
      console.error(
        `INTERNAL: cannot read ${toRepositoryRelative(file)}: ${describe(error)}`,
      );
      return VALIDATION_EXIT_CODES.internal;
    }
  }

  const report = validateEditions(sources);

  if (report.blockingCount > 0) {
    // A broken edition fails the build rather than being quietly left out of
    // it: a deployment that silently shipped nine of ten editions would look
    // exactly like a day with nine editions. Nothing has been written or
    // deleted at this point, so the previously staged content survives, which
    // is what section 45 asks of a failed run.
    console.error(formatValidationText(report, { publish: false }));
    console.error(`FAIL: nothing staged into ${STAGING_NAME}.`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  const plan = planStaging(report, mode);

  const keep = new Set<string>([
    INDEX_FILE,
    ...plan.staged.map((edition) => `editions/${edition.date}.json`),
  ]);

  let removal: StagingRemoval;
  try {
    removal = await removeStale(keep);
    await stage(plan);
  } catch (error) {
    // A partial write leaves the staging directory in a state nobody chose, so
    // it is reported as internal rather than absorbed. The next successful run
    // rebuilds the directory from scratch.
    console.error(
      `INTERNAL: cannot stage into ${STAGING_NAME}: ${describe(error)}`,
    );
    return VALIDATION_EXIT_CODES.internal;
  }

  console.log(reportLines(plan, removal).join("\n"));

  return VALIDATION_EXIT_CODES.ok;
}

async function run(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));

  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(USAGE);
    return VALIDATION_EXIT_CODES.usage;
  }

  return parsed.command.kind === "verify"
    ? verifyIndex(parsed.command.index)
    : stageContent(parsed.command.mode);
}

/**
 * The exit code is taken only after the run resolves. Setting it earlier -- or
 * exiting from inside the scan -- would end the process while reads and writes
 * were still in flight and report a partial run as a whole one.
 */
let code: number = VALIDATION_EXIT_CODES.internal;
try {
  code = await run();
} catch (error) {
  console.error(`INTERNAL: ${describe(error)}`);
}
process.exit(code);
